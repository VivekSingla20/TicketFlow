const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { registerSchema, loginSchema, refreshSchema } = require('../validators/auth.validators');
const { zodToJsonSchema } = require('zod-to-json-schema');

async function authRoutes(fastify, options) {
  // POST /api/auth/register
  fastify.post('/register', {
    schema: {
      summary: 'Register a new user',
      tags: ['Auth'],
      body: zodToJsonSchema(registerSchema, { target: 'openApi3' }),
      response: {
        201: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                email: { type: 'string' },
                role: { type: 'string' },
                createdAt: { type: 'string' },
              },
            },
          },
        },
      },
    },
    config: {
      rateLimit: { max: 5, timeWindow: '1 minute' },
    },
  }, authController.register);

  // POST /api/auth/login
  fastify.post('/login', {
    schema: {
      summary: 'Login and get tokens',
      tags: ['Auth'],
      body: zodToJsonSchema(loginSchema, { target: 'openApi3' }),
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                accessToken: { type: 'string' },
                refreshToken: { type: 'string' },
                user: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    email: { type: 'string' },
                    role: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
    config: {
      rateLimit: { max: 10, timeWindow: '1 minute' },
    },
  }, authController.login);

  // POST /api/auth/refresh
  fastify.post('/refresh', {
    schema: {
      summary: 'Refresh access token',
      tags: ['Auth'],
      body: zodToJsonSchema(refreshSchema, { target: 'openApi3' }),
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                accessToken: { type: 'string' },
              },
            },
          },
        },
      },
    },
  }, authController.refresh);

  // POST /api/auth/logout (authenticated)
  fastify.post('/logout', {
    onRequest: [authenticate],
    schema: {
      summary: 'Logout and revoke tokens',
      tags: ['Auth'],
      body: {
        type: 'object',
        properties: {
          refreshToken: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, authController.logout);
}

module.exports = authRoutes;
