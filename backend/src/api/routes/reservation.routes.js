const reservationController = require('../controllers/reservation.controller');
const { authenticate } = require('../middlewares/auth.middleware');

async function reservationRoutes(fastify, options) {
  // All reservation routes require authentication
  fastify.addHook('onRequest', authenticate);

  // POST /api/reservations — The critical hot path
  fastify.post('/', {
    schema: {
      summary: 'Reserve seats (critical concurrency path)',
      tags: ['Reservations'],
      body: {
        type: 'object',
        required: ['eventId', 'seatIds'],
        properties: {
          eventId: { type: 'string', format: 'uuid' },
          seatIds: {
            type: 'array',
            items: { type: 'string', format: 'uuid' },
            minItems: 1,
            maxItems: 10,
          },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                reservationId: { type: 'string' },
                expiresAt: { type: 'string' },
                seats: { type: 'array' },
              },
            },
          },
        },
      },
    },
    config: {
      rateLimit: { max: 5, timeWindow: '1 minute' },
    },
  }, reservationController.createReservation);

  // GET /api/reservations/:id
  fastify.get('/:id', {
    schema: {
      summary: 'Check reservation status and remaining time',
      tags: ['Reservations'],
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
      },
    },
  }, reservationController.getReservation);

  // DELETE /api/reservations/:id — Voluntarily release
  fastify.delete('/:id', {
    schema: {
      summary: 'Cancel reservation and release seats',
      tags: ['Reservations'],
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
      },
    },
  }, reservationController.cancelReservation);
}

module.exports = reservationRoutes;
