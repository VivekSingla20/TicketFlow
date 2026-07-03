const { getRedisClient } = require('../cache/redis.client');
const logger = require('../utils/logger');

const IDEMPOTENCY_TTL = 86400; // 24 hours in seconds

/**
 * Check if an idempotency key exists in Redis.
 * Returns the cached response or null.
 */
async function getIdempotencyResponse(key) {
  const redis = getRedisClient();
  const cached = await redis.get(`idempotency:${key}`);
  if (cached) {
    logger.info('Idempotency cache hit', { service: 'idempotency', key });
    return JSON.parse(cached);
  }
  return null;
}

/**
 * Store an idempotency response in Redis.
 */
async function setIdempotencyResponse(key, response) {
  const redis = getRedisClient();
  await redis.set(`idempotency:${key}`, JSON.stringify(response), 'EX', IDEMPOTENCY_TTL);
  logger.debug('Idempotency response cached', { service: 'idempotency', key });
}

module.exports = { getIdempotencyResponse, setIdempotencyResponse };
