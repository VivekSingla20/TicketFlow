const bookingController = require('../controllers/booking.controller');
const { authenticate } = require('../middlewares/auth.middleware');

async function bookingRoutes(fastify, options) {
  fastify.addHook('onRequest', authenticate);

  // POST /api/bookings
  fastify.post('/', {
    schema: {
      summary: 'Confirm reservation and create booking',
      tags: ['Bookings'],
      body: {
        type: 'object',
        required: ['reservationId', 'idempotencyKey'],
        properties: {
          reservationId: { type: 'string', format: 'uuid' },
          idempotencyKey: { type: 'string', format: 'uuid' },
        },
      },
    },
    config: {
      rateLimit: { max: 3, timeWindow: '1 minute' },
    },
  }, bookingController.createBooking);

  // GET /api/bookings
  fastify.get('/', {
    schema: {
      summary: 'Get booking history',
      tags: ['Bookings'],
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', default: 1 },
          limit: { type: 'integer', default: 20 },
        },
      },
    },
  }, bookingController.getUserBookings);

  // GET /api/bookings/:id
  fastify.get('/:id', {
    schema: {
      summary: 'Get booking details',
      tags: ['Bookings'],
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
      },
    },
  }, bookingController.getBooking);

  // POST /api/bookings/:id/cancel
  fastify.post('/:id/cancel', {
    schema: {
      summary: 'Cancel booking and request refund',
      tags: ['Bookings'],
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
      },
    },
  }, bookingController.cancelBooking);
}

module.exports = bookingRoutes;
