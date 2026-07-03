const paymentController = require('../controllers/payment.controller');

async function paymentRoutes(fastify, options) {
  // POST /api/payments/webhook — receives async callback from mock payment
  // NO authentication — webhook comes from the payment provider
  fastify.post('/webhook', {
    schema: {
      summary: 'Payment webhook (from mock provider)',
      tags: ['Payments'],
      body: {
        type: 'object',
        required: ['bookingId', 'transactionId', 'status', 'amount', 'timestamp', 'signature'],
        properties: {
          bookingId: { type: 'string' },
          transactionId: { type: 'string' },
          status: { type: 'string', enum: ['SUCCESS', 'FAILED'] },
          amount: { type: 'number' },
          timestamp: { type: 'string' },
          signature: { type: 'string' },
        },
      },
    },
  }, paymentController.handleWebhook);
}

module.exports = paymentRoutes;
