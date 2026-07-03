const { Worker } = require('bullmq');
const { getRedisClient } = require('../cache/redis.client');
const logger = require('../utils/logger');
const config = require('../config');

/**
 * Payment Worker — processes payment jobs via mock provider.
 */
function createPaymentWorker() {
  const worker = new Worker(
    'payment',
    async (job) => {
      const { bookingId, amount, idempotencyKey } = job.data;

      logger.info('Processing payment job', {
        service: 'worker',
        queue: 'payment',
        jobId: job.id,
        bookingId,
        amount,
      });

      // Call mock payment provider
      const paymentProvider = require('../mock-payment/payment.provider');
      await paymentProvider.charge({
        amount,
        bookingId,
        idempotencyKey,
        callbackUrl: `http://localhost:${config.server.port}/api/payments/webhook`,
      });

      logger.info('Payment job processed', {
        service: 'worker',
        queue: 'payment',
        jobId: job.id,
        bookingId,
      });
    },
    {
      connection: getRedisClient(),
      concurrency: config.server.workerConcurrency,
    }
  );

  worker.on('failed', (job, err) => {
    logger.error('Payment job failed', {
      service: 'worker',
      queue: 'payment',
      jobId: job?.id,
      error: err.message,
    });
  });

  return worker;
}

module.exports = { createPaymentWorker };
