const notificationController = require('../controllers/notification.controller');
const { authenticate } = require('../middlewares/auth.middleware');

async function notificationRoutes(fastify, options) {
  fastify.addHook('onRequest', authenticate);

  // GET /api/notifications
  fastify.get('/', {
    schema: {
      summary: 'Get user notifications',
      tags: ['Notifications'],
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', default: 1 },
          limit: { type: 'integer', default: 20 },
          isRead: { type: 'string', enum: ['true', 'false'] },
        },
      },
    },
  }, notificationController.getNotifications);

  // PATCH /api/notifications/:id/read
  fastify.patch('/:id/read', {
    schema: {
      summary: 'Mark notification as read',
      tags: ['Notifications'],
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
      },
    },
  }, notificationController.markAsRead);

  // PATCH /api/notifications/read-all
  fastify.patch('/read-all', {
    schema: {
      summary: 'Mark all notifications as read',
      tags: ['Notifications'],
    },
  }, notificationController.markAllAsRead);
}

module.exports = notificationRoutes;
