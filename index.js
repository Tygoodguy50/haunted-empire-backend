
const express = require('express');
const bodyParser = require('body-parser');
const Stripe = require('stripe');
const mongoose = require('mongoose');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(bodyParser.json());

// Root endpoint for health check and to prevent 502 errors
app.get('/', (req, res) => {
  res.send('Backend is running!');
});

// Prevent favicon.ico 502 error
app.get('/favicon.ico', (req, res) => res.status(204).end());

const PORT = process.env.PORT || 3002;
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const discordWebhook = process.env.DISCORD_WEBHOOK_URL;
const mongoUri = process.env.MONGO_URI;
console.log('MongoDB URI:', mongoUri);

// Utility: Generate random discount code
function generateDiscountCode(length = 8) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Endpoint: Trigger referral bonus automation
app.get('/api/trigger-referral-bonus', async (req, res) => {
  // TODO: Replace with real referral logic and DB update
  // Example: credit referrer and referee
  try {
    // Simulate DB update or call
    // await ReferralModel.creditBonus(referrerId, refereeId);
    res.json({ ok: true, message: 'Referral bonus triggered.' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});


// Endpoint: Generate discount code
app.get('/api/generate-discount', (req, res) => {
  // TODO: Save code to DB and associate with user/email if needed
  const code = generateDiscountCode();
  res.json({ ok: true, code });
});

// Mount billing/payment routes at /api
const billingRoutes = require('./billing/routes');
app.use('/api', billingRoutes);

// Connect to MongoDB
mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// Test endpoint
app.get('/test-connect', (req, res) => {
  res.json({ status: 'ok', env: process.env.NODE_ENV || 'production' });
});

// Stripe payment test endpoint
app.post('/stripe/test-payment', async (req, res) => {
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: 1000, // $10.00
      currency: 'usd',
      payment_method_types: ['card'],
    });
    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Lore drop endpoint
app.post('/lore/drop-live', async (req, res) => {
  try {
    // Example: Save lore event to DB (replace with your schema)
    // const lore = new Lore({ ...req.body });
    // await lore.save();

    // Send Discord notification
    await axios.post(discordWebhook, {
      content: 'A new live lore drop has occurred!'
    });
    res.json({ status: 'lore drop triggered', notified: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Production backend running on port ${PORT}`);
});