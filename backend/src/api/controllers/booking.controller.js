const bookingService = require('../../services/booking.service');
const { parsePagination, paginatedResponse } = require('../../utils/pagination');
const { z } = require('zod');

const createBookingSchema = z.object({
  reservationId: z.string().uuid('Invalid reservation ID'),
  idempotencyKey: z.string().uuid('Invalid idempotency key'),
});

async function createBooking(request, reply) {
  const data = createBookingSchema.parse(request.body);
  const result = await bookingService.createBooking(
    request.user.id,
    data.reservationId,
    data.idempotencyKey
  );
  return reply.status(201).send({ success: true, data: result });
}

async function getUserBookings(request, reply) {
  const { skip, take, page, limit } = parsePagination(request.query);
  const { bookings, total } = await bookingService.getUserBookings(request.user.id, skip, take);
  return reply.send(paginatedResponse(bookings, total, page, limit));
}

async function getBooking(request, reply) {
  const booking = await bookingService.getBookingById(request.user.id, request.params.id);
  return reply.send({ success: true, data: booking });
}

async function cancelBooking(request, reply) {
  const result = await bookingService.cancelBooking(request.user.id, request.params.id);
  return reply.send({ success: true, data: result });
}

module.exports = { createBooking, getUserBookings, getBooking, cancelBooking };
