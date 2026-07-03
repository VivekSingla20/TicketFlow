const { getPrisma } = require('../db/prisma/client');
const { NotFoundError } = require('../utils/errors');
const logger = require('../utils/logger');

/**
 * Get user's notifications.
 */
async function getUserNotifications(userId, skip, take, filter = {}) {
  const prisma = getPrisma();

  const where = { userId };
  if (filter.isRead !== undefined) {
    where.isRead = filter.isRead === 'true' || filter.isRead === true;
  }

  const [notifications, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.notification.count({ where }),
  ]);

  return { notifications, total };
}

/**
 * Mark a single notification as read.
 */
async function markAsRead(userId, notificationId) {
  const prisma = getPrisma();

  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
  });

  if (!notification || notification.userId !== userId) {
    throw new NotFoundError('Notification');
  }

  return prisma.notification.update({
    where: { id: notificationId },
    data: { isRead: true },
  });
}

/**
 * Mark all notifications as read for a user.
 */
async function markAllAsRead(userId) {
  const prisma = getPrisma();

  const result = await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true },
  });

  return { markedRead: result.count };
}

module.exports = { getUserNotifications, markAsRead, markAllAsRead };
