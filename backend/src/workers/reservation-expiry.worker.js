const { Worker } = require('bullmq');
const { getRedisClient } = require('../cache/redis.client');
const { getPrisma } = require('../db/prisma/client');
const { updateSeatStatuses } = require('../cache/seat.cache');
const logger = require('../utils/logger');
const config = require('../config');

/**
 * Reservation Expiry Worker.
 *
 * Idempotent — safe to run multiple times:
 * - Checks reservation status from DB before acting
 * - If already CONFIRMED or CANCELLED, no-ops
 */
function createReservationExpiryWorker() {
  const worker = new Worker(
    'reservation-expiry',
    async (job) => {
      const { reservationId } = job.data;

      logger.info('Processing reservation expiry', {
        service: 'worker',
        queue: 'reservation-expiry',
        jobId: job.id,
        reservationId,
      });

      const prisma = getPrisma();

      // Load reservation
      const reservation = await prisma.reservation.findUnique({
        where: { id: reservationId },
        include: {
          items: { include: { eventSeat: true } },
        },
      });

      if (!reservation) {
        logger.warn('Reservation not found for expiry', {
          service: 'worker',
          reservationId,
        });
        return;
      }

      // Idempotent check — if not PENDING, job is stale
      if (reservation.status !== 'PENDING') {
        logger.info('Reservation already processed, skipping expiry', {
          service: 'worker',
          reservationId,
          currentStatus: reservation.status,
        });
        return;
      }

      // Double-check expiry time
      if (reservation.expiresAt > new Date()) {
        logger.info('Reservation not yet expired, skipping', {
          service: 'worker',
          reservationId,
          expiresAt: reservation.expiresAt.toISOString(),
        });
        return;
      }

      // Expire reservation and release seats
      await prisma.$transaction(async (tx) => {
        await tx.reservation.update({
          where: { id: reservationId },
          data: { status: 'EXPIRED' },
        });

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
        const { emitSeatAvailable, emitReservationExpired } = require('../websocket/seat.events');
        const seatIds = reservation.items.map((item) => item.eventSeat.seatId);

        for (const seatId of seatIds) {
          emitSeatAvailable(reservation.eventId, seatId);
        }
        emitReservationExpired(reservation.userId, reservationId, seatIds);
      } catch (err) {
        logger.debug('WebSocket emit skipped in worker', { error: err.message });
      }

      // Enqueue notification
      try {
        const { enqueueNotification } = require('../queues/notification.queue');
        await enqueueNotification(
          reservation.userId,
          'RESERVATION_EXPIRED',
          'Reservation Expired',
          'Your seat reservation has expired. The seats are now available for others.',
          { reservationId, eventId: reservation.eventId }
        );
      } catch (err) {
        logger.error('Failed to enqueue expiry notification', { error: err.message });
      }

      logger.info('Reservation expired and seats released', {
        service: 'worker',
        reservationId,
        seatsReleased: reservation.items.length,
      });
    },
    {
      connection: getRedisClient(),
      concurrency: config.server.workerConcurrency,
    }
  );

  worker.on('failed', (job, err) => {
    logger.error('Reservation expiry job failed', {
      service: 'worker',
      queue: 'reservation-expiry',
      jobId: job?.id,
      error: err.message,
      stack: err.stack,
    });
  });

  worker.on('completed', (job) => {
    logger.info('Reservation expiry job completed', {
      service: 'worker',
      queue: 'reservation-expiry',
      jobId: job.id,
    });
  });

  return worker;
}

module.exports = { createReservationExpiryWorker };
