/**
 * Server Entry Point
 *
 * Starts the HTTP server with Socket.io.
 * Run: node src/server.js
 */

const config = require('./config');
const logger = require('./utils/logger');
const { buildApp } = require('./app');
const { initializeWebSocket } = require('./websocket/gateway');
const { getRedisClient, closeRedis } = require('./cache/redis.client');
const { getPrisma, closePrisma } = require('./db/prisma/client');

async function start() {
  logger.info('Starting server...', { service: 'server', env: config.env });

  // 1. Build the Fastify app
  const app = await buildApp();

  // 2. Connect to Redis (validates connection)
  const redis = getRedisClient();
  await redis.ping();
  logger.info('Redis connection verified', { service: 'server' });

  // 3. Connect to PostgreSQL via Prisma
  const prisma = getPrisma();
  await prisma.$connect();
  logger.info('PostgreSQL connection verified', { service: 'server' });

  // 4. Start listening
  await app.listen({ port: config.server.port, host: '0.0.0.0' });

  // 5. Initialize WebSocket (after server is listening)
  initializeWebSocket();

  logger.info(`🚀 Server running on port ${config.server.port}`, {
    service: 'server',
    port: config.server.port,
    docs: `http://localhost:${config.server.port}/api/docs`,
    health: `http://localhost:${config.server.port}/health`,
  });

  // Graceful shutdown
  const shutdown = async (signal) => {
    logger.info(`Received ${signal}, shutting down gracefully...`, { service: 'server' });

    await app.close();
    await closeRedis();
    await closePrisma();

    logger.info('Server shutdown complete', { service: 'server' });
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', {
      service: 'server',
      error: err.message,
      stack: err.stack,
    });
    shutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', {
      service: 'server',
      error: reason?.message || String(reason),
    });
  });
}

start().catch((err) => {
  logger.error('Failed to start server', {
    service: 'server',
    error: err.message,
    stack: err.stack,
  });
  process.exit(1);
});
