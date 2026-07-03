const eventController = require('../controllers/event.controller');

async function eventRoutes(fastify, options) {
  // GET /api/events — list published events
  fastify.get('/', {
    schema: {
      summary: 'List published events',
      tags: ['Events'],
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', default: 1 },
          limit: { type: 'integer', default: 20 },
          city: { type: 'string' },
          dateFrom: { type: 'string', format: 'date' },
          dateTo: { type: 'string', format: 'date' },
        },
      },
    },
  }, eventController.listEvents);

  // GET /api/events/:id — event detail
  fastify.get('/:id', {
    schema: {
      summary: 'Get event details',
      tags: ['Events'],
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
      },
    },
  }, eventController.getEvent);

  // GET /api/events/:id/seats — full seat map with live status
  fastify.get('/:id/seats', {
    schema: {
      summary: 'Get seat map with live status',
      tags: ['Events'],
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
      },
    },
    config: {
      rateLimit: { max: 60, timeWindow: '1 minute' },
    },
  }, eventController.getEventSeats);
}

module.exports = eventRoutes;
