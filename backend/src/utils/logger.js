const winston = require('winston');
const config = require('../config');

const logger = winston.createLogger({
  level: config.logging.level,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
    winston.format.errors({ stack: true }),
    config.logging.format === 'json'
      ? winston.format.json()
      : winston.format.combine(
          winston.format.colorize(),
          winston.format.printf(({ timestamp, level, message, service, requestId, userId, ...metadata }) => {
            let msg = `${timestamp} [${level}]`;
            if (service) msg += ` [${service}]`;
            if (requestId) msg += ` [${requestId}]`;
            if (userId) msg += ` [user:${userId}]`;
            msg += ` ${message}`;
            const metaKeys = Object.keys(metadata);
            if (metaKeys.length > 0) {
              msg += ` ${JSON.stringify(metadata)}`;
            }
            return msg;
          })
        )
  ),
  defaultMeta: { service: 'ticket-api' },
  transports: [
    new winston.transports.Console(),
  ],
});

/**
 * Create a child logger with request context
 */
logger.child = function createChild(meta) {
  return winston.createLogger({
    level: this.level,
    format: this.format,
    defaultMeta: { ...this.defaultMeta, ...meta },
    transports: this.transports,
  });
};

module.exports = logger;
