const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * Mock Payment Provider
 *
 * Simulates a payment gateway with configurable success rate and delay.
 * Fires webhook asynchronously after processing.
 */

/**
 * Generate HMAC-SHA256 signature for webhook payload.
 */
function generateSignature(payload) {
  return crypto
    .createHmac('sha256', config.payment.webhookSecret)
    .update(JSON.stringify(payload))
    .digest('hex');
}

/**
 * Simulate a payment charge.
 *
 * @param {object} params
 * @param {number} params.amount
 * @param {string} params.bookingId
 * @param {string} params.idempotencyKey
 * @param {string} params.callbackUrl
 * @returns {object} { transactionId, status: "PROCESSING" }
 */
async function charge({ amount, bookingId, idempotencyKey, callbackUrl }) {
  const transactionId = `txn_${uuidv4()}`;

  logger.info('Mock payment charge initiated', {
    service: 'mock-payment',
    transactionId,
    bookingId,
    amount,
  });

  // Simulate random delay
  const delay = config.payment.delayMin +
    Math.random() * (config.payment.delayMax - config.payment.delayMin);

  // Fire webhook asynchronously after delay
  setTimeout(async () => {
    const success = Math.random() < config.payment.successRate;
    const status = success ? 'SUCCESS' : 'FAILED';
    const timestamp = new Date().toISOString();

    const payload = { bookingId, transactionId, status, amount, timestamp };
    const signature = generateSignature(payload);

    logger.info('Mock payment webhook firing', {
      service: 'mock-payment',
      transactionId,
      bookingId,
      status,
    });

    try {
      // Use native fetch to call back to our webhook endpoint
      const response = await fetch(callbackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, signature }),
      });

      logger.info('Mock payment webhook delivered', {
        service: 'mock-payment',
        transactionId,
        bookingId,
        status,
        webhookStatus: response.status,
      });
    } catch (err) {
      logger.error('Mock payment webhook delivery failed', {
        service: 'mock-payment',
        transactionId,
        bookingId,
        error: err.message,
      });
    }
  }, delay);

  return { transactionId, status: 'PROCESSING' };
}

/**
 * Simulate a payment refund.
 *
 * @param {object} params
 * @param {string} params.transactionId
 * @param {number} params.amount
 * @returns {object} { refundId, status }
 */
async function refund({ transactionId, amount }) {
  const refundId = `rfn_${uuidv4()}`;

  // 98% success rate for refunds
  const success = Math.random() < 0.98;

  // Simulate small delay
  await new Promise((resolve) => setTimeout(resolve, 100 + Math.random() * 300));

  const status = success ? 'PROCESSED' : 'FAILED';

  logger.info('Mock refund processed', {
    service: 'mock-payment',
    refundId,
    transactionId,
    amount,
    status,
  });

  if (!success) {
    throw new Error('Mock payment refund failed');
  }

  return { refundId, status };
}

/**
 * Register mock payment routes as a Fastify plugin.
 * These are internal endpoints, not public-facing.
 */
async function mockPaymentRoutes(fastify, options) {
  fastify.post('/charge', {
    schema: {
      summary: 'Mock payment charge',
      tags: ['Mock Payment'],
      body: {
        type: 'object',
        required: ['amount', 'bookingId', 'idempotencyKey', 'callbackUrl'],
        properties: {
          amount: { type: 'number' },
          bookingId: { type: 'string' },
          idempotencyKey: { type: 'string' },
          callbackUrl: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const result = await charge(request.body);
    return reply.send({ success: true, data: result });
  });

  fastify.post('/refund', {
    schema: {
      summary: 'Mock payment refund',
      tags: ['Mock Payment'],
      body: {
        type: 'object',
        required: ['transactionId', 'amount'],
        properties: {
          transactionId: { type: 'string' },
          amount: { type: 'number' },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const result = await refund(request.body);
      return reply.send({ success: true, data: result });
    } catch (err) {
      return reply.status(500).send({ success: false, error: { message: err.message } });
    }
  });
}

module.exports = { charge, refund, mockPaymentRoutes };
