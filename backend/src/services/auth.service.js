const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { getPrisma } = require('../db/prisma/client');
const { getRedisClient } = require('../cache/redis.client');
const config = require('../config');
const logger = require('../utils/logger');
const { UnauthorizedError, ValidationError } = require('../utils/errors');

const SALT_ROUNDS = 12;

/**
 * Parse a duration string like '15m', '7d' into seconds.
 */
function parseExpiry(str) {
  const match = str.match(/^(\d+)(s|m|h|d)$/);
  if (!match) return 900; // default 15 min
  const num = parseInt(match[1], 10);
  const unit = match[2];
  const multipliers = { s: 1, m: 60, h: 3600, d: 86400 };
  return num * (multipliers[unit] || 60);
}

/**
 * Generate JWT access token.
 */
function generateAccessToken(user) {
  const jti = uuidv4();
  const token = jwt.sign(
    { sub: user.id, email: user.email, role: user.role, jti },
    config.auth.jwtSecret,
    { expiresIn: config.auth.accessExpiry }
  );
  return { token, jti };
}

/**
 * Generate a refresh token and store it in the database.
 */
async function generateRefreshToken(userId) {
  const prisma = getPrisma();
  const token = uuidv4();
  const expiresAt = new Date(Date.now() + parseExpiry(config.auth.refreshExpiry) * 1000);

  await prisma.refreshToken.create({
    data: {
      userId,
      token,
      expiresAt,
    },
  });

  return token;
}

/**
 * Register a new user.
 */
async function register(email, password) {
  const prisma = getPrisma();

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new ValidationError('Email already registered');
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await prisma.user.create({
    data: { email, passwordHash },
    select: { id: true, email: true, role: true, createdAt: true },
  });

  logger.info('User registered', { service: 'auth', userId: user.id, email: user.email });
  return user;
}

/**
 * Login — verify credentials and return tokens.
 */
async function login(email, password) {
  const prisma = getPrisma();

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new UnauthorizedError('Invalid email or password');
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw new UnauthorizedError('Invalid email or password');
  }

  const { token: accessToken, jti } = generateAccessToken(user);
  const refreshToken = await generateRefreshToken(user.id);

  logger.info('User logged in', { service: 'auth', userId: user.id });

  return {
    accessToken,
    refreshToken,
    user: { id: user.id, email: user.email, role: user.role },
  };
}

/**
 * Refresh — issue a new access token using a valid refresh token.
 */
async function refresh(refreshTokenValue) {
  const prisma = getPrisma();

  const storedToken = await prisma.refreshToken.findUnique({
    where: { token: refreshTokenValue },
    include: { user: true },
  });

  if (!storedToken || storedToken.revoked || storedToken.expiresAt < new Date()) {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }

  const { token: accessToken } = generateAccessToken(storedToken.user);

  logger.info('Token refreshed', { service: 'auth', userId: storedToken.userId });

  return { accessToken };
}

/**
 * Logout — revoke refresh token and blacklist access token JTI.
 */
async function logout(userId, jti, refreshTokenValue) {
  const prisma = getPrisma();
  const redis = getRedisClient();

  // Revoke refresh token in DB
  if (refreshTokenValue) {
    await prisma.refreshToken.updateMany({
      where: { token: refreshTokenValue, userId },
      data: { revoked: true },
    });
  }

  // Blacklist the access token JTI in Redis with remaining TTL
  if (jti) {
    const ttl = parseExpiry(config.auth.accessExpiry);
    await redis.set(`blacklist:token:${jti}`, '1', 'EX', ttl);
  }

  logger.info('User logged out', { service: 'auth', userId });
}

module.exports = {
  register,
  login,
  refresh,
  logout,
};
