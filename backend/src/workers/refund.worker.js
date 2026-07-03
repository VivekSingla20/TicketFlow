const { Worker } = require('bullmq');
const { getRedisClient } = require('../cache/redis.client');
const { getPrisma } = require('../db/prisma/client');
const logger = require('../utils/logger');
const config = require('../config');

/**
 * Refund Worker — calls mock payment refund and updates DB.
 * Idempotent — checks refund status before processing.
 */
function createRefundWorker() {
  const worker = new Worker(
    'refund',
    async (job) => {
      const { bookingId, paymentId, amount } = job.data;

      logger.info('Processing refund job', {
        service: 'worker',
        queue: 'refund',
        jobId: job.id,
        bookingId,
        paymentId,
        amount,
      });

      const prisma = getPrisma();

      // Check if refund already exists and is processed
      const existingRefund = await prisma.refund.findFirst({
        where: { paymentId, status: 'PROCESSED' },
      });

      if (existingRefund) {
        logger.info('Refund already processed, skipping', {
          service: 'worker',
          refundId: existingRefund.id,
          paymentId,
        });
        return;
      }

      // Create refund record if not exists
      let refund = await prisma.refund.findFirst({
        where: { paymentId, bookingId, status: 'PENDING' },
      });

      if (!refund) {
        refund = await prisma.refund.create({
          data: {
            paymentId,
            bookingId,
            amount,
            status: 'PENDING',
          },
        });
      }

      // Call mock payment refund
      try {
        const paymentProvider = require('../mock-payment/payment.provider');
        const payment = await prisma.payment.findUnique({ where: { id: paymentId } });

        const result = await paymentProvider.refund({
          transactionId: payment?.providerRef || 'unknown',
          amount,
        });

        // Update refund and payment status
        await prisma.$transaction(async (tx) => {
          await tx.refund.update({
            where: { id: refund.id },
            data: { status: 'PROCESSED', processedAt: new Date() },
          });

          await tx.payment.update({
            where: { id: paymentId },
            data: { status: 'REFUNDED' },
          });

          await tx.booking.update({
            where: { id: bookingId },
            data: { status: 'REFUNDED' },
          });
        });

        // Enqueue notification
        const booking = await prisma.booking.findUnique({
          where: { id: bookingId },
          select: { userId: true },
        });

        if (booking) {
          const { enqueueNotification } = require('../queues/notification.queue');
          await enqueueNotification(
            booking.userId,
            'REFUND_PROCESSED',
            'Refund Processed',
            `Your refund of $${amount} has been processed successfully.`,
            { bookingId, refundId: refund.id, amount }
          );
        }

        logger.info('Refund processed successfully', {
          service: 'worker',
          refundId: refund.id,
          bookingId,
          amount,
        });
      } catch (err) {
        // Update refund status to FAILED
        await prisma.refund.update({
          where: { id: refund.id },
          data: { status: 'FAILED' },
        });

        logger.error('Refund processing failed', {
          service: 'worker',
          refundId: refund.id,
          error: err.message,
        });

        throw err; // BullMQ will retry
      }
    },
    {
      connection: getRedisClient(),
      concurrency: config.server.workerConcurrency,
    }
  );

  worker.on('failed', (job, err) => {
    logger.error('Refund job failed', {
      service: 'worker',
      queue: 'refund',
      jobId: job?.id,
      attemptsMade: job?.attemptsMade,
      error: err.message,
    });

    // Alert after max retries
    if (job && job.attemptsMade >= 5) {
      logger.error('ALERT: Refund job exhausted all retries', {
        service: 'worker',
        queue: 'refund',
        jobId: job.id,
        data: job.data,
      });
    }
  });

  return worker;
}

module.exports = { createRefundWorker };
