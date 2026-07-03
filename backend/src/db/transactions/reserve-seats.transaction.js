const { getPrisma } = require('../prisma/client');
const logger = require('../../utils/logger');

/**
 * Reserve seats in a single atomic transaction.
 *
 * This is the core transaction that implements optimistic locking.
 * Called from reservation.service.js AFTER Redis locks are acquired.
 *
 * @param {Array<{ id: string, seatId: string, version: number }>} eventSeats - Pre-fetched event seats
 * @param {string} userId
 * @param {string} eventId
 * @param {Date} expiresAt
 * @returns {Promise<object>} Created reservation with items
 */
async function reserveSeatsTransaction(eventSeats, userId, eventId, expiresAt) {
  const prisma = getPrisma();

  return prisma.$transaction(async (tx) => {
    // Re-read each seat inside the transaction for fresh status + version
    for (const es of eventSeats) {
      const freshSeat = await tx.eventSeat.findUnique({
        where: { id: es.id },
        select: { id: true, status: true, version: true },
      });

      if (!freshSeat || freshSeat.status !== 'AVAILABLE') {
        const error = new Error(`Seat ${es.seatId} is no longer available`);
        error.code = 'SEAT_ALREADY_TAKEN';
        error.seatId = es.seatId;
        throw error;
      }

      // Optimistic lock: update only if version matches
      const result = await tx.eventSeat.updateMany({
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

      if (result.count === 0) {
        const error = new Error(`Optimistic lock conflict on seat ${es.seatId}`);
        error.code = 'OPTIMISTIC_LOCK_CONFLICT';
        error.seatId = es.seatId;
        throw error;
      }
    }

    // Create the reservation record
    const reservation = await tx.reservation.create({
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
                seat: {
                  select: { id: true, row: true, number: true, section: true },
                },
              },
            },
          },
        },
      },
    });

    logger.info('Seats reserved in transaction', {
      service: 'transaction',
      reservationId: reservation.id,
      seatCount: eventSeats.length,
    });

    return reservation;
  });
}

/**
 * Release seats back to AVAILABLE in a single transaction.
 * Used by expiry worker and voluntary cancellation.
 *
 * @param {string} reservationId
 * @param {Array<{ eventSeatId: string }>} items
 * @param {string} newStatus - 'EXPIRED' or 'CANCELLED'
 */
async function releaseSeatsTransaction(reservationId, items, newStatus) {
  const prisma = getPrisma();

  return prisma.$transaction(async (tx) => {
    await tx.reservation.update({
      where: { id: reservationId },
      data: { status: newStatus },
    });

    for (const item of items) {
      await tx.eventSeat.updateMany({
        where: { id: item.eventSeatId, status: 'RESERVED' },
        data: { status: 'AVAILABLE', version: { increment: 1 } },
      });
    }

    logger.info('Seats released in transaction', {
      service: 'transaction',
      reservationId,
      newStatus,
      seatCount: items.length,
    });
  });
}

module.exports = {
  reserveSeatsTransaction,
  releaseSeatsTransaction,
};
