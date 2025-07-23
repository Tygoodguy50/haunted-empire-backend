// ...existing code...
const express = require('express');
const bodyParser = require('body-parser');
const Stripe = require('stripe');
const mongoose = require('mongoose');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 3002;
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const discordWebhook = process.env.DISCORD_WEBHOOK_URL;
const mongoUri = process.env.MONGO_URI;
console.log('MongoDB URI:', mongoUri);

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