/**
 * Worker Process Entry Point
 *
 * Run as a separate Node.js process:
 *   node src/worker.js
 *
 * Initializes all BullMQ workers and handles graceful shutdown.
 */

const config = require('./config');
const logger = require('./utils/logger');
const { getRedisClient, closeRedis } = require('./cache/redis.client');
const { getPrisma, closePrisma } = require('./db/prisma/client');

async function startWorkers() {
  logger.info('Starting worker process', {
    service: 'worker',
    concurrency: config.server.workerConcurrency,
  });

  // Initialize connections
  getRedisClient();
  getPrisma();

  // Initialize all workers
  const { createReservationExpiryWorker } = require('./workers/reservation-expiry.worker');
  const { createPaymentWorker } = require('./workers/payment.worker');
  const { createRefundWorker } = require('./workers/refund.worker');
  const { createNotificationWorker } = require('./workers/notification.worker');

  const workers = [
    createReservationExpiryWorker(),
    createPaymentWorker(),
    createRefundWorker(),
    createNotificationWorker(),
  ];

  logger.info(`${workers.length} workers initialized`, { service: 'worker' });

  // Graceful shutdown
  const shutdown = async (signal) => {
    logger.info(`Received ${signal}, shutting down workers...`, { service: 'worker' });

    // Close all workers
    await Promise.allSettled(workers.map((w) => w.close()));
    logger.info('All workers closed', { service: 'worker' });

    // Close connections
    await closeRedis();
    await closePrisma();

    logger.info('Worker process shutdown complete', { service: 'worker' });
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception in worker', {
      service: 'worker',
      error: err.message,
      stack: err.stack,
    });
    shutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection in worker', {
      service: 'worker',
      error: reason?.message || String(reason),
    });
  });
}

startWorkers().catch((err) => {
  logger.error('Failed to start workers', {
    service: 'worker',
    error: err.message,
    stack: err.stack,
  });
  process.exit(1);
});
