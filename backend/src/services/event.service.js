const { getPrisma } = require('../db/prisma/client');
const { warmSeatCache, invalidateSeatCache } = require('../cache/seat.cache');
const { enqueueEventCancellation } = require('../queues/notification.queue');
const logger = require('../utils/logger');
const { NotFoundError, EventNotAvailableError, ValidationError } = require('../utils/errors');

/**
 * Create an event linked to a venue and seed EventSeat records.
 */
async function createEvent(data, userId) {
  const prisma = getPrisma();

  // Verify venue exists
  const venue = await prisma.venue.findUnique({
    where: { id: data.venueId },
    include: { seats: { where: { isActive: true } } },
  });

  if (!venue) {
    throw new NotFoundError('Venue');
  }

  // Create event and seed EventSeats in a transaction
  const event = await prisma.$transaction(async (tx) => {
    const ev = await tx.event.create({
      data: {
        title: data.title,
        description: data.description || null,
        venueId: data.venueId,
        startsAt: new Date(data.startsAt),
        endsAt: new Date(data.endsAt),
        status: 'DRAFT',
        createdBy: userId,
      },
    });

    // Seed EventSeats from venue's active seats with pricing per section
    const pricing = data.pricing || { REGULAR: 50, VIP: 150, PREMIUM: 300 };
    const eventSeats = venue.seats.map((seat) => ({
      eventId: ev.id,
      seatId: seat.id,
      price: pricing[seat.section] || pricing.REGULAR || 50,
      status: 'AVAILABLE',
      version: 0,
    }));

    await tx.eventSeat.createMany({ data: eventSeats });

    return ev;
  });

  logger.info('Event created', {
    service: 'event',
    eventId: event.id,
    venueId: data.venueId,
    seatCount: venue.seats.length,
  });

  return event;
}

/**
 * Update event metadata (only DRAFT events).
 */
async function updateEvent(eventId, data) {
  const prisma = getPrisma();

  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) throw new NotFoundError('Event');
  if (event.status !== 'DRAFT') {
    throw new ValidationError('Only DRAFT events can be updated');
  }

  const updated = await prisma.event.update({
    where: { id: eventId },
    data: {
      ...(data.title && { title: data.title }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.startsAt && { startsAt: new Date(data.startsAt) }),
      ...(data.endsAt && { endsAt: new Date(data.endsAt) }),
    },
  });

  return updated;
}

/**
 * Publish an event — set status to PUBLISHED and warm the Redis seat cache.
 */
async function publishEvent(eventId) {
  const prisma = getPrisma();

  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) throw new NotFoundError('Event');
  if (event.status !== 'DRAFT') {
    throw new ValidationError('Only DRAFT events can be published');
  }

  const updated = await prisma.event.update({
    where: { id: eventId },
    data: { status: 'PUBLISHED' },
  });

  // Warm the Redis seat cache
  const eventSeats = await prisma.eventSeat.findMany({
    where: { eventId },
    select: { id: true, seatId: true, status: true },
  });

  await warmSeatCache(eventId, eventSeats);

  logger.info('Event published and seat cache warmed', {
    service: 'event',
    eventId,
    seatCount: eventSeats.length,
  });

  return updated;
}

/**
 * Cancel an event — set status to CANCELLED, enqueue mass refund jobs.
 */
async function cancelEvent(eventId) {
  const prisma = getPrisma();

  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) throw new NotFoundError('Event');
  if (event.status === 'CANCELLED') {
    throw new ValidationError('Event is already cancelled');
  }

  await prisma.event.update({
    where: { id: eventId },
    data: { status: 'CANCELLED' },
  });

  // Find all confirmed bookings for this event → fan-out refund jobs
  const confirmedBookings = await prisma.booking.findMany({
    where: { eventId, status: 'CONFIRMED' },
    include: {
      payments: { where: { status: 'SUCCESS' } },
    },
  });

  // Enqueue refund jobs asynchronously (return 202 immediately)
  for (const booking of confirmedBookings) {
    for (const payment of booking.payments) {
      try {
        const { enqueueRefund } = require('../queues/refund.queue');
        await enqueueRefund(booking.id, payment.id, parseFloat(payment.amount));
      } catch (err) {
        logger.error('Failed to enqueue refund for event cancellation', {
          service: 'event',
          bookingId: booking.id,
          paymentId: payment.id,
          error: err.message,
        });
      }
    }
  }

  // Invalidate seat cache
  await invalidateSeatCache(eventId);

  logger.info('Event cancelled, refund jobs enqueued', {
    service: 'event',
    eventId,
    bookingsToRefund: confirmedBookings.length,
  });

  return { eventId, bookingsToRefund: confirmedBookings.length };
}

