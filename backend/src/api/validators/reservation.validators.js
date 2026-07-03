const { z } = require('zod');

const createReservationSchema = z.object({
  eventId: z.string().uuid('Invalid event ID'),
  seatIds: z.array(z.string().uuid('Invalid seat ID')).min(1, 'At least one seat is required').max(10, 'Maximum 10 seats per reservation'),
});

module.exports = { createReservationSchema };
