const { Queue } = require('bullmq');
const { getRedisClient } = require('../cache/redis.client');
const logger = require('../utils/logger');

let paymentQueue = null;

function getPaymentQueue() {
  if (!paymentQueue) {
    paymentQueue = new Queue('payment', {
      connection: getRedisClient(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      },
    });
  }
  return paymentQueue;
}

async function enqueuePayment(bookingId, amount, idempotencyKey) {
  const queue = getPaymentQueue();
  const job = await queue.add('process-payment', { bookingId, amount, idempotencyKey });

  logger.info('Payment job enqueued', {
    service: 'queue',
    queue: 'payment',
    jobId: job.id,
    bookingId,
  });

  return job;
}

module.exports = { getPaymentQueue, enqueuePayment };
