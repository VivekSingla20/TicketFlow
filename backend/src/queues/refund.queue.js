const { Queue } = require('bullmq');
const { getRedisClient } = require('../cache/redis.client');
const logger = require('../utils/logger');

let refundQueue = null;

function getRefundQueue() {
  if (!refundQueue) {
    refundQueue = new Queue('refund', {
      connection: getRedisClient(),
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 3000 },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      },
    });
  }
  return refundQueue;
}

async function enqueueRefund(bookingId, paymentId, amount) {
  const queue = getRefundQueue();
  const job = await queue.add('process-refund', { bookingId, paymentId, amount });

  logger.info('Refund job enqueued', {
    service: 'queue',
    queue: 'refund',
    jobId: job.id,
    bookingId,
    paymentId,
    amount,
  });

  return job;
}

module.exports = { getRefundQueue, enqueueRefund };
