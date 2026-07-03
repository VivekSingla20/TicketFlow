/**
 * Database Seed Script
 *
 * Creates an admin user and sample venue/event data for development.
 * Run: npm run prisma:seed
 */

const { PrismaClient } = require('../generated/prisma');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Seeding database...\n');

  // 1. Create admin user
  const adminPasswordHash = await bcrypt.hash('Admin@123', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@ticketbooking.com' },
    update: {},
    create: {
      email: 'admin@ticketbooking.com',
      passwordHash: adminPasswordHash,
      role: 'ADMIN',
    },
  });
  console.log(`✅ Admin user: ${admin.email} (id: ${admin.id})`);

  // 2. Create regular test user
  const userPasswordHash = await bcrypt.hash('User@123', 12);
  const user = await prisma.user.upsert({
    where: { email: 'user@ticketbooking.com' },
    update: {},
    create: {
      email: 'user@ticketbooking.com',
      passwordHash: userPasswordHash,
      role: 'USER',
    },
  });
  console.log(`✅ Test user: ${user.email} (id: ${user.id})`);

  // 3. Create a sample venue with 200 seats
  const existingVenue = await prisma.venue.findFirst({ where: { name: 'Grand Arena' } });
  let venue;

  if (!existingVenue) {
    const layoutConfig = {
      sections: [
        {
          name: 'VIP',
          rows: [
            { row: 'A', seatsCount: 10 },
            { row: 'B', seatsCount: 10 },
          ],
        },
        {
          name: 'PREMIUM',
          rows: [
            { row: 'C', seatsCount: 15 },
            { row: 'D', seatsCount: 15 },
          ],
        },
        {
          name: 'REGULAR',
          rows: [
            { row: 'E', seatsCount: 25 },
            { row: 'F', seatsCount: 25 },
            { row: 'G', seatsCount: 25 },
            { row: 'H', seatsCount: 25 },
            { row: 'I', seatsCount: 25 },
            { row: 'J', seatsCount: 25 },
          ],
        },
      ],
    };

    // Calculate total capacity
    let totalCapacity = 0;
    const seatRecords = [];
    for (const section of layoutConfig.sections) {
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

    venue = await prisma.venue.create({
      data: {
        name: 'Grand Arena',
        address: '123 Main Street',
        city: 'Mumbai',
        totalCapacity,
        layoutConfig,
      },
    });

    // Create seats
    await prisma.seat.createMany({
      data: seatRecords.map((s) => ({ ...s, venueId: venue.id })),
    });

    console.log(`✅ Venue: ${venue.name} (${totalCapacity} seats, id: ${venue.id})`);
  } else {
    venue = existingVenue;
    console.log(`✅ Venue already exists: ${venue.name} (id: ${venue.id})`);
  }

  // 4. Create a sample event
  const existingEvent = await prisma.event.findFirst({
    where: { title: 'Midnight Concert 2026' },
  });

  if (!existingEvent) {
    const event = await prisma.event.create({
      data: {
        title: 'Midnight Concert 2026',
        description: 'An unforgettable evening of live music under the stars.',
        venueId: venue.id,
        startsAt: new Date('2026-08-15T20:00:00Z'),
        endsAt: new Date('2026-08-16T01:00:00Z'),
        status: 'DRAFT',
        createdBy: admin.id,
      },
    });

    // Seed EventSeats
    const seats = await prisma.seat.findMany({
      where: { venueId: venue.id, isActive: true },
    });

    const pricing = { REGULAR: 50, VIP: 150, PREMIUM: 100 };

    await prisma.eventSeat.createMany({
      data: seats.map((seat) => ({
        eventId: event.id,
        seatId: seat.id,
        price: pricing[seat.section] || 50,
        status: 'AVAILABLE',
        version: 0,
      })),
    });

    console.log(`✅ Event: ${event.title} (${seats.length} seats, id: ${event.id})`);
    console.log(`   Status: DRAFT — use PATCH /api/admin/events/${event.id}/publish to publish`);
  } else {
    console.log(`✅ Event already exists: ${existingEvent.title} (id: ${existingEvent.id})`);
  }

  console.log('\n🎉 Seeding complete!\n');
  console.log('Credentials:');
  console.log('  Admin: admin@ticketbooking.com / Admin@123');
  console.log('  User:  user@ticketbooking.com / User@123');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('Seeding failed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
