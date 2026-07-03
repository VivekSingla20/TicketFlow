/**
 * Base application error with HTTP status code and machine-readable error code.
 */
class AppError extends Error {
  constructor(message, statusCode, errorCode, retryAfter = null) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.retryAfter = retryAfter;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    const obj = {
      code: this.errorCode,
      message: this.message,
    };
    if (this.retryAfter !== null) {
      obj.retryAfter = this.retryAfter;
    }
    return obj;
  }
}

class SeatAlreadyTakenError extends AppError {
  constructor(seatId) {
    super(
      `Seat ${seatId || ''} is already taken or reserved by another user`,
      409,
      'SEAT_ALREADY_TAKEN'
    );
    this.seatId = seatId;
  }
}

class SeatLockTimeoutError extends AppError {
  constructor(seatId, retryAfter = 5) {
    super(
      `Could not acquire lock for seat ${seatId || ''}. Please try again shortly.`,
      503,
      'SEAT_LOCK_TIMEOUT',
      retryAfter
    );
    this.seatId = seatId;
  }
}

class ReservationExpiredError extends AppError {
  constructor(reservationId) {
    super(
      `Reservation ${reservationId || ''} has expired`,
      410,
      'RESERVATION_EXPIRED'
    );
    this.reservationId = reservationId;
  }
}

class ReservationNotFoundError extends AppError {
  constructor(reservationId) {
    super(
      `Reservation ${reservationId || ''} not found`,
      404,
      'RESERVATION_NOT_FOUND'
    );
  }
}

class OptimisticLockConflictError extends AppError {
  constructor(resource) {
    super(
      `Concurrent modification detected on ${resource || 'resource'}. Please retry.`,
      409,
      'OPTIMISTIC_LOCK_CONFLICT'
    );
  }
}

class PaymentFailedError extends AppError {
  constructor(message = 'Payment processing failed') {
    super(message, 402, 'PAYMENT_FAILED');
  }
}

class DuplicateRequestError extends AppError {
  constructor(cachedResponse) {
    super('Duplicate request — returning cached response', 200, 'DUPLICATE_REQUEST');
    this.cachedResponse = cachedResponse;
  }
}

class RateLimitExceededError extends AppError {
  constructor(retryAfter = 60) {
    super('Rate limit exceeded. Please slow down.', 429, 'RATE_LIMIT_EXCEEDED', retryAfter);
  }
}

class ValidationError extends AppError {
  constructor(message, details = []) {
    super(message || 'Validation failed', 422, 'VALIDATION_ERROR');
    this.details = details;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      details: this.details,
    };
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super(message, 403, 'FORBIDDEN');
  }
}

class EventNotAvailableError extends AppError {
  constructor(eventId) {
    super(
      `Event ${eventId || ''} is not available for booking`,
      400,
      'EVENT_NOT_AVAILABLE'
    );
  }
}

class CancellationNotAllowedError extends AppError {
  constructor(message = 'Cancellation is not allowed for this booking') {
    super(message, 400, 'CANCELLATION_NOT_ALLOWED');
  }
}

class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

module.exports = {
  AppError,
  SeatAlreadyTakenError,
  SeatLockTimeoutError,
  ReservationExpiredError,
  ReservationNotFoundError,
  OptimisticLockConflictError,
  PaymentFailedError,
  DuplicateRequestError,
  RateLimitExceededError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  EventNotAvailableError,
  CancellationNotAllowedError,
  NotFoundError,
};
