const { Queue } = require('bullmq');
const { getRedisClient } = require('../cache/redis.client');
const logger = require('../utils/logger');

let reservationExpiryQueue = null;

function getReservationExpiryQueue() {
  if (!reservationExpiryQueue) {
    reservationExpiryQueue = new Queue('reservation-expiry', {
      connection: getRedisClient(),
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      },
    });
  }
  return reservationExpiryQueue;
}

/**
 * Enqueue a delayed reservation expiry job.
 * @param {string} reservationId
 * @param {number} delayMs - Delay in milliseconds
 */
async function enqueueReservationExpiry(reservationId, delayMs) {
  const queue = getReservationExpiryQueue();
  const job = await queue.add(
    'expire-reservation',
    { reservationId },
    { delay: delayMs, jobId: `expire-${reservationId}` }
  );

  logger.info('Reservation expiry job enqueued', {
    service: 'queue',
    queue: 'reservation-expiry',
    jobId: job.id,
    reservationId,
    delayMs,
  });

  return job;
}

/**
 * Cancel a pending reservation expiry job (when booking is confirmed).
 */
async function cancelReservationExpiry(reservationId) {
  const queue = getReservationExpiryQueue();
  try {
    const job = await queue.getJob(`expire-${reservationId}`);
    if (job) {
      await job.remove();
      logger.info('Reservation expiry job cancelled', {
        service: 'queue',
        reservationId,
      });
    }
  } catch (err) {
    logger.warn('Could not cancel expiry job', {
      service: 'queue',
      reservationId,
      error: err.message,
    });
  }
}

module.exports = {
  getReservationExpiryQueue,
  enqueueReservationExpiry,
  cancelReservationExpiry,
};
