const { getRedisClient } = require('./redis.client');
const logger = require('../utils/logger');

const SEAT_STATUS_KEY = (eventId) => `seat:status:${eventId}`;

/**
 * Warm the seat cache for an event — bulk load all EventSeat statuses into a Redis hash.
 * Called when an event is published.
 *
 * @param {string} eventId
 * @param {Array<{ id: string, seatId: string, status: string }>} eventSeats
 */
async function warmSeatCache(eventId, eventSeats) {
  const redis = getRedisClient();
  const key = SEAT_STATUS_KEY(eventId);

  if (eventSeats.length === 0) return;

  // Build flat array for HSET: [field1, value1, field2, value2, ...]
  const args = [];
  for (const es of eventSeats) {
    args.push(es.seatId, es.status);
  }

  await redis.hset(key, ...args);
  logger.info('Seat cache warmed', {
    service: 'seat-cache',
    eventId,
    seatCount: eventSeats.length,
  });
}

/**
 * Get all seat statuses for an event from cache.
 * Returns a map { seatId: status } or null if cache miss.
 *
 * @param {string} eventId
 * @returns {Promise<Object|null>}
 */
async function getSeatStatuses(eventId) {
  const redis = getRedisClient();
  const key = SEAT_STATUS_KEY(eventId);

  const data = await redis.hgetall(key);
  if (!data || Object.keys(data).length === 0) {
    return null; // Cache miss — caller should fall back to DB
  }
  return data;
}

/**
 * Update a single seat's status in the cache.
 *
 * @param {string} eventId
 * @param {string} seatId
 * @param {string} status - AVAILABLE | RESERVED | BOOKED
 */
async function updateSeatStatus(eventId, seatId, status) {
  const redis = getRedisClient();
  const key = SEAT_STATUS_KEY(eventId);
  await redis.hset(key, seatId, status);
}

/**
 * Update multiple seats' statuses in cache (pipeline for performance).
 *
 * @param {string} eventId
 * @param {Array<{ seatId: string, status: string }>} updates
 */
async function updateSeatStatuses(eventId, updates) {
  const redis = getRedisClient();
  const key = SEAT_STATUS_KEY(eventId);

  const pipeline = redis.pipeline();
  for (const { seatId, status } of updates) {
    pipeline.hset(key, seatId, status);
  }
  await pipeline.exec();
}

/**
 * Invalidate (delete) the entire seat cache for an event.
 *
 * @param {string} eventId
 */
async function invalidateSeatCache(eventId) {
  const redis = getRedisClient();
  await redis.del(SEAT_STATUS_KEY(eventId));
  logger.info('Seat cache invalidated', { service: 'seat-cache', eventId });
}

module.exports = {
  warmSeatCache,
  getSeatStatuses,
  updateSeatStatus,
  updateSeatStatuses,
  invalidateSeatCache,
};
