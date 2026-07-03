const { getPrisma } = require('../db/prisma/client');
const { updateSeatStatuses } = require('../cache/seat.cache');
const { getIdempotencyResponse, setIdempotencyResponse } = require('../utils/idempotency');
const logger = require('../utils/logger');
const {
  NotFoundError,
  ReservationExpiredError,
  ReservationNotFoundError,
  DuplicateRequestError,
  CancellationNotAllowedError,
  ValidationError,
} = require('../utils/errors');

/**
 * Create a booking from a confirmed reservation.
 * Idempotency-protected via Redis cache.
 */
async function createBooking(userId, reservationId, idempotencyKey) {
  // 1. Check idempotency key
  const cached = await getIdempotencyResponse(idempotencyKey);
  if (cached) {
    throw new DuplicateRequestError(cached);
  }

  const prisma = getPrisma();

  // 2. Load reservation + items
  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    include: {
      items: {
        include: {
          eventSeat: true,
        },
      },
    },
  });

  if (!reservation) throw new ReservationNotFoundError(reservationId);
  if (reservation.userId !== userId) throw new NotFoundError('Reservation');
  if (reservation.status !== 'PENDING') {
    throw new ValidationError(`Reservation is ${reservation.status}, cannot book`);
  }
  if (reservation.expiresAt < new Date()) {
    throw new ReservationExpiredError(reservationId);
  }

  // Verify all seats are still RESERVED
  for (const item of reservation.items) {
    if (item.eventSeat.status !== 'RESERVED') {
      throw new ValidationError(`Seat ${item.eventSeatId} is no longer reserved`);
    }
  }

  // 3. Calculate total
  const totalAmount = reservation.items.reduce(
    (sum, item) => sum + parseFloat(item.eventSeat.price),
    0
  );

  // 4. Create Booking + Payment in a transaction
  const booking = await prisma.$transaction(async (tx) => {
    const bk = await tx.booking.create({
      data: {
        userId,
        reservationId,
        eventId: reservation.eventId,
        totalAmount,
        status: 'PENDING_PAYMENT',
        idempotencyKey,
        items: {
          create: reservation.items.map((item) => ({
            eventSeatId: item.eventSeatId,
            priceAtBooking: item.eventSeat.price,
          })),
        },
      },
      include: { items: true },
    });

    // Create pending payment
    await tx.payment.create({
      data: {
        bookingId: bk.id,
        amount: totalAmount,
        status: 'PENDING',
      },
    });

    return bk;
  });

  // 5. Call mock payment provider (async)
  try {
    const paymentProvider = require('../mock-payment/payment.provider');
    await paymentProvider.charge({
      amount: totalAmount,
      bookingId: booking.id,
      idempotencyKey,
      callbackUrl: `http://localhost:${require('../config').server.port}/api/payments/webhook`,
    });
  } catch (err) {
    logger.error('Mock payment charge call failed', {
      service: 'booking',
      bookingId: booking.id,
      error: err.message,
    });
  }

  // 6. Cache idempotency response
  const response = {
    bookingId: booking.id,
    reservationId,
    totalAmount,
    status: booking.status,
  };
  await setIdempotencyResponse(idempotencyKey, response);

  logger.info('Booking created', {
    service: 'booking',
    bookingId: booking.id,
    userId,
    totalAmount,
  });

  return response;
}

/**
 * Get user's booking history.
 */
async function getUserBookings(userId, skip, take) {
  const prisma = getPrisma();

  const [bookings, total] = await Promise.all([
    prisma.booking.findMany({
      where: { userId },
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        event: { select: { id: true, title: true, startsAt: true } },
        payments: { select: { id: true, status: true, amount: true } },
      },
    }),
    prisma.booking.count({ where: { userId } }),
  ]);

  return { bookings, total };
}

/**
 * Get booking detail.
 */
async function getBookingById(userId, bookingId) {
  const prisma = getPrisma();

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      event: { select: { id: true, title: true, startsAt: true, endsAt: true } },
      items: {
        include: {
          eventSeat: {
            include: {
              seat: { select: { row: true, number: true, section: true } },
            },
          },
        },
      },
      payments: true,
    },
  });

  if (!booking) throw new NotFoundError('Booking');
  if (booking.userId !== userId) throw new NotFoundError('Booking');

  return booking;
}

/**
 * Cancel a confirmed booking and enqueue refund.
 */
async function cancelBooking(userId, bookingId) {
  const prisma = getPrisma();

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      event: true,
      items: { include: { eventSeat: true } },
      payments: { where: { status: 'SUCCESS' } },
    },
  });

  if (!booking) throw new NotFoundError('Booking');
  if (booking.userId !== userId) throw new NotFoundError('Booking');
  if (booking.status !== 'CONFIRMED') {
    throw new CancellationNotAllowedError('Only CONFIRMED bookings can be cancelled');
  }

  // Check cancellation policy: no cancellation within 2 hours of event
  const twoHoursBeforeEvent = new Date(booking.event.startsAt.getTime() - 2 * 60 * 60 * 1000);
  if (new Date() > twoHoursBeforeEvent) {
    throw new CancellationNotAllowedError(
      'Cancellation not allowed within 2 hours of event start'
    );
  }

  // Cancel booking and release seats
  await prisma.$transaction(async (tx) => {
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
    const { emitSeatAvailable } = require('../websocket/seat.events');
    for (const item of booking.items) {
      emitSeatAvailable(booking.eventId, item.eventSeat.seatId);
    }
  } catch (err) {
    logger.debug('WebSocket emit skipped', { service: 'booking', error: err.message });
  }

  // Enqueue refund jobs
  for (const payment of booking.payments) {
    try {
      const { enqueueRefund } = require('../queues/refund.queue');
      await enqueueRefund(bookingId, payment.id, parseFloat(payment.amount));
    } catch (err) {
      logger.error('Failed to enqueue refund', {
        service: 'booking',
        bookingId,
        paymentId: payment.id,
        error: err.message,
      });
    }
  }

  logger.info('Booking cancelled, refund enqueued', {
    service: 'booking',
    bookingId,
    userId,
  });

  return { bookingId, status: 'CANCELLED' };
}

module.exports = {
  createBooking,
  getUserBookings,
  getBookingById,
  cancelBooking,
};
