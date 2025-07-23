// Stripe webhook event handler logic
// Use Express route to receive Stripe webhook events
// Example: app.post('/webhook', ...)

const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

function handleWebhookEvent(req, res) {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  // Handle event types (payment_intent.succeeded, charge.refunded, etc.)
  const { object } = event.data;
  switch (event.type) {
    case 'payment_intent.succeeded': {
      // 1. Log the event for auditing
      console.log('Payment succeeded:', object.id, object.amount);

      // 2. Trigger ad system: schedule async promotion job
      require('./jobs').enqueueJob('promotion', {
        type: 'payment',
        userId: object.metadata?.userId || null,
        amount: object.amount,
        paymentId: object.id,
      });

      // 3. Update user/account status (unlock features, upgrade tier, etc.)
      require('./jobs').enqueueJob('db_update', {
        action: 'upgrade',
        userId: object.metadata?.userId || null,
        paymentId: object.id,
        amount: object.amount,
        notify: true,
      });

      // 4. Notify Discord for payment event
      require('./jobs').enqueueJob('notify', {
        userId: object.metadata?.userId || null,
        type: 'payment_success',
        paymentId: object.id,
        amount: object.amount,
        message: `Payment succeeded for user ${object.metadata?.userId || 'unknown'}: $${object.amount / 100}`
      });
      break;
    }
    case 'charge.refunded': {
      // 1. Log the refund event
      console.log('Charge refunded:', object.id, object.amount_refunded);

      // 2. Trigger ad system: schedule async refund/cancellation promotion
      require('./jobs').enqueueJob('promotion', {
        type: 'refund',
        userId: object.metadata?.userId || null,
        amount: object.amount_refunded,
        chargeId: object.id,
      });

      // 3. Update user/account status (revoke features, downgrade tier, etc.)
      require('./jobs').enqueueJob('db_update', {
        action: 'downgrade',
        userId: object.metadata?.userId || null,
        chargeId: object.id,
        amount: object.amount_refunded,
        notify: true,
      });

      // 4. Notify Discord for refund event
      require('./jobs').enqueueJob('notify', {
        userId: object.metadata?.userId || null,
        type: 'refund',
        chargeId: object.id,
        amount: object.amount_refunded,
        message: `Refund processed for user ${object.metadata?.userId || 'unknown'}: $${object.amount_refunded / 100}`
      });
      break;
    }
    default:
      // Unhandled event type
      console.log('Unhandled Stripe event:', event.type);
      break;
  }
  res.json({ received: true });
}

module.exports = {
  handleWebhookEvent,
};
