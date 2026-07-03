const reservationService = require('../../services/reservation.service');
const { createReservationSchema } = require('../validators/reservation.validators');

async function createReservation(request, reply) {
  const data = createReservationSchema.parse(request.body);
  const result = await reservationService.createReservation(
    request.user.id,
    data.eventId,
    data.seatIds
  );
  return reply.status(201).send({ success: true, data: result });
}

async function getReservation(request, reply) {
  const result = await reservationService.getReservation(
    request.user.id,
    request.params.id
  );
  return reply.send({ success: true, data: result });
}

async function cancelReservation(request, reply) {
  const result = await reservationService.cancelReservation(
    request.user.id,
    request.params.id
  );
  return reply.send({ success: true, data: result });
}

module.exports = { createReservation, getReservation, cancelReservation };
