const Redis = require('ioredis');
const config = require('../config');
const logger = require('../utils/logger');

let redisClient = null;
let subscriberClient = null;

/**
 * Parse Redis URL and create connection options.
 */
function parseRedisOptions(url) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname || 'localhost',
    port: parseInt(parsed.port, 10) || 6379,
    password: parsed.password || undefined,
    db: parseInt(parsed.pathname.slice(1), 10) || 0,
    maxRetriesPerRequest: null, // Required for BullMQ
    retryStrategy(times) {
      const delay = Math.min(times * 200, 5000);
      logger.warn(`Redis connection retry #${times}, next attempt in ${delay}ms`);
      return delay;
    },
    reconnectOnError(err) {
      const targetError = 'READONLY';
      if (err.message.includes(targetError)) {
        return true;
      }
      return false;
    },
  };
}

/**
 * Get or create the main Redis client (for cache, locks, rate limiting).
 */
function getRedisClient() {
  if (!redisClient) {
    const opts = parseRedisOptions(config.redis.url);
    redisClient = new Redis(opts);

    redisClient.on('connect', () => {
      logger.info('Redis client connected', { service: 'redis' });
    });

    redisClient.on('error', (err) => {
      logger.error('Redis client error', { service: 'redis', error: err.message });
    });

    redisClient.on('close', () => {
      logger.warn('Redis client connection closed', { service: 'redis' });
    });
  }
  return redisClient;
}

/**
 * Get or create a separate subscriber client (for Socket.io Redis adapter).
 * Socket.io requires a dedicated connection because subscriber mode
 * blocks the client from issuing regular commands.
 */
function getSubscriberClient() {
  if (!subscriberClient) {
    const opts = parseRedisOptions(config.redis.url);
    subscriberClient = new Redis(opts);

    subscriberClient.on('connect', () => {
      logger.info('Redis subscriber client connected', { service: 'redis' });
    });

    subscriberClient.on('error', (err) => {
      logger.error('Redis subscriber client error', { service: 'redis', error: err.message });
    });
  }
  return subscriberClient;
}

/**
 * Gracefully close all Redis connections.
 */
async function closeRedis() {
  const promises = [];
  if (redisClient) {
    promises.push(redisClient.quit());
    redisClient = null;
  }
  if (subscriberClient) {
    promises.push(subscriberClient.quit());
    subscriberClient = null;
  }
  await Promise.allSettled(promises);
  logger.info('All Redis connections closed', { service: 'redis' });
}

module.exports = {
  getRedisClient,
  getSubscriberClient,
  closeRedis,
};
