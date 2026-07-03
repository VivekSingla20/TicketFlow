const { broadcast } = require('./gateway');

// ─── Event Room Events (seat status changes) ──────────────────────────

function emitSeatReserved(eventId, seatId) {
  broadcast(`event:${eventId}`, 'seat:reserved', { seatId, eventId });
}

function emitSeatAvailable(eventId, seatId) {
  broadcast(`event:${eventId}`, 'seat:available', { seatId, eventId });
}

function emitSeatBooked(eventId, seatId) {
  broadcast(`event:${eventId}`, 'seat:booked', { seatId, eventId });
}

// ─── User Room Events (private notifications) ─────────────────────────

function emitReservationExpiring(userId, reservationId, secondsLeft) {
  broadcast(`user:${userId}`, 'reservation:expiring', { reservationId, secondsLeft });
}

function emitReservationExpired(userId, reservationId, seatIds) {
  broadcast(`user:${userId}`, 'reservation:expired', { reservationId, seatIds });
}

function emitBookingConfirmed(userId, bookingId) {
  broadcast(`user:${userId}`, 'booking:confirmed', { bookingId });
}

function emitPaymentFailed(userId, bookingId) {
  broadcast(`user:${userId}`, 'payment:failed', { bookingId });
}

function emitNotification(userId, notificationId, title, body) {
  broadcast(`user:${userId}`, 'notification:new', { notificationId, title, body });
}

module.exports = {
  emitSeatReserved,
  emitSeatAvailable,
  emitSeatBooked,
  emitReservationExpiring,
  emitReservationExpired,
  emitBookingConfirmed,
  emitPaymentFailed,
  emitNotification,
};
