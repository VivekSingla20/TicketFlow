const { getRedisClient, getSubscriberClient } = require('../cache/redis.client');
const jwt = require('jsonwebtoken');
const config = require('../config');
const logger = require('../utils/logger');

// Set of active socket connections in this process
const activeConnections = new Set();
const REDIS_CHANNEL = 'ws-broadcast';

/**
 * Initialize the Redis subscriber to listen for cross-process WebSocket broadcasts.
 */
function initializeWebSocket() {
  const sub = getSubscriberClient();

  sub.subscribe(REDIS_CHANNEL, (err) => {
    if (err) {
      logger.error('Failed to subscribe to Redis broadcast channel', { service: 'websocket', error: err.message });
      return;
    }
    logger.info('Subscribed to Redis broadcast channel', { service: 'websocket' });
  });

  sub.on('message', (channel, message) => {
    if (channel !== REDIS_CHANNEL) return;

    try {
      const { room, event, data } = JSON.parse(message);
      
      // Broadcast to matching local connections
      for (const socket of activeConnections) {
        if (socket.rooms.has(room)) {
          if (socket.readyState === 1) { // WebSocket.OPEN
            socket.send(JSON.stringify({ event, data }));
          }
        }
      }
    } catch (err) {
      logger.error('Error handling Redis pub/sub message', { service: 'websocket', error: err.message });
    }
  });
}

/**
 * Handle a new connection from Fastify WebSocket plugin
 */
function handleConnection(connection, req) {
  const { socket } = connection;

  // Extract token from query params or headers
  const url = new URL(req.url, 'http://localhost');
  const token = url.searchParams.get('token');

  if (!token) {
    logger.warn('WebSocket connection attempt rejected: missing token', { service: 'websocket' });
    socket.close(4001, 'Authentication required');
    return;
  }

  try {
    const decoded = jwt.verify(token, config.auth.jwtSecret);
    socket.userId = decoded.sub;
    socket.userEmail = decoded.email;
    socket.userRole = decoded.role;
  } catch (err) {
    logger.warn('WebSocket connection attempt rejected: invalid token', { service: 'websocket', error: err.message });
    socket.close(4002, 'Invalid token');
    return;
  }

  // Initialize socket rooms list
  socket.rooms = new Set();
  socket.rooms.add(`user:${socket.userId}`); // Private room for user notifications

  activeConnections.add(socket);

  logger.info('WebSocket client connected', {
    service: 'websocket',
    userId: socket.userId,
    userEmail: socket.userEmail,
  });

  socket.on('message', (message) => {
    try {
      const parsed = JSON.parse(message.toString());
      const { event, room } = parsed;

      if (event === 'join' && typeof room === 'string') {
        socket.rooms.add(room);
        logger.debug('Client joined room', { service: 'websocket', userId: socket.userId, room });
      } else if (event === 'leave' && typeof room === 'string') {
        socket.rooms.delete(room);
        logger.debug('Client left room', { service: 'websocket', userId: socket.userId, room });
      }
    } catch (err) {
      logger.warn('Error parsing client socket message', { service: 'websocket', error: err.message });
    }
  });

  socket.on('close', () => {
    activeConnections.delete(socket);
    logger.info('WebSocket client disconnected', {
      service: 'websocket',
      userId: socket.userId,
    });
  });

  socket.on('error', (err) => {
    logger.error('WebSocket client error', {
      service: 'websocket',
      userId: socket.userId,
      error: err.message,
    });
  });
}

/**
 * Publish a message to Redis so all active server processes broadcast it to subscribers.
 */
async function broadcast(room, event, data) {
  try {
    const redis = getRedisClient();
    const payload = JSON.stringify({ room, event, data });
    await redis.publish(REDIS_CHANNEL, payload);
  } catch (err) {
    logger.error('Failed to publish socket broadcast to Redis', { service: 'websocket', error: err.message });
  }
}

module.exports = {
  initializeWebSocket,
  handleConnection,
  broadcast,
};
