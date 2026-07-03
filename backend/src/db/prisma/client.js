const { PrismaClient } = require('../../generated/prisma');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
const config = require('../../config');
const logger = require('../../utils/logger');

let prisma = null;
let pool = null;

/**
 * Get or create the Prisma client singleton with PG adapter.
 */
function getPrisma() {
  if (!prisma) {
    pool = new Pool({
      connectionString: config.db.url,
    });

    const adapter = new PrismaPg(pool);

    prisma = new PrismaClient({
      adapter,
      log: [
        { level: 'error', emit: 'event' },
        { level: 'warn', emit: 'event' },
      ],
    });

    prisma.$on('error', (e) => {
      logger.error('Prisma error', { service: 'prisma', error: e.message });
    });

    prisma.$on('warn', (e) => {
      logger.warn('Prisma warning', { service: 'prisma', message: e.message });
    });
  }
  return prisma;
}

/**
 * Gracefully disconnect Prisma and the underlying PG pool.
 */
async function closePrisma() {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
    logger.info('Prisma disconnected', { service: 'prisma' });
  }
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('PG pool closed', { service: 'prisma' });
  }
}

module.exports = { getPrisma, closePrisma };
