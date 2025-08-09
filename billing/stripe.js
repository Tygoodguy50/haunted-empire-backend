// Stripe API setup and helper functions
// 🔐 Production-ready Stripe configuration for Haunted Empire
// Automatically switches between test and live keys based on environment

const Stripe = require('stripe');

// 🎯 Smart key selection for production vs development
const getStripeKey = () => {
  // Use live keys in production, test keys in development
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY.startsWith('sk_test_')) {
      throw new Error('❌ Production environment requires live Stripe secret key (sk_live_...)');
    }
    return process.env.STRIPE_SECRET_KEY;
  } else {
    // Development mode - prefer test keys
    return process.env.STRIPE_SECRET_KEY_TEST || process.env.STRIPE_SECRET_KEY;
  }
};

const stripe = Stripe(getStripeKey(), {
  apiVersion: '2023-10-16', // Use latest stable API version
  typescript: false,
});

// 💳 Create a payment intent (modern approach - replaces charges)
async function createPaymentIntent({ amount, currency = 'usd', description, metadata = {} }) {
  try {
    return await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency,
      description,
      metadata: {
        service: 'haunted-empire-backend',
        timestamp: new Date().toISOString(),
        ...metadata
      },
      automatic_payment_methods: {
        enabled: true,
      },
    });
  } catch (error) {
    console.error('❌ Payment Intent Creation Failed:', error.message);
    throw error;
  }
}

// 💸 Create a charge (legacy method - kept for compatibility)
async function createCharge({ amount, currency, source, description }) {
  try {
    return await stripe.charges.create({
      amount: Math.round(amount * 100), // Ensure cents conversion
      currency,
      source,
      description,
    });
  } catch (error) {
    console.error('❌ Charge Creation Failed:', error.message);
    throw error;
  }
}

// 🔄 Refund a charge or payment intent
async function refundCharge(chargeId, amount = null) {
  try {
    const refundData = { charge: chargeId };
    if (amount) {
      refundData.amount = Math.round(amount * 100); // Convert to cents
    }
    return await stripe.refunds.create(refundData);
  } catch (error) {
    console.error('❌ Refund Failed:', error.message);
    throw error;
  }
}

// 🎯 Create a customer for recurring billing
async function createCustomer({ email, name, metadata = {} }) {
  try {
    return await stripe.customers.create({
      email,
      name,
      metadata: {
        service: 'haunted-empire-backend',
        created: new Date().toISOString(),
        ...metadata
      }
    });
  } catch (error) {
    console.error('❌ Customer Creation Failed:', error.message);
    throw error;
  }
}

// 📊 Get payment status
async function getPaymentStatus(paymentIntentId) {
  try {
    return await stripe.paymentIntents.retrieve(paymentIntentId);
  } catch (error) {
    console.error('❌ Payment Status Check Failed:', error.message);
    throw error;
  }
}

// 🔍 Verify webhook signature (security)
function verifyWebhookSignature(payload, signature) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error('❌ Webhook secret not configured');
  }
  
  try {
    return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (error) {
    console.error('❌ Webhook Verification Failed:', error.message);
    throw error;
  }
}

module.exports = {
  createCharge,
  createPaymentIntent,
  refundCharge,
  createCustomer,
  getPaymentStatus,
  verifyWebhookSignature,
  stripe, // Export stripe instance for advanced usage
};
