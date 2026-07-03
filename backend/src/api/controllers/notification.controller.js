const notificationService = require('../../services/notification.service');
const { parsePagination, paginatedResponse } = require('../../utils/pagination');

async function getNotifications(request, reply) {
  const { skip, take, page, limit } = parsePagination(request.query);
  const filter = { isRead: request.query.isRead };
  const { notifications, total } = await notificationService.getUserNotifications(
    request.user.id, skip, take, filter
  );
  return reply.send(paginatedResponse(notifications, total, page, limit));
}

async function markAsRead(request, reply) {
  const result = await notificationService.markAsRead(request.user.id, request.params.id);
  return reply.send({ success: true, data: result });
}

async function markAllAsRead(request, reply) {
  const result = await notificationService.markAllAsRead(request.user.id);
  return reply.send({ success: true, data: result });
}

module.exports = { getNotifications, markAsRead, markAllAsRead };
