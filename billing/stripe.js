// Stripe API setup and helper functions
// Plug in your Stripe secret key using environment variables
// Example: const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const Stripe = require('stripe');
const stripe =
  process.env.NODE_ENV === 'production'
    ? Stripe(process.env.STRIPE_SECRET_KEY)
    : Stripe(process.env.STRIPE_SECRET_KEY_TEST || process.env.STRIPE_SECRET_KEY);

// Create a charge
async function createCharge({ amount, currency, source, description }) {
  return await stripe.charges.create({
    amount,
    currency,
    source,
    description,
  });
}

// Refund a charge
async function refundCharge(chargeId) {
  return await stripe.refunds.create({ charge: chargeId });
}

module.exports = {
  createCharge,
  refundCharge,
};
