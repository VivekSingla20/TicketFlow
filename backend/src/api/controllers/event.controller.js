const eventService = require('../../services/event.service');
const { parsePagination, paginatedResponse } = require('../../utils/pagination');

async function listEvents(request, reply) {
  const { skip, take, page, limit } = parsePagination(request.query);
  const filters = {
    city: request.query.city,
    dateFrom: request.query.dateFrom,
    dateTo: request.query.dateTo,
  };
  const { events, total } = await eventService.listPublishedEvents(filters, skip, take);
  return reply.send(paginatedResponse(events, total, page, limit));
}

async function getEvent(request, reply) {
  const event = await eventService.getEventById(request.params.id);
  return reply.send({ success: true, data: event });
}

async function getEventSeats(request, reply) {
  const seats = await eventService.getEventSeats(request.params.id);
  return reply.send({ success: true, data: seats });
}

module.exports = { listEvents, getEvent, getEventSeats };
