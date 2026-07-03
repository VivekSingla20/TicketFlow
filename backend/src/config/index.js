const dotenv = require('dotenv');
const Joi = require('joi');
const path = require('path');

// Load .env file
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const envSchema = Joi.object({
  // Server
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().integer().min(1).max(65535).default(3000),
  WORKER_CONCURRENCY: Joi.number().integer().min(1).max(100).default(10),

  // Database
  DATABASE_URL: Joi.string().uri({ scheme: ['postgresql', 'postgres'] }).required(),

  // Redis
  REDIS_URL: Joi.string().required(),

  // Auth
  JWT_SECRET: Joi.string().min(16).required(),
  JWT_ACCESS_EXPIRY: Joi.string().default('15m'),
  JWT_REFRESH_EXPIRY: Joi.string().default('7d'),
  REFRESH_COOKIE_SECRET: Joi.string().min(16).required(),

  // Reservation
  RESERVATION_TTL_MINUTES: Joi.number().integer().min(1).max(60).default(10),

  // Payment Mock
  MOCK_PAYMENT_WEBHOOK_SECRET: Joi.string().required(),
  MOCK_PAYMENT_SUCCESS_RATE: Joi.number().min(0).max(1).default(0.95),
  MOCK_PAYMENT_DELAY_MS_MIN: Joi.number().integer().min(0).default(200),
  MOCK_PAYMENT_DELAY_MS_MAX: Joi.number().integer().min(0).default(1200),

  // Rate Limiting
  RATE_LIMIT_GLOBAL_MAX: Joi.number().integer().min(1).default(500),
  RATE_LIMIT_GLOBAL_WINDOW_MS: Joi.number().integer().min(1000).default(60000),

  // Logging
  LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'debug').default('info'),
  LOG_FORMAT: Joi.string().valid('json', 'simple').default('json'),

  // WebSocket
  WS_CORS_ORIGINS: Joi.string().default('http://localhost:3001'),
}).unknown(true); // Allow unknown env vars (PATH, HOME, etc.)

const { error, value: envVars } = envSchema.validate(process.env, {
  abortEarly: false,
  stripUnknown: false,
});

if (error) {
  const details = error.details.map((d) => `  - ${d.message}`).join('\n');
  console.error(`\n❌ Environment validation failed:\n${details}\n`);
  process.exit(1);
}

const config = Object.freeze({
  env: envVars.NODE_ENV,
  isProduction: envVars.NODE_ENV === 'production',
  isDevelopment: envVars.NODE_ENV === 'development',

  server: {
    port: envVars.PORT,
    workerConcurrency: envVars.WORKER_CONCURRENCY,
  },

  db: {
    url: envVars.DATABASE_URL,
  },

  redis: {
    url: envVars.REDIS_URL,
  },

  auth: {
    jwtSecret: envVars.JWT_SECRET,
    accessExpiry: envVars.JWT_ACCESS_EXPIRY,
    refreshExpiry: envVars.JWT_REFRESH_EXPIRY,
    cookieSecret: envVars.REFRESH_COOKIE_SECRET,
  },

  reservation: {
    ttlMinutes: envVars.RESERVATION_TTL_MINUTES,
    ttlMs: envVars.RESERVATION_TTL_MINUTES * 60 * 1000,
  },

  payment: {
    webhookSecret: envVars.MOCK_PAYMENT_WEBHOOK_SECRET,
    successRate: envVars.MOCK_PAYMENT_SUCCESS_RATE,
    delayMin: envVars.MOCK_PAYMENT_DELAY_MS_MIN,
    delayMax: envVars.MOCK_PAYMENT_DELAY_MS_MAX,
  },

  rateLimit: {
    globalMax: envVars.RATE_LIMIT_GLOBAL_MAX,
    globalWindowMs: envVars.RATE_LIMIT_GLOBAL_WINDOW_MS,
  },

  logging: {
    level: envVars.LOG_LEVEL,
    format: envVars.LOG_FORMAT,
  },

  ws: {
    corsOrigins: envVars.WS_CORS_ORIGINS.split(',').map((s) => s.trim()),
  },
});

module.exports = config;
