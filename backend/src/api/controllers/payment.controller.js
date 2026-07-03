const paymentService = require('../../services/payment.service');
const logger = require('../../utils/logger');

async function handleWebhook(request, reply) {
  try {
    await paymentService.processWebhook(request.body);
    return reply.send({ success: true, message: 'Webhook processed' });
  } catch (err) {
    logger.error('Webhook processing failed', {
      service: 'payment-webhook',
      error: err.message,
    });
    return reply.status(400).send({ success: false, error: { message: err.message } });
  }
}

module.exports = { handleWebhook };
