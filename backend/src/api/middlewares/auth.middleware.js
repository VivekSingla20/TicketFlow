const jwt = require('jsonwebtoken');
const config = require('../../config');
const { getRedisClient } = require('../../cache/redis.client');
const { UnauthorizedError, ForbiddenError } = require('../../utils/errors');
const logger = require('../../utils/logger');

/**
 * Authentication middleware — verifies JWT from Authorization header.
 * Attaches decoded user to request.user.
 */
async function authenticate(request, reply) {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing or invalid Authorization header');
  }

  const token = authHeader.slice(7);

  let decoded;
  try {
    decoded = jwt.verify(token, config.auth.jwtSecret);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw new UnauthorizedError('Access token has expired');
    }
    throw new UnauthorizedError('Invalid access token');
  }

  // Check if JTI is blacklisted (logged-out token)
  if (decoded.jti) {
    const redis = getRedisClient();
    const blacklisted = await redis.get(`blacklist:token:${decoded.jti}`);
    if (blacklisted) {
      throw new UnauthorizedError('Token has been revoked');
    }
  }

  // Attach user to request context
  request.user = {
    id: decoded.sub,
    email: decoded.email,
    role: decoded.role,
    jti: decoded.jti,
  };
}

/**
 * Authorization middleware factory — restricts to specified roles.
 *
 * @param  {...string} roles - Allowed roles (e.g. 'ADMIN')
 */
function authorizeRole(...roles) {
  return async function authorize(request, reply) {
    if (!request.user) {
      throw new UnauthorizedError('Authentication required');
    }
    if (!roles.includes(request.user.role)) {
      throw new ForbiddenError(`Requires one of roles: ${roles.join(', ')}`);
    }
  };
}

module.exports = { authenticate, authorizeRole };
