const { Queue } = require('bullmq');
const { getRedisClient } = require('../cache/redis.client');
const logger = require('../utils/logger');

let notificationQueue = null;

function getNotificationQueue() {
  if (!notificationQueue) {
    notificationQueue = new Queue('notification', {
      connection: getRedisClient(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { count: 5000 },
        removeOnFail: { count: 5000 },
      },
    });
  }
  return notificationQueue;
}

async function enqueueNotification(userId, type, title, body, metadata = {}) {
  const queue = getNotificationQueue();
  const job = await queue.add('send-notification', { userId, type, title, body, metadata });

  logger.info('Notification job enqueued', {
    service: 'queue',
    queue: 'notification',
    jobId: job.id,
    userId,
    type,
  });

  return job;
}

module.exports = { getNotificationQueue, enqueueNotification };
