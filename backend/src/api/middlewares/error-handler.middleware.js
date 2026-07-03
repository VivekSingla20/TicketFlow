const { AppError, DuplicateRequestError } = require('../../utils/errors');
const logger = require('../../utils/logger');

/**
 * Global error handler for Fastify.
 * Catches AppError (operational) and unexpected errors, formats standard envelope.
 */
function errorHandler(error, request, reply) {
  const requestId = request.requestId || request.id;

  // Handle Zod validation errors
  if (error.name === 'ZodError') {
    return reply.status(400).send({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Input validation failed',
        requestId,
        details: error.errors.map(err => ({
          path: err.path.join('.'),
          message: err.message,
        })),
      },
    });
  }

  // Handle Fastify schema validation errors
  if (error.validation || error.code === 'FST_ERR_VALIDATION') {
    return reply.status(422).send({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        requestId,
        details: error.validation || error.message,
      },
    });
  }


  // Handle DuplicateRequestError — return 200 with cached response
  if (error instanceof DuplicateRequestError) {
    return reply.status(200).send({
      success: true,
      data: error.cachedResponse,
      duplicate: true,
    });
  }

  // Handle operational AppError
  if (error instanceof AppError && error.isOperational) {
    logger.warn('Operational error', {
      service: 'error-handler',
      requestId,
      userId: request.user?.id,
      errorCode: error.errorCode,
      statusCode: error.statusCode,
      message: error.message,
    });

    return reply.status(error.statusCode).send({
      success: false,
      error: {
        ...error.toJSON(),
        requestId,
      },
    });
  }

  // Unexpected / programmer errors
  logger.error('Unexpected error', {
    service: 'error-handler',
    requestId,
    userId: request.user?.id,
    error: error.message,
    stack: error.stack,
  });

  return reply.status(500).send({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      requestId,
    },
  });
}

module.exports = { errorHandler };
