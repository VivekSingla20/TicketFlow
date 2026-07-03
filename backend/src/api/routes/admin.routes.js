const adminController = require('../controllers/admin.controller');
const { authenticate, authorizeRole } = require('../middlewares/auth.middleware');

async function adminRoutes(fastify, options) {
  // All admin routes require authentication + ADMIN role
  fastify.addHook('onRequest', authenticate);
  fastify.addHook('onRequest', authorizeRole('ADMIN'));

  // POST /api/admin/venues
  fastify.post('/venues', {
    schema: {
      summary: 'Create a venue with seat layout',
      tags: ['Admin'],
      body: {
        type: 'object',
        required: ['name', 'address', 'city', 'layoutConfig'],
        properties: {
          name: { type: 'string' },
          address: { type: 'string' },
          city: { type: 'string' },
          layoutConfig: { type: 'object' },
        },
      },
    },
  }, adminController.createVenue);

  // GET /api/admin/venues
  fastify.get('/venues', {
    schema: {
      summary: 'List all venues',
      tags: ['Admin'],
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', default: 1 },
          limit: { type: 'integer', default: 20 },
        },
      },
    },
  }, adminController.listVenues);

  // POST /api/admin/events
  fastify.post('/events', {
    schema: {
      summary: 'Create an event',
      tags: ['Admin'],
      body: {
        type: 'object',
        required: ['title', 'venueId', 'startsAt', 'endsAt'],
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          venueId: { type: 'string', format: 'uuid' },
          startsAt: { type: 'string', format: 'date-time' },
          endsAt: { type: 'string', format: 'date-time' },
          pricing: {
            type: 'object',
            properties: {
              REGULAR: { type: 'number' },
              VIP: { type: 'number' },
              PREMIUM: { type: 'number' },
            },
          },
        },
      },
    },
  }, adminController.createEvent);

  // GET /api/admin/events
  fastify.get('/events', {
    schema: {
      summary: 'List all events (including drafts) for admin',
      tags: ['Admin'],
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', default: 1 },
          limit: { type: 'integer', default: 20 },
        },
      },
    },
  }, adminController.listEvents);

  // PUT /api/admin/events/:id
  fastify.put('/events/:id', {
    schema: {
      summary: 'Update event metadata (DRAFT only)',
      tags: ['Admin'],
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
      },
      body: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          startsAt: { type: 'string', format: 'date-time' },
          endsAt: { type: 'string', format: 'date-time' },
        },
      },
    },
  }, adminController.updateEvent);

  // PATCH /api/admin/events/:id/publish
  fastify.patch('/events/:id/publish', {
    schema: {
      summary: 'Publish event and warm seat cache',
      tags: ['Admin'],
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
      },
    },
  }, adminController.publishEvent);

  // PATCH /api/admin/events/:id/cancel
  fastify.patch('/events/:id/cancel', {
    schema: {
      summary: 'Cancel event and trigger mass refunds',
      tags: ['Admin'],
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
      },
    },
  }, adminController.cancelEvent);

  // GET /api/admin/events/:id/dashboard
  fastify.get('/events/:id/dashboard', {
    schema: {
      summary: 'Real-time booking stats',
      tags: ['Admin'],
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
      },
    },
  }, adminController.getDashboard);
}

module.exports = adminRoutes;
