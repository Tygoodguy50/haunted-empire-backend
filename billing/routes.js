// Express routes for payment endpoints
// Example: /pay, /refund, etc.
// Use these routes in your main Express app

// ...existing code...
const express = require('express');
const { getCollection } = require('./db');
const { notifyDiscord } = require('./jobs');
// Tier limits by type
const TIER_LIMITS = {
  free: { maxLoreDrops: 10, maxApiCalls: 100 },
  premium: { maxLoreDrops: 100, maxApiCalls: 1000 },
  enterprise: { maxLoreDrops: 10000, maxApiCalls: 100000 },
};

const router = express.Router();

// Middleware: enforce tier-based resource limits
async function enforceLimits(req, res, next) {
  const userId = req.body.userId;
  if (!userId) return res.status(400).json({ error: 'Missing userId' });
  const usersCol = await getCollection('users');
  const user = await usersCol.findOne({ userId });
  const tier = user?.tier || 'free';
  const limits = TIER_LIMITS[tier];
  // Example: check lore drops
  if (req.path === '/lore-drop') {
    const drops = user?.loreDrops || 0;
    if (drops >= limits.maxLoreDrops) {
      notifyDiscord({ type: 'limit', message: `User ${userId} exceeded lore drop limit for tier ${tier}` });
      return res.status(403).json({ error: 'Lore drop limit exceeded' });
    }
  }
  // Example: check API calls
  user.apiCalls = (user.apiCalls || 0) + 1;
  if (user.apiCalls > limits.maxApiCalls) {
    notifyDiscord({ type: 'limit', message: `User ${userId} exceeded API call limit for tier ${tier}` });
    return res.status(403).json({ error: 'API call limit exceeded' });
  }
  await usersCol.updateOne({ userId }, { $set: { apiCalls: user.apiCalls } }, { upsert: true });
  next();
}

// Enterprise onboarding endpoint
router.post('/enterprise/onboard', async (req, res) => {
  const { userId, companyName } = req.body;
  const usersCol = await getCollection('users');
  await usersCol.updateOne(
    { userId },
    { $set: { tier: 'enterprise', companyName, onboarded: true } },
    { upsert: true }
  );
  notifyDiscord({ type: 'milestone', message: `🚀 Enterprise onboarded: ${companyName} (user ${userId})` });
  res.json({ success: true });
});
const { createCharge, refundCharge } = require('./stripe');

// Add payment routes here
// Create a payment charge
router.post('/pay', async (req, res) => {
  try {
    const { amount, currency, source, description, coupon } = req.body;
    // Stripe discount logic
    let finalAmount = amount;
    if (coupon) {
      // Simulate coupon lookup (replace with Stripe API call for real)
      if (coupon === 'HALFOFF') finalAmount = Math.floor(amount / 2);
    }
    // Enforce billing limits (max $1000 per charge for free tier)
    const userId = req.body.userId;
    const usersCol = await getCollection('users');
    const user = await usersCol.findOne({ userId });
    const tier = user?.tier || 'free';
    if (tier === 'free' && finalAmount > 100000) {
      notifyDiscord({ type: 'limit', message: `User ${userId} attempted charge above free tier limit` });
      throw new Error('Charge amount exceeds free tier limit');
    }
    // Stripe charge with retry logic
    let charge;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        charge = await createCharge({ amount: finalAmount, currency, source, description });
        break;
      } catch (err) {
        if (attempt === 3) throw err;
        await new Promise(r => setTimeout(r, 1000 * attempt)); // Exponential backoff
      }
    }
    notifyDiscord({ type: 'payment', message: `Charge processed for user ${userId}, amount ${finalAmount}` });
    res.json({ success: true, charge });
  } catch (err) {
    notifyDiscord({ type: 'error', message: `Charge error: ${err.message}` });
    console.error('[Pay] Error:', err);
    res.status(400).json({ success: false, error: err.message, details: err.stack });
  }
});

// Refund a charge
router.post('/refund', async (req, res) => {
  try {
    const { chargeId, userId } = req.body;
    let refund;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        refund = await refundCharge(chargeId);
        break;
      } catch (err) {
        if (attempt === 3) throw err;
        await new Promise(r => setTimeout(r, 1000 * attempt));
      }
    }
    notifyDiscord({ type: 'refund', message: `Refund processed for user ${userId}, charge ${chargeId}` });
    res.json({ success: true, refund });
  } catch (err) {
    notifyDiscord({ type: 'error', message: `Refund error: ${err.message}` });
    res.status(400).json({ success: false, error: err.message });
  }
});

module.exports = router;
