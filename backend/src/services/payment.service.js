const crypto = require('crypto');
const { getPrisma } = require('../db/prisma/client');
const { updateSeatStatuses } = require('../cache/seat.cache');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * Validate HMAC-SHA256 webhook signature.
 */
function validateSignature(payload, signature) {
  const expected = crypto
    .createHmac('sha256', config.payment.webhookSecret)
    .update(JSON.stringify(payload))
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expected, 'hex')
  );
}

/**
 * Process incoming payment webhook.
 */
async function processWebhook(body) {
  const { bookingId, transactionId, status, amount, timestamp, signature } = body;

  // Validate signature
  const payload = { bookingId, transactionId, status, amount, timestamp };
  let signatureValid = false;
  try {
    signatureValid = validateSignature(payload, signature);
  } catch (err) {
    logger.error('Webhook signature validation error', {
      service: 'payment',
      bookingId,
      error: err.message,
    });
  }

  if (!signatureValid) {
    logger.warn('Invalid webhook signature', {
      service: 'payment',
      bookingId,
      transactionId,
    });
    throw new Error('Invalid webhook signature');
  }

  logger.info('Payment webhook received', {
    service: 'payment',
    bookingId,
    transactionId,
    status,
    signatureValid,
  });

  if (status === 'SUCCESS') {
    await handlePaymentSuccess(bookingId, transactionId, body);
  } else if (status === 'FAILED') {
    await handlePaymentFailure(bookingId, transactionId, body);
  }
}

/**
 * Handle successful payment.
 */
async function handlePaymentSuccess(bookingId, transactionId, providerResponse) {
  const prisma = getPrisma();

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      items: { include: { eventSeat: true } },
      reservation: true,
      payments: { where: { status: 'PENDING' } },
    },
  });

  if (!booking) {
    logger.error('Booking not found for payment success', { service: 'payment', bookingId });
    return;
  }

  await prisma.$transaction(async (tx) => {
    // Update payment status
    if (booking.payments.length > 0) {
      await tx.payment.update({
        where: { id: booking.payments[0].id },
        data: {
          status: 'SUCCESS',
          providerRef: transactionId,
          providerResponse,
        },
      });
    }

    // Confirm booking
    await tx.booking.update({
      where: { id: bookingId },
      data: { status: 'CONFIRMED' },
    });

    // Mark all seats as BOOKED
    for (const item of booking.items) {
      await tx.eventSeat.updateMany({
        where: { id: item.eventSeatId },
        data: { status: 'BOOKED', version: { increment: 1 } },
      });
    }

    // Confirm reservation
    await tx.reservation.update({
      where: { id: booking.reservationId },
      data: { status: 'CONFIRMED' },
    });
  });

  // Update Redis cache — seats are now BOOKED
  await updateSeatStatuses(
    booking.eventId,
    booking.items.map((item) => ({
      seatId: item.eventSeat.seatId,
      status: 'BOOKED',
    }))
  );

  // Emit WebSocket events
  try {
    const { emitSeatBooked, emitBookingConfirmed } = require('../websocket/seat.events');
    for (const item of booking.items) {
      emitSeatBooked(booking.eventId, item.eventSeat.seatId);
    }
    emitBookingConfirmed(booking.userId, bookingId);
  } catch (err) {
    logger.debug('WebSocket emit skipped', { service: 'payment', error: err.message });
  }

  // Enqueue confirmation notification
  try {
    const { enqueueNotification } = require('../queues/notification.queue');
    await enqueueNotification(
      booking.userId,
      'BOOKING_CONFIRMED',
      'Booking Confirmed!',
      `Your booking ${bookingId} has been confirmed. Enjoy the event!`,
      { bookingId, eventId: booking.eventId }
    );
  } catch (err) {
    logger.error('Failed to enqueue notification', { service: 'payment', error: err.message });
  }

  logger.info('Payment success processed', {
    service: 'payment',
    bookingId,
    transactionId,
  });
}

/**
 * Handle failed payment.
 */
async function handlePaymentFailure(bookingId, transactionId, providerResponse) {
  const prisma = getPrisma();

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      items: { include: { eventSeat: true } },
      reservation: true,
      payments: { where: { status: 'PENDING' } },
    },
  });

  if (!booking) {
    logger.error('Booking not found for payment failure', { service: 'payment', bookingId });
    return;
  }

  await prisma.$transaction(async (tx) => {
    // Update payment status
    if (booking.payments.length > 0) {
      await tx.payment.update({
        where: { id: booking.payments[0].id },
        data: {
          status: 'FAILED',
          providerRef: transactionId,
          providerResponse,
        },
      });
    }

    // Cancel booking
    await tx.booking.update({
      where: { id: bookingId },
      data: { status: 'CANCELLED' },
    });

    // Release seats back to AVAILABLE
    for (const item of booking.items) {
      await tx.eventSeat.updateMany({
        where: { id: item.eventSeatId },
        data: { status: 'AVAILABLE', version: { increment: 1 } },
      });
    }

    // Cancel reservation
    await tx.reservation.update({
      where: { id: booking.reservationId },
      data: { status: 'CANCELLED' },
    });
  });

  // Update Redis cache
  await updateSeatStatuses(
    booking.eventId,
    booking.items.map((item) => ({
      seatId: item.eventSeat.seatId,
      status: 'AVAILABLE',
    }))
  );

  // Emit WebSocket events
  try {
    const { emitSeatAvailable, emitPaymentFailed } = require('../websocket/seat.events');
    for (const item of booking.items) {
      emitSeatAvailable(booking.eventId, item.eventSeat.seatId);
    }
    emitPaymentFailed(booking.userId, bookingId);
  } catch (err) {
    logger.debug('WebSocket emit skipped', { service: 'payment', error: err.message });
  }

  // Enqueue failure notification
  try {
    const { enqueueNotification } = require('../queues/notification.queue');
    await enqueueNotification(
      booking.userId,
      'PAYMENT_FAILED',
      'Payment Failed',
      `Payment for booking ${bookingId} has failed. Your seats have been released.`,
      { bookingId }
    );
  } catch (err) {
    logger.error('Failed to enqueue notification', { service: 'payment', error: err.message });
  }

  logger.info('Payment failure processed', {
    service: 'payment',
    bookingId,
    transactionId,
  });
}

module.exports = {
  processWebhook,
  handlePaymentSuccess,
  handlePaymentFailure,
};
