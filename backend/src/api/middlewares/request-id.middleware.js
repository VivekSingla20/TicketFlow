const { v4: uuidv4 } = require('uuid');

/**
 * Attach a unique request ID to every incoming request.
 * Used for distributed tracing in logs.
 */
async function requestIdMiddleware(request, reply) {
  request.requestId = request.headers['x-request-id'] || uuidv4();
  reply.header('X-Request-Id', request.requestId);
}

module.exports = { requestIdMiddleware };
