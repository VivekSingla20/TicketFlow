const venueService = require('../../services/venue.service');
const eventService = require('../../services/event.service');
const { parsePagination, paginatedResponse } = require('../../utils/pagination');
const { createVenueSchema, createEventSchema, updateEventSchema } = require('../validators/admin.validators');

async function createVenue(request, reply) {
  const data = createVenueSchema.parse(request.body);
  const venue = await venueService.createVenue(data);
  return reply.status(201).send({ success: true, data: venue });
}

async function listVenues(request, reply) {
  const { skip, take, page, limit } = parsePagination(request.query);
  const { venues, total } = await venueService.listVenues(skip, take);
  return reply.send(paginatedResponse(venues, total, page, limit));
}

async function createEvent(request, reply) {
  const data = createEventSchema.parse(request.body);
  const event = await eventService.createEvent(data, request.user.id);
  return reply.status(201).send({ success: true, data: event });
}

async function updateEvent(request, reply) {
  const data = updateEventSchema.parse(request.body);
  const event = await eventService.updateEvent(request.params.id, data);
  return reply.send({ success: true, data: event });
}

async function publishEvent(request, reply) {
  const event = await eventService.publishEvent(request.params.id);
  return reply.send({ success: true, data: event });
}

async function cancelEvent(request, reply) {
  const result = await eventService.cancelEvent(request.params.id);
  return reply.status(202).send({ success: true, data: result });
}

async function getDashboard(request, reply) {
  const dashboard = await eventService.getDashboard(request.params.id);
  return reply.send({ success: true, data: dashboard });
}

async function listEvents(request, reply) {
  const { skip, take, page, limit } = parsePagination(request.query);
  const { events, total } = await eventService.listAllEvents(skip, take);
  return reply.send(paginatedResponse(events, total, page, limit));
}

module.exports = {
  createVenue,
  listVenues,
  createEvent,
  listEvents,
  updateEvent,
  publishEvent,
  cancelEvent,
  getDashboard,
};
