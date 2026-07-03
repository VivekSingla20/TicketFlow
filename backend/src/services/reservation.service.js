const { getPrisma } = require('../db/prisma/client');
const { acquireLock, releaseLock } = require('../locks/redlock');
const { updateSeatStatuses } = require('../cache/seat.cache');
const { enqueueReservationExpiry } = require('../queues/reservation.queue');
const logger = require('../utils/logger');
const {
  SeatAlreadyTakenError,
  SeatLockTimeoutError,
  ReservationExpiredError,
  ReservationNotFoundError,
  OptimisticLockConflictError,
  NotFoundError,
  EventNotAvailableError,
} = require('../utils/errors');
const config = require('../config');

/**
 * THE HOT PATH — Create a reservation for seats.
 *
 * Concurrency safety via 3 layers:
 * 1. Redis distributed lock (SET NX PX) — prevents concurrent DB transactions for same seat
 * 2. Prisma interactive transaction — atomic multi-table update
 * 3. Optimistic locking via version field — final safety net against race conditions
 *
 * @param {string} userId
 * @param {string} eventId
 * @param {string[]} seatIds - Array of seat IDs (physical seat IDs, not eventSeat IDs)
 */
async function createReservation(userId, eventId, seatIds) {
  const prisma = getPrisma();

  // Validate event is published
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) throw new NotFoundError('Event');
  if (event.status !== 'PUBLISHED') throw new EventNotAvailableError(eventId);

  // Sort seat IDs ascending to prevent deadlocks
  const sortedSeatIds = [...seatIds].sort();

  // Look up EventSeat records for these seats
  const eventSeats = await prisma.eventSeat.findMany({
    where: {
      eventId,
      seatId: { in: sortedSeatIds },
    },
    orderBy: { seatId: 'asc' },
  });

  if (eventSeats.length !== sortedSeatIds.length) {
    throw new NotFoundError('One or more seats not found for this event');
  }

  // LAYER 1: Acquire Redis locks for all seats (sorted order prevents deadlocks)
  const acquiredLocks = [];
  try {
    for (const es of eventSeats) {
      const lockKey = `seat:lock:${es.id}`;
      const lock = await acquireLock(lockKey, { ttl: 15000, retryCount: 3, retryDelay: 100 });

      if (!lock) {
        // Failed to acquire lock — release all previously acquired locks
        throw new SeatLockTimeoutError(es.seatId, 5);
      }

      acquiredLocks.push({ key: lockKey, value: lock.lockValue, eventSeatId: es.id });

      logger.debug('Lock acquired for seat', {
        service: 'reservation',
        eventSeatId: es.id,
        seatId: es.seatId,
        userId,
      });
    }

    // LAYER 2 + 3: DB transaction with optimistic locking
    const expiresAt = new Date(Date.now() + config.reservation.ttlMs);

    const reservation = await prisma.$transaction(async (tx) => {
      // Re-read seats inside transaction to get fresh status + version
      for (const es of eventSeats) {
        const freshSeat = await tx.eventSeat.findUnique({
          where: { id: es.id },
          select: { id: true, status: true, version: true },
        });

        if (freshSeat.status !== 'AVAILABLE') {
          throw new SeatAlreadyTakenError(es.seatId);
        }

        // OPTIMISTIC LOCK: Update only if version matches
        const updateResult = await tx.eventSeat.updateMany({
          where: {
            id: es.id,
            status: 'AVAILABLE',
            version: freshSeat.version,
          },
          data: {
            status: 'RESERVED',
            version: { increment: 1 },
          },
        });

        if (updateResult.count === 0) {
          throw new OptimisticLockConflictError(`EventSeat ${es.id}`);
        }
      }

      // Create reservation
      const res = await tx.reservation.create({
        data: {
          userId,
          eventId,
          expiresAt,
          status: 'PENDING',
          items: {
            create: eventSeats.map((es) => ({
              eventSeatId: es.id,
            })),
          },
        },
        include: {
          items: {
            include: {
              eventSeat: {
                include: {
                  seat: { select: { id: true, row: true, number: true, section: true } },
                },
              },
            },
          },
        },
      });

      return res;
    });

    // Update Redis cache — mark seats as RESERVED
    await updateSeatStatuses(
      eventId,
      eventSeats.map((es) => ({ seatId: es.seatId, status: 'RESERVED' }))
    );

    // Enqueue delayed expiry job
    await enqueueReservationExpiry(reservation.id, config.reservation.ttlMs);

    logger.info('Reservation created', {
      service: 'reservation',
      reservationId: reservation.id,
      userId,
      eventId,
      seatCount: eventSeats.length,
      expiresAt: expiresAt.toISOString(),
    });

    // Emit WebSocket events (if io is available)
    try {
      const { emitSeatReserved } = require('../websocket/seat.events');
      for (const es of eventSeats) {
        emitSeatReserved(eventId, es.seatId);
      }
    } catch (err) {
      // WebSocket not initialized yet — non-critical
      logger.debug('WebSocket emit skipped', { service: 'reservation', error: err.message });
    }

    return {
      reservationId: reservation.id,
      expiresAt: reservation.expiresAt,
      seats: reservation.items.map((item) => ({
        eventSeatId: item.eventSeatId,
        seatId: item.eventSeat.seatId,
        row: item.eventSeat.seat.row,
        number: item.eventSeat.seat.number,
        section: item.eventSeat.seat.section,
        price: item.eventSeat.price,
      })),
    };
  } finally {
    // ALWAYS release all acquired locks
    for (const lock of acquiredLocks) {
      try {
        await releaseLock(lock.key, lock.value);
      } catch (err) {
        logger.error('Failed to release lock', {
          service: 'reservation',
          lockKey: lock.key,
          error: err.message,
        });
      }
    }
  }
}

