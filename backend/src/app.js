const Fastify = require('fastify');
const config = require('./config');
const logger = require('./utils/logger');

/**
 * Fastify App Factory
 *
 * Creates and configures the Fastify instance with all plugins,
 * middleware, routes, and error handling.
 */
async function buildApp() {
  const app = Fastify({
    logger: false, // We use Winston instead
    requestIdHeader: 'x-request-id',
    genReqId: () => require('uuid').v4(),
    ajv: {
      customOptions: {
        removeAdditional: false,
        coerceTypes: true,
        allErrors: true,
      },
    },
  });

  // ─── Plugins ────────────────────────────────────────────────────────
  await app.register(require('@fastify/cors'), {
    origin: config.ws.corsOrigins,
    credentials: true,
  });

  await app.register(require('@fastify/cookie'), {
    secret: config.auth.cookieSecret,
  });

  await app.register(require('@fastify/websocket'));

  app.get('/ws', { websocket: true }, (connection, req) => {
    const { handleConnection } = require('./websocket/gateway');
    handleConnection(connection, req);
  });

  // ─── Swagger / OpenAPI ──────────────────────────────────────────────
  await app.register(require('@fastify/swagger'), {
    openapi: {
      openapi: '3.0.0',
      info: {
        title: 'Ticket Booking API',
        description: 'High-concurrency ticket booking backend — 20K concurrent users, 200 seats, zero double-bookings.',
        version: '1.0.0',
      },
      servers: [
        { url: `http://localhost:${config.server.port}`, description: 'Development' },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
      security: [{ bearerAuth: [] }],
      tags: [
        { name: 'Auth', description: 'Authentication endpoints' },
        { name: 'Admin', description: 'Admin-only endpoints' },
        { name: 'Events', description: 'Public event endpoints' },
        { name: 'Reservations', description: 'Seat reservation endpoints' },
        { name: 'Bookings', description: 'Booking management endpoints' },
        { name: 'Payments', description: 'Payment webhook endpoints' },
        { name: 'Notifications', description: 'User notification endpoints' },
        { name: 'Mock Payment', description: 'Mock payment provider (internal)' },
      ],
    },
  });

  await app.register(require('@fastify/swagger-ui'), {
    routePrefix: '/api/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
    },
  });

  // ─── Rate Limiting ──────────────────────────────────────────────────
  await app.register(require('@fastify/rate-limit'), {
    max: config.rateLimit.globalMax,
    timeWindow: config.rateLimit.globalWindowMs,
    redis: require('./cache/redis.client').getRedisClient(),
    keyGenerator: (request) => {
      const authHeader = request.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
          const token = authHeader.slice(7);
          const decoded = require('jsonwebtoken').decode(token);
          if (decoded && decoded.sub) {
            return decoded.sub;
          }
        } catch (err) {
          // Fallback to IP on decoding error
        }
      }
      return request.user?.id || request.ip;
    },
    errorResponseBuilder: (request, context) => {
      return {
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Rate limit exceeded. Please slow down.',
          requestId: request.id,
          retryAfter: Math.ceil(context.ttl / 1000),
        },
      };
    },
  });

  // ─── Request Lifecycle Hooks ────────────────────────────────────────

  // Attach request ID
  app.addHook('onRequest', async (request, reply) => {
    request.requestId = request.id;
    reply.header('X-Request-Id', request.id);
  });

  // Request logging
  app.addHook('onRequest', async (request) => {
    request.startTime = Date.now();
    logger.info('Request started', {
      service: 'http',
      requestId: request.id,
      method: request.method,
      url: request.url,
      ip: request.ip,
    });
  });

  // Response logging
  app.addHook('onResponse', async (request, reply) => {
    const duration = Date.now() - (request.startTime || Date.now());
    logger.info('Request completed', {
      service: 'http',
      requestId: request.id,
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      durationMs: duration,
      userId: request.user?.id,
    });
  });

  // ─── Error Handler ──────────────────────────────────────────────────
  const { errorHandler } = require('./api/middlewares/error-handler.middleware');
  app.setErrorHandler(errorHandler);

  // ─── Routes ─────────────────────────────────────────────────────────
  app.register(require('./api/routes/auth.routes'), { prefix: '/api/auth' });
  app.register(require('./api/routes/admin.routes'), { prefix: '/api/admin' });
  app.register(require('./api/routes/event.routes'), { prefix: '/api/events' });
  app.register(require('./api/routes/reservation.routes'), { prefix: '/api/reservations' });
  app.register(require('./api/routes/booking.routes'), { prefix: '/api/bookings' });
  app.register(require('./api/routes/payment.routes'), { prefix: '/api/payments' });
  app.register(require('./api/routes/notification.routes'), { prefix: '/api/notifications' });

  // Mock payment provider routes
  const { mockPaymentRoutes } = require('./mock-payment/payment.provider');
  app.register(mockPaymentRoutes, { prefix: '/mock-payment' });

  // Health check
  app.get('/health', {
    schema: {
      summary: 'Health check',
      tags: ['System'],
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            timestamp: { type: 'string' },
            uptime: { type: 'number' },
          },
        },
      },
    },
  }, async (request, reply) => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  });

  return app;
}

module.exports = { buildApp };