/**
 * Get real-time dashboard stats for an event (from Redis cache with DB fallback).
 */
async function getDashboard(eventId) {
  const prisma = getPrisma();
  const { getSeatStatuses } = require('../cache/seat.cache');

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, title: true, status: true, startsAt: true, endsAt: true },
  });

  if (!event) throw new NotFoundError('Event');

  // Try Redis cache first
  let seatStatuses = await getSeatStatuses(eventId);

  // Fallback to DB
  if (!seatStatuses) {
    const eventSeats = await prisma.eventSeat.findMany({
      where: { eventId },
      select: { seatId: true, status: true },
    });
    seatStatuses = {};
    for (const es of eventSeats) {
      seatStatuses[es.seatId] = es.status;
    }
  }

  // Aggregate counts
  const counts = { AVAILABLE: 0, RESERVED: 0, BOOKED: 0, DISABLED: 0 };
  for (const status of Object.values(seatStatuses)) {
    counts[status] = (counts[status] || 0) + 1;
  }

  return {
    event,
    stats: {
      total: Object.values(counts).reduce((a, b) => a + b, 0),
      available: counts.AVAILABLE,
      reserved: counts.RESERVED,
      booked: counts.BOOKED,
      disabled: counts.DISABLED,
    },
  };
}

/**
 * List published events (public, paginated, filterable).
 */
async function listPublishedEvents(filters = {}, skip = 0, take = 20) {
  const prisma = getPrisma();

  const where = { status: 'PUBLISHED' };

  if (filters.city) {
    where.venue = { city: { contains: filters.city, mode: 'insensitive' } };
  }
  if (filters.dateFrom) {
    where.startsAt = { ...(where.startsAt || {}), gte: new Date(filters.dateFrom) };
  }
  if (filters.dateTo) {
    where.startsAt = { ...(where.startsAt || {}), lte: new Date(filters.dateTo) };
  }

  const [events, total] = await Promise.all([
    prisma.event.findMany({
      where,
      skip,
      take,
      orderBy: { startsAt: 'asc' },
      include: {
        venue: { select: { id: true, name: true, city: true } },
      },
    }),
    prisma.event.count({ where }),
  ]);

  return { events, total };
}

/**
 * Get event detail by ID.
 */
async function getEventById(eventId) {
  const prisma = getPrisma();

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      venue: { select: { id: true, name: true, address: true, city: true, totalCapacity: true } },
    },
  });

  if (!event) throw new NotFoundError('Event');
  return event;
}

/**
 * Get the full seat map for an event (from Redis cache with DB fallback).
 */
async function getEventSeats(eventId) {
  const prisma = getPrisma();
  const { getSeatStatuses } = require('../cache/seat.cache');

  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) throw new NotFoundError('Event');
  if (event.status !== 'PUBLISHED') {
    throw new EventNotAvailableError(eventId);
  }

  // Try Redis cache first
  const cachedStatuses = await getSeatStatuses(eventId);

  // Get full seat details from DB
  const eventSeats = await prisma.eventSeat.findMany({
    where: { eventId },
    include: {
      seat: { select: { id: true, row: true, number: true, section: true } },
    },
    orderBy: [
      { seat: { row: 'asc' } },
      { seat: { number: 'asc' } },
    ],
  });

  // Merge cached statuses if available
  const seats = eventSeats.map((es) => ({
    id: es.seatId,
    eventSeatId: es.id,
    seatId: es.seatId,
    row: es.seat.row,
    number: es.seat.number,
    section: es.seat.section,
    price: es.price,
    status: cachedStatuses ? (cachedStatuses[es.seatId] || es.status) : es.status,
  }));

  return seats;
}

/**
 * List all events (including drafts and cancelled) with pagination.
 */
async function listAllEvents(skip = 0, take = 20) {
  const prisma = getPrisma();

  const [events, total] = await Promise.all([
    prisma.event.findMany({
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        venue: { select: { id: true, name: true, city: true } },
      },
    }),
    prisma.event.count(),
  ]);

  return { events, total };
}

module.exports = {
  createEvent,
  updateEvent,
  publishEvent,
  cancelEvent,
  getDashboard,
  listPublishedEvents,
  listAllEvents,
  getEventById,
  getEventSeats,
};
