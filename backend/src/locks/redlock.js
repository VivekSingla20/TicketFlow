const { v4: uuidv4 } = require('uuid');
const { getRedisClient } = require('../cache/redis.client');
const logger = require('../utils/logger');

/**
 * Lua script to safely release a lock — only DEL if the value matches.
 * Prevents releasing a lock held by another process.
 */
const UNLOCK_SCRIPT = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
  else
    return 0
  end
`;

const DEFAULTS = {
  ttl: 15000,       // 15 seconds default lock TTL
  retryCount: 3,    // Number of retry attempts
  retryDelay: 50,   // ms between retries
};

/**
 * Acquire a distributed lock using SET NX PX.
 *
 * @param {string} resource - Lock key (e.g. "seat:lock:{eventSeatId}")
 * @param {object} [options]
 * @param {number} [options.ttl=15000] - Lock TTL in ms
 * @param {number} [options.retryCount=3]
 * @param {number} [options.retryDelay=50]
 * @returns {Promise<{ lockValue: string } | null>} Lock info or null if failed
 */
async function acquireLock(resource, options = {}) {
  const redis = getRedisClient();
  const ttl = options.ttl || DEFAULTS.ttl;
  const retryCount = options.retryCount ?? DEFAULTS.retryCount;
  const retryDelay = options.retryDelay || DEFAULTS.retryDelay;
  const lockValue = uuidv4();

  for (let attempt = 0; attempt <= retryCount; attempt++) {
    const result = await redis.set(resource, lockValue, 'PX', ttl, 'NX');

    if (result === 'OK') {
      logger.debug('Lock acquired', {
        service: 'lock',
        resource,
        lockValue,
        attempt,
        ttl,
      });
      return { lockValue };
    }

    if (attempt < retryCount) {
      // Wait before retrying with a small jitter
      const jitter = Math.random() * retryDelay * 0.5;
      await new Promise((resolve) => setTimeout(resolve, retryDelay + jitter));
    }
  }

  logger.warn('Lock acquisition failed after retries', {
    service: 'lock',
    resource,
    retryCount,
  });
  return null;
}

/**
 * Release a distributed lock. Only releases if the lock value matches
 * (preventing accidental release of another process's lock).
 *
 * @param {string} resource - Lock key
 * @param {string} lockValue - The UUID returned from acquireLock
 * @returns {Promise<boolean>} true if released, false if already expired/taken
 */
async function releaseLock(resource, lockValue) {
  const redis = getRedisClient();
  const result = await redis.eval(UNLOCK_SCRIPT, 1, resource, lockValue);

  if (result === 1) {
    logger.debug('Lock released', { service: 'lock', resource, lockValue });
    return true;
  }

  logger.warn('Lock release failed — already expired or held by another', {
    service: 'lock',
    resource,
    lockValue,
  });
  return false;
}

/**
 * Execute a function while holding a distributed lock.
 * Lock is automatically released in the finally block.
 *
 * @param {string} resource - Lock key
 * @param {Function} fn - Async function to execute while holding the lock
 * @param {object} [options] - Lock options
 * @returns {Promise<*>} Return value of fn
 * @throws If lock acquisition fails or fn throws
 */
async function withLock(resource, fn, options = {}) {
  const lock = await acquireLock(resource, options);
  if (!lock) {
    return null; // Caller decides what to do (usually throw SeatLockTimeoutError)
  }

  try {
    return await fn();
  } finally {
    await releaseLock(resource, lock.lockValue);
  }
}

module.exports = {
  acquireLock,
  releaseLock,
  withLock,
};
