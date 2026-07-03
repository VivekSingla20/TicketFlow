const { getPrisma } = require('../db/prisma/client');
const logger = require('../utils/logger');

/**
 * Get refund status for a booking.
 */
async function getRefundByBookingId(bookingId) {
  const prisma = getPrisma();

  return prisma.refund.findMany({
    where: { bookingId },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Process a refund — update DB records.
 * Called by the refund worker after the mock payment provider confirms.
 */
async function processRefund(refundId, paymentId, bookingId) {
  const prisma = getPrisma();

  await prisma.$transaction(async (tx) => {
    await tx.refund.update({
      where: { id: refundId },
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

  logger.info('Refund processed in DB', {
    service: 'refund',
    refundId,
    paymentId,
    bookingId,
  });
}

/**
 * Mark a refund as failed.
 */
async function failRefund(refundId) {
  const prisma = getPrisma();

  await prisma.refund.update({
    where: { id: refundId },
    data: { status: 'FAILED' },
  });

  logger.warn('Refund marked as failed', {
    service: 'refund',
    refundId,
  });
}

module.exports = {
  getRefundByBookingId,
  processRefund,
  failRefund,
};
