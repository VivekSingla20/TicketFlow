const { Worker } = require('bullmq');
const { getRedisClient } = require('../cache/redis.client');
const { getPrisma } = require('../db/prisma/client');
const logger = require('../utils/logger');
const config = require('../config');

/**
 * Notification Worker — creates in-app notifications and emits WebSocket events.
 * No actual email/SMS — just logs the payload and persists to DB.
 */
function createNotificationWorker() {
  const worker = new Worker(
    'notification',
    async (job) => {
      const { userId, type, title, body, metadata } = job.data;

      logger.info('Processing notification job', {
        service: 'worker',
        queue: 'notification',
        jobId: job.id,
        userId,
        type,
        title,
      });

      const prisma = getPrisma();

      // Create notification in DB
      const notification = await prisma.notification.create({
        data: {
          userId,
          type,
          title,
          body,
          metadata: metadata || {},
          isRead: false,
        },
      });

      // Emit WebSocket event to user's private room
      try {
        const { emitNotification } = require('../websocket/seat.events');
        emitNotification(userId, notification.id, title, body);
      } catch (err) {
        logger.debug('WebSocket emit skipped in notification worker', {
          error: err.message,
        });
      }

      // Log notification payload (simulating email/SMS send)
      logger.info('Notification sent (simulated)', {
        service: 'notification',
        notificationId: notification.id,
        userId,
        type,
        title,
        body,
        metadata,
      });
    },
    {
      connection: getRedisClient(),
      concurrency: config.server.workerConcurrency,
    }
  );

  worker.on('failed', (job, err) => {
    logger.error('Notification job failed', {
      service: 'worker',
      queue: 'notification',
      jobId: job?.id,
      error: err.message,
    });
  });

  return worker;
}

module.exports = { createNotificationWorker };