/**
 * Get reservation status and remaining time.
 */
async function getReservation(userId, reservationId) {
  const prisma = getPrisma();

  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    include: {
      items: {
        include: {
          eventSeat: {
            include: {
              seat: { select: { id: true, row: true, number: true, section: true } },
            },
          },
        },
      },
    },
  });

  if (!reservation) throw new ReservationNotFoundError(reservationId);
  if (reservation.userId !== userId) throw new NotFoundError('Reservation');

  const now = new Date();
  const remainingMs = Math.max(0, reservation.expiresAt.getTime() - now.getTime());

  return {
    ...reservation,
    remainingSeconds: Math.ceil(remainingMs / 1000),
    isExpired: remainingMs <= 0 || reservation.status === 'EXPIRED',
  };
}

/**
 * Voluntarily cancel a reservation — release seats immediately.
 */
async function cancelReservation(userId, reservationId) {
  const prisma = getPrisma();

  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    include: { items: { include: { eventSeat: true } } },
  });

  if (!reservation) throw new ReservationNotFoundError(reservationId);
  if (reservation.userId !== userId) throw new NotFoundError('Reservation');
  if (reservation.status !== 'PENDING') {
    throw new ReservationExpiredError(reservationId);
  }

  // Release seats in a transaction
  await prisma.$transaction(async (tx) => {
    // Update reservation status
    await tx.reservation.update({
      where: { id: reservationId },
      data: { status: 'CANCELLED' },
    });

    // Release all seats back to AVAILABLE
    for (const item of reservation.items) {
      await tx.eventSeat.updateMany({
        where: { id: item.eventSeatId, status: 'RESERVED' },
        data: { status: 'AVAILABLE', version: { increment: 1 } },
      });
    }
  });

  // Update Redis cache
  await updateSeatStatuses(
    reservation.eventId,
    reservation.items.map((item) => ({
      seatId: item.eventSeat.seatId,
      status: 'AVAILABLE',
    }))
  );

  // Emit WebSocket events
  try {
    const { emitSeatAvailable } = require('../websocket/seat.events');
    for (const item of reservation.items) {
      emitSeatAvailable(reservation.eventId, item.eventSeat.seatId);
    }
  } catch (err) {
    logger.debug('WebSocket emit skipped', { service: 'reservation', error: err.message });
  }

  logger.info('Reservation cancelled voluntarily', {
    service: 'reservation',
    reservationId,
    userId,
    seatCount: reservation.items.length,
  });

  return { reservationId, status: 'CANCELLED' };
}

module.exports = {
  createReservation,
  getReservation,
  cancelReservation,
};
