const { getPrisma } = require('../db/prisma/client');
const logger = require('../utils/logger');

/**
 * Create a venue and auto-generate physical seats from the layout config.
 *
 * layoutConfig shape:
 * {
 *   sections: [
 *     { name: "REGULAR", rows: [{ row: "A", seatsCount: 20 }, { row: "B", seatsCount: 20 }] },
 *     { name: "VIP", rows: [{ row: "C", seatsCount: 10 }] }
 *   ]
 * }
 */
async function createVenue(data) {
  const prisma = getPrisma();

  // Calculate total capacity from layout
  let totalCapacity = 0;
  const seatRecords = [];

  for (const section of data.layoutConfig.sections) {
    for (const rowDef of section.rows) {
      for (let i = 1; i <= rowDef.seatsCount; i++) {
        totalCapacity++;
        seatRecords.push({
          row: rowDef.row,
          number: i,
          section: section.name,
          isActive: true,
        });
      }
    }
  }

  // Create venue + all seats in a transaction
  const venue = await prisma.$transaction(async (tx) => {
    const v = await tx.venue.create({
      data: {
        name: data.name,
        address: data.address,
        city: data.city,
        totalCapacity,
        layoutConfig: data.layoutConfig,
      },
    });

    // Batch create seats
    await tx.seat.createMany({
      data: seatRecords.map((s) => ({
        ...s,
        venueId: v.id,
      })),
    });

    return v;
  });

  logger.info('Venue created with seats', {
    service: 'venue',
    venueId: venue.id,
    totalCapacity,
    seatCount: seatRecords.length,
  });

  return { ...venue, totalCapacity };
}

/**
 * List all venues with pagination.
 */
async function listVenues(skip, take) {
  const prisma = getPrisma();

  const [venues, total] = await Promise.all([
    prisma.venue.findMany({
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        address: true,
        city: true,
        totalCapacity: true,
        createdAt: true,
      },
    }),
    prisma.venue.count(),
  ]);

  return { venues, total };
}

module.exports = { createVenue, listVenues };
