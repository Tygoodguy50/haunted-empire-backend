const express = require('express');
const bodyParser = require('body-parser');
const Stripe = require('stripe');
const crypto = require('crypto');
const mongoose = require('mongoose');
const Creator = require('./models/Creator');
const LoreLog = require('./models/LoreLog');
const ViralScore = require('./models/ViralScore');
const TikTokWebhook = require('./models/TikTokWebhook');
const WebhookRegistration = require('./models/WebhookRegistration');
const Purchase = require('./models/Purchase');
const axios = require('axios');
require('dotenv').config();

const app = express();

// --- Load product catalog early so webhook logic can access real unit amounts ---
const path = require('path');
let productCatalog = [];
try {
  const catalogPath = path.join(__dirname,'products','catalog.json');
  productCatalog = require(catalogPath);
  console.log(`[catalog] Loaded ${productCatalog.length} products from catalog.json`);
} catch (err) {
  console.warn('[catalog] Could not load catalog.json:', err.message);
}
function findProduct(id){ return productCatalog.find(p=>p.id===id); }

// Stripe webhook MUST be registered before generic JSON parser so raw body is preserved
app.post('/webhook/stripe', express.raw({ type: 'application/json' }), async (req,res)=>{
  try {
    let event;
    const sig = req.headers['stripe-signature'];
    if(process.env.STRIPE_WEBHOOK_SECRET && sig){
      try {
        event = Stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
      } catch(err){
        console.error('[stripe webhook] signature verification failed', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
      }
    } else {
      event = JSON.parse(req.body.toString());
    }
    if(event.type === 'checkout.session.completed'){
      const session = event.data.object;
      try {
        let integrityValid = true;
        let purchaseDoc = { productId: session.metadata?.productId || null, amount: session.amount_total, currency: session.currency, mode: session.mode, raw: session };
        if(session.metadata?.bulk === '1'){
          purchaseDoc.bulk = true;
          const itemsMeta = (session.metadata.items||'').split(',').filter(Boolean).map(s=>{
            const [pid,qty] = s.split(':');
            return { productId: pid, quantity: Number(qty)||1 };
          });
          // Normalize per-line pricing from catalog (fallback to proportional if missing)
          const totalQty = itemsMeta.reduce((a,i)=>a+i.quantity,0) || 1;
          let fallbackPerUnit = Math.floor(session.amount_total / totalQty);
          purchaseDoc.items = itemsMeta.map(it=>{
            const product = findProduct(it.productId);
            const unitAmount = product?.amount ?? fallbackPerUnit;
            return { productId: it.productId, quantity: it.quantity, unitAmount, lineTotal: unitAmount * it.quantity };
          });
          if(session.metadata.integrity){
            // Rebuild hash base the same way it was constructed in bulk checkout endpoint (id x qty : amount)
            const base = purchaseDoc.items.map(it=>`${it.productId}x${it.quantity}:${it.unitAmount}`).join('|');
            const expectedBulk = crypto.createHash('sha256').update(base,'utf8').digest('hex').slice(0,24);
            if(expectedBulk !== session.metadata.integrity){
              integrityValid = false;
              console.warn('[stripe webhook] bulk integrity mismatch', { sessionId: session.id, expected: expectedBulk, got: session.metadata.integrity });
            }
            purchaseDoc.integrity = session.metadata.integrity;
          }
        } else if(session.metadata?.integrity){
          const expected = crypto.createHash('sha256').update(`${session.metadata.productId}|${session.amount_total}`,'utf8').digest('hex').slice(0,16);
          if(expected !== session.metadata.integrity){
            integrityValid = false;
            console.warn('[stripe webhook] integrity mismatch', { sessionId: session.id, productId: session.metadata?.productId, expected, got: session.metadata.integrity });
          }
          purchaseDoc.integrity = session.metadata.integrity;
        }
        purchaseDoc.integrityValid = integrityValid;
        await Purchase.findOneAndUpdate({ sessionId: session.id },{ $set: purchaseDoc },{ upsert: true });
        const loreLog = new LoreLog({
          eventType:'payment',
          details: { sessionId: session.id, productId: session.metadata?.productId, amount_total: session.amount_total },
        });
        await loreLog.save();
      } catch(dbErr){ console.error('[stripe webhook] save error', dbErr.message); }
    } else if(event.type === 'invoice.payment_succeeded') {
      const invoice = event.data.object;
      try {
        const loreLog = new LoreLog({
          eventType: 'subscription_renewal',
          details: { invoiceId: invoice.id, subscription: invoice.subscription, amount_paid: invoice.amount_paid, customer: invoice.customer }
        });
        await loreLog.save();
      } catch(e){ console.error('[stripe webhook] renewal save error', e.message); }
    }
    res.json({ received:true });
  } catch(err){
    console.error('[stripe webhook] error', err);
    res.status(500).json({ error: err.message });
  }
});

// Generic JSON parser AFTER webhook
app.use(bodyParser.json());


// Health check endpoint for webhook registrations
app.get('/admin/webhook-health', authenticateAdmin, async (req, res) => {
  try {
    const registrations = await WebhookRegistration.find();
    // Ping each callbackUrl (HEAD request, 2s timeout)
    const results = await Promise.all(registrations.map(async reg => {
      let status = 'unknown';
      try {
        const resp = await axios.head(reg.callbackUrl, { timeout: 2000 });
        status = resp.status >= 200 && resp.status < 400 ? 'healthy' : 'failing';
      } catch (err) {
        status = 'failing';
      }
      return { id: reg._id, callbackUrl: reg.callbackUrl, status };
    }));
    res.json({ health: results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Root endpoint for health check and to prevent 502 errors
app.get('/', (req, res) => {
  res.json({
    message: 'Backend is running!',
    availableEndpoints: [
      '/test-connect',
      '/stripe/test-payment',
      '/lore/drop-live',
      '/api/trigger-referral-bonus',
      '/api/generate-discount',
      '/api',
      '/stats',
      '/creators',
      '/creators/:id',
      '/leaderboard',
      '/creators/stripe-sync',
      '/creators/create-payment'
    ]
  });
});

// Prevent favicon.ico 502 error
app.get('/favicon.ico', (req, res) => res.status(204).end());

const PORT = process.env.PORT || 3002;
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const discordWebhook = process.env.DISCORD_WEBHOOK_URL;
const mongoUri = process.env.MONGO_URI;
console.log('MongoDB URI:', mongoUri);

// Utility: Generate random discount code
// --- Automated API Endpoints ---
// Stats endpoint


// Creators endpoint
app.get('/creators', async (req, res) => {
  try {
    // Find creators eligible for public ranking/lore participation
    const creators = await Creator.find({ stripeId: { $exists: true, $ne: null }, viralScore: { $gte: 10 } });
    res.json({ creators });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Creator by ID endpoint
app.get('/creators/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const creator = await Creator.findById(id).populate('loreLogs');
    if (!creator) return res.status(404).json({ error: 'Creator not found' });
    // Simulate access control
    const userRole = req.headers['x-user-role'] || 'public';
    let creatorObj = creator.toObject();
    if (userRole !== 'admin' && userRole !== creatorObj.username) {
      delete creatorObj.stripeId;
    }
    res.json({ creator: creatorObj });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Leaderboard endpoint
const jwt = require('jsonwebtoken');
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'supersecret';

function authenticateAdmin(req, res, next) {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Missing token' });
  try {
    const decoded = jwt.verify(token, ADMIN_SECRET);
    if (decoded.role !== 'admin') throw new Error('Not admin');
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Forbidden' });
  }
}

// --- RBAC Middleware ---
function rbac(role) {
  return function(req, res, next) {
    const token = req.headers['authorization']?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Missing token' });
    try {
      const decoded = jwt.verify(token, ADMIN_SECRET);
      if (role === 'admin' && decoded.role !== 'admin') return res.status(403).json({ error: 'Forbidden: Admins only' });
      if (role === 'operator' && !['admin','operator'].includes(decoded.role)) return res.status(403).json({ error: 'Forbidden: Operators only' });
      req.rbacRole = decoded.role;
      next();
    } catch (err) {
      return res.status(403).json({ error: 'Forbidden' });
    }
  };
}

// --- Real Log Integration Endpoint ---
// --- Integration Test Endpoints ---
app.post('/admin/integration-test/discord', rbac('operator'), async (req, res) => {
  const { callbackUrl } = req.body;
  // Simulate Discord webhook test
  try {
    // Replace with real Discord API call if needed
    await axios.post(callbackUrl, { content: 'Discord integration test message' });
    res.json({ ok: true, message: 'Discord test sent', callbackUrl });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/admin/integration-test/stripe', rbac('operator'), async (req, res) => {
  const { callbackUrl } = req.body;
  try {
    // Simulate Stripe webhook test
    await axios.post(callbackUrl, { type: 'stripe.test', data: { message: 'Stripe integration test' } });
    res.json({ ok: true, message: 'Stripe test sent', callbackUrl });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/admin/integration-test/tiktok', rbac('operator'), async (req, res) => {
  const { callbackUrl } = req.body;
  try {
    // Simulate TikTok webhook test
    await axios.post(callbackUrl, { event: 'tiktok.test', details: 'TikTok integration test' });
    res.json({ ok: true, message: 'TikTok test sent', callbackUrl });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/admin/integration-test/sendgrid', rbac('operator'), async (req, res) => {
  const { callbackUrl } = req.body;
  try {
    // Simulate SendGrid webhook test
    await axios.post(callbackUrl, { event: 'sendgrid.test', details: 'SendGrid integration test' });
    res.json({ ok: true, message: 'SendGrid test sent', callbackUrl });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/admin/integration-test/twilio', rbac('operator'), async (req, res) => {
  const { callbackUrl } = req.body;
  try {
    // Simulate Twilio webhook test
    await axios.post(callbackUrl, { event: 'twilio.test', details: 'Twilio integration test' });
    res.json({ ok: true, message: 'Twilio test sent', callbackUrl });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/admin/integration-test/slack', rbac('operator'), async (req, res) => {
  const { callbackUrl } = req.body;
  try {
    // Simulate Slack webhook test
    await axios.post(callbackUrl, { event: 'slack.test', details: 'Slack integration test' });
    res.json({ ok: true, message: 'Slack test sent', callbackUrl });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});
app.get('/admin/logs', rbac('viewer'), async (req, res) => {
  const { callbackUrl } = req.query;
  // Simulate log retrieval (replace with real log DB or file access)
  const logs = [
    { timestamp: new Date(Date.now()-3600000).toISOString(), level: 'info', message: `Pinged ${callbackUrl} - healthy` },
    { timestamp: new Date(Date.now()-1800000).toISOString(), level: 'error', message: `Pinged ${callbackUrl} - failed` },
    { timestamp: new Date().toISOString(), level: 'info', message: `Pinged ${callbackUrl} - healthy` }
  ];
  res.json({ logs });
});

app.get('/stats', authenticateAdmin, async (req, res) => {
  try {
    // Daily active creators: count creators updated in last 24h
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const dailyActiveCreators = await Creator.countDocuments({ createdAt: { $gte: since } });
    // Viral score distribution
    const scores = await Creator.find({}, 'viralScore');
    const viralScoreDistribution = scores.map(c => c.viralScore);
    // Example payout velocity and revenue (stub)
    const avgPayoutVelocity = '2.3 days';
    const tiktokFragmentInteractions = await LoreLog.countDocuments({ eventType: 'tiktok-fragment' });
    const revenueGenerated = await LoreLog.countDocuments({ eventType: 'payment' }) * 10; // $10 per payment
    const anomalies = ['referral spike', 'lore anomaly'];
    res.json({
      dailyActiveCreators,
      viralScoreDistribution,
      avgPayoutVelocity,
      tiktokFragmentInteractions,
      revenueGenerated,
      anomalies,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create payment endpoint
app.post('/creators/create-payment', async (req, res) => {
  const { creatorId, sku, paymentSource } = req.body;
  if (!creatorId || !sku || !paymentSource) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  try {
    // Create Stripe payment intent
    const amount = sku === 'promo' ? 500 : 1000; // Example: $5 for promo, $10 for regular
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: 'usd',
      payment_method_types: ['card'],
      metadata: { creatorId, sku }
    });
    // Log lore event
    const loreLog = new LoreLog({
      creator: creatorId,
      eventType: 'payment',
      details: { sku, paymentSource, paymentIntentId: paymentIntent.id },
    });
    await loreLog.save();
    res.json({
      payment: 'Payment intent created',
      creatorId,
      sku,
      paymentSource,
      stripeClientSecret: paymentIntent.client_secret,
      loreFragmentUnlocked: true,
      adBoostTriggered: sku === 'promo',
      loreLog
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// --- End Automated API Endpoints ---
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

// Product catalog endpoint (public)
app.get('/api/catalog', (req,res)=> {
  res.json({ products: productCatalog.map(p=>({
    id: p.id,
    name: p.name,
    type: p.type,
    amount: p.amount,
    currency: p.currency,
    interval: p.interval || null,
    paymentLink: p.paymentLink || null
  })) });
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


// Create Stripe Checkout Session from catalog productId
app.post('/api/create-checkout-session', async (req,res)=>{
  try {
    const { productId, successUrl, cancelUrl, quantity = 1 } = req.body;
    if(!productId) return res.status(400).json({ error:'Missing productId' });
    const product = findProduct(productId);
    if(!product) return res.status(404).json({ error:'Unknown product' });
    if(!process.env.STRIPE_SECRET_KEY) return res.status(500).json({ error:'Stripe not configured' });
    // If paymentLink defined and no need dynamic session, return link directly for simplicity
    if(product.paymentLink && !req.body.forceSession){
      return res.json({ url: product.paymentLink, mode:'link' });
    }
    const lineItem = {
      price_data: {
        currency: product.currency || 'usd',
        product_data: { name: product.name },
        unit_amount: product.amount,
        recurring: product.interval ? { interval: product.interval } : undefined
      },
      quantity
    };
    const integrity = crypto.createHash('sha256').update(`${product.id}|${product.amount}`,'utf8').digest('hex').slice(0,16);
    const session = await stripe.checkout.sessions.create({
      mode: product.interval ? 'subscription':'payment',
      line_items:[lineItem],
      success_url: successUrl || 'https://example.com/success?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: cancelUrl || 'https://example.com/cancel',
      metadata: { productId: product.id, catalogVersion: 'v1', integrity }
    });
    res.json({ url: session.url, id: session.id, mode: session.mode });
  } catch(err){
    console.error('[checkout-session] error', err);
    res.status(500).json({ error: err.message });
  }
});

// Bulk (multi-item) checkout session (non-subscription items only for now)
app.post('/api/create-checkout-session-bulk', async (req,res)=>{
  try {
    const { items, successUrl, cancelUrl } = req.body;
    if(!Array.isArray(items) || items.length===0) return res.status(400).json({ error:'Missing items array' });
    const resolved = [];
    for(const it of items){
      if(!it || !it.productId) return res.status(400).json({ error:'Each item needs productId' });
      const product = findProduct(it.productId);
      if(!product) return res.status(404).json({ error:`Unknown product ${it.productId}` });
      if(product.interval) return res.status(400).json({ error:'Subscriptions not supported in bulk endpoint yet' });
      resolved.push({ product, quantity: it.quantity && it.quantity>0 ? it.quantity:1 });
    }
    const line_items = resolved.map(r=>({
      price_data:{ currency:r.product.currency||'usd', product_data:{ name:r.product.name }, unit_amount:r.product.amount },
      quantity:r.quantity
    }));
    const hashBase = resolved.map(r=>`${r.product.id}x${r.quantity}:${r.product.amount}`).join('|');
    const integrity = crypto.createHash('sha256').update(hashBase,'utf8').digest('hex').slice(0,24);
    const session = await stripe.checkout.sessions.create({
      mode:'payment',
      line_items,
      success_url: successUrl || 'https://example.com/success?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: cancelUrl || 'https://example.com/cancel',
      metadata:{ bulk:'1', items: resolved.map(r=>`${r.product.id}:${r.quantity}`).join(','), integrity }
    });
    res.json({ url: session.url, id: session.id, mode: session.mode });
  } catch(err){
    console.error('[bulk-checkout] error', err);
    res.status(500).json({ error: err.message });
  }
});

// Lore drop endpoint
app.post('/lore/drop-live', async (req, res) => {
  try {
    // Save lore event to LoreLog
    const { creatorId, details } = req.body;
    const loreLog = new LoreLog({
      creator: creatorId,
      eventType: 'lore-drop-live',
      details: details || {}
    });
    await loreLog.save();
    // Send Discord notification
    await axios.post(discordWebhook, {
      content: `A new live lore drop has occurred!${creatorId ? ' By creator: ' + creatorId : ''}`
    });
    res.json({ status: 'lore drop triggered', notified: true, loreLog });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Health endpoint (added for deployment monitoring)
app.get('/health', async (req, res) => {
  try {
    const mongoStatus = (mongoose.connection && mongoose.connection.readyState === 1) ? 'connected' : 'disconnected';
    // Minimal Stripe key presence check (do not expose key)
    const stripeConfigured = !!process.env.STRIPE_SECRET_KEY;
    res.json({
      status: 'ok',
      service: 'haunted-empire-backend',
      version: '1.0.0',
      time: new Date().toISOString(),
      mongo: mongoStatus,
      stripe: stripeConfigured ? 'configured' : 'missing'
    });
  } catch (e) {
    res.status(500).json({ status: 'error', error: e.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Production backend running on port ${PORT}`);
});

// TikTok Webhook endpoint for fragment engagement
app.post('/webhook/tiktok', async (req, res) => {
// Automated TikTok webhook registration endpoint
app.post('/webhook/register-tiktok', async (req, res) => {
  try {
    const { tiktokApiKey, callbackUrl, eventTypes, creatorId } = req.body;
    if (!tiktokApiKey || !callbackUrl || !eventTypes) {
      return res.status(400).json({ error: 'Missing tiktokApiKey, callbackUrl, or eventTypes' });
    }
    const response = await axios.post('https://open-api.tiktok.com/webhook/register', {
      callback_url: callbackUrl,
      event_types: eventTypes
    }, {
      headers: { 'Authorization': `Bearer ${tiktokApiKey}` }
    });
    // Track registration in DB
    const registration = new WebhookRegistration({
      platform: 'tiktok',
      callbackUrl,
      eventTypes,
      registrationResponse: response.data,
      apiKey: tiktokApiKey,
      creator: creatorId
    });
    await registration.save();
    res.json({ ok: true, tiktokResponse: response.data, registration });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Admin: Get all webhook registrations
app.get('/admin/webhook-registrations', authenticateAdmin, async (req, res) => {
  try {
    const registrations = await WebhookRegistration.find().populate('creator');
    res.json({ registrations });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Filter webhook registrations by platform or creator
app.get('/admin/webhook-registrations/search', authenticateAdmin, async (req, res) => {
  try {
    const { platform, creatorId } = req.query;
    const query = {};
    if (platform) query.platform = platform;
    if (creatorId) query.creator = creatorId;
    const registrations = await WebhookRegistration.find(query).populate('creator');
    res.json({ registrations });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Delete a webhook registration
app.delete('/admin/webhook-registrations/:id', authenticateAdmin, async (req, res) => {
  try {
    await WebhookRegistration.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: View details of a webhook registration
app.get('/admin/webhook-registrations/:id', authenticateAdmin, async (req, res) => {
  try {
    const registration = await WebhookRegistration.findById(req.params.id).populate('creator');
    res.json({ registration });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Analytics endpoint for webhook stats
app.get('/admin/webhook-analytics', authenticateAdmin, async (req, res) => {
  try {
    // Interactive filtering: platform, region, latency, status, creator
    const { platform, region, minLatency, maxLatency, status, creatorId } = req.query;
    let filter = {};
    if (platform) filter.platform = platform;
    if (creatorId) filter.creator = creatorId;
    let allRegs = await WebhookRegistration.find(filter).populate('creator');
    // Further filter in-memory for region, latency, status
    if (region || minLatency || maxLatency || status) {
      allRegs = allRegs.filter(reg => {
        let pass = true;
        if (region && reg.region !== region) pass = false;
        if (minLatency && reg.latency < parseInt(minLatency)) pass = false;
        if (maxLatency && reg.latency > parseInt(maxLatency)) pass = false;
        if (status) {
          let regStatus = 'healthy';
          if (reg.callbackUrl && reg.callbackUrl.endsWith('fail')) regStatus = 'failing';
          if (regStatus !== status) pass = false;
        }
        return pass;
      });
    }
    const total = allRegs.length;
    const byPlatform = Object.values(allRegs.reduce((acc, reg) => {
      acc[reg.platform] = acc[reg.platform] || { _id: reg.platform, count: 0 };
      acc[reg.platform].count++;
      return acc;
    }, {}));
    const recent = allRegs.slice().sort((a,b)=>new Date(b.registeredAt)-new Date(a.registeredAt)).slice(0,10);
    // Error rate: count failing vs healthy
    let errorRate = { ok: 0, fail: 0 };
    let regionStats = { US: 0, EU: 0, ASIA: 0 };
    let avgLatency = 0;
    let latencySamples = [];
    let webhookGrowth = [];
    let creatorActivity = {};
    let anomalyEvents = [];
    let integrationTestSuccess = { total: 0, success: 0, fail: 0 };
    let errorRateTrend = [];
    let latencyHistogram = Array(10).fill(0); // 10 buckets
    let regionBreakdown = { US: [], EU: [], ASIA: [] };
    let now = Date.now();
    for (const reg of allRegs) {
      // Simulate health check and latency
      let statusSim = 'healthy';
      let latency = Math.floor(Math.random() * 100) + 50;
      if (reg.callbackUrl && reg.callbackUrl.endsWith('fail')) statusSim = 'failing';
      if (statusSim === 'healthy') errorRate.ok++;
      else errorRate.fail++;
      // Error rate trend (simulate per webhook)
      errorRateTrend.push({ time: reg.registeredAt, status: statusSim });
      // Latency histogram
      let bucket = Math.min(9, Math.floor(latency/20));
      latencyHistogram[bucket]++;
      // Simulate region stats
      ['US','EU','ASIA'].forEach(regionKey => {
        let up = Math.random() > 0.2;
        regionStats[regionKey] += up ? 1 : 0;
        regionBreakdown[regionKey].push({ callbackUrl: reg.callbackUrl, latency, status: statusSim, up });
      });
      latencySamples.push(latency);
      // Growth rate: count per day (simulate)
      let daysAgo = Math.floor((now - new Date(reg.registeredAt).getTime()) / (24*3600*1000));
      webhookGrowth[daysAgo] = (webhookGrowth[daysAgo] || 0) + 1;
      // Creator activity
      if (reg.creator) {
        let cid = reg.creator._id?.toString() || reg.creator;
        creatorActivity[cid] = (creatorActivity[cid] || 0) + 1;
      }
      // Simulate anomaly detection
      if (latency > 180 || statusSim === 'failing') anomalyEvents.push({ callbackUrl: reg.callbackUrl, latency, status: statusSim });
    }
    if (latencySamples.length) avgLatency = Math.round(latencySamples.reduce((a,b)=>a+b,0)/latencySamples.length);
    // Simulate integration test history
    const integrationTestHistory = [
      { service: 'discord', status: 'ok', timestamp: new Date(now-3600000).toISOString() },
      { service: 'stripe', status: 'fail', timestamp: new Date(now-1800000).toISOString() },
      { service: 'tiktok', status: 'ok', timestamp: new Date(now-900000).toISOString() },
      { service: 'sendgrid', status: 'ok', timestamp: new Date(now-600000).toISOString() },
      { service: 'twilio', status: 'ok', timestamp: new Date(now-300000).toISOString() },
      { service: 'slack', status: 'fail', timestamp: new Date(now-120000).toISOString() }
    ];
    integrationTestSuccess.total = integrationTestHistory.length;
    integrationTestSuccess.success = integrationTestHistory.filter(t => t.status === 'ok').length;
    integrationTestSuccess.fail = integrationTestHistory.filter(t => t.status !== 'ok').length;
    // Top-performing webhooks (simulated)
    const topWebhooks = allRegs.filter(r => ['stripe','tiktok'].includes(r.platform) && (r.eventTypes || []).includes('promo')).slice(0,3);
    // Most active creators
    let mostActiveCreators = Object.entries(creatorActivity).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([cid,count])=>({cid,count}));
    // Webhook growth array to chart
    let webhookGrowthArray = Object.entries(webhookGrowth).map(([daysAgo,count])=>({daysAgo:parseInt(daysAgo),count})).sort((a,b)=>a.daysAgo-b.daysAgo);
    // Drill-downs: return filtered registrations, anomaly details, region breakdown
    res.json({
      total,
      byPlatform,
      recent,
      errorRate,
      errorRateTrend,
      latencyHistogram,
      avgLatency,
      regionStats,
      regionBreakdown,
      integrationTestHistory,
      integrationTestSuccess,
      topWebhooks,
      mostActiveCreators,
      webhookGrowth: webhookGrowthArray,
      anomalyEvents,
      filtered: allRegs,
      drilldowns: {
        anomalyDetails: anomalyEvents,
        regionBreakdown,
        creatorActivity,
        latencyHistogram,
        errorRateTrend
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// Admin: Get all webhook registrations


// Admin: Filter webhook registrations by platform or creator


// Admin: View details of a webhook registration
  try {
    const { platform, apiKey, callbackUrl, eventTypes, creatorId } = req.body;
    if (!platform || !apiKey || !callbackUrl || !eventTypes) {
      return res.status(400).json({ error: 'Missing platform, apiKey, callbackUrl, or eventTypes' });
    }
    let apiUrl;
    let headers = {};
    let body = { callback_url: callbackUrl, event_types: eventTypes };
    switch (platform) {
      case 'tiktok':
        apiUrl = 'https://open-api.tiktok.com/webhook/register';
        headers = { 'Authorization': `Bearer ${apiKey}` };
        break;
      case 'discord':
        apiUrl = 'https://discord.com/api/webhooks/register';
        headers = { 'Authorization': `Bot ${apiKey}` };
        break;
      case 'stripe':
        apiUrl = 'https://api.stripe.com/v1/webhook_endpoints';
        headers = { 'Authorization': `Bearer ${apiKey}` };
        body = { url: callbackUrl, enabled_events: eventTypes };
        break;
      default:
        return res.status(400).json({ error: 'Unsupported platform' });
    }
    const response = await axios.post(apiUrl, body, { headers });
    // Track registration in DB
    const registration = new WebhookRegistration({
      platform,
      callbackUrl,
      eventTypes,
      registrationResponse: response.data,
      apiKey,
      creator: creatorId
    });
    await registration.save();
    res.json({ ok: true, response: response.data, registration });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Replace simple findProduct with alias aware version
const PRODUCT_ALIASES = {
  'templates':'templates-bundle',
  'publishing':'from-draft-to-published',
  'business':'horror-that-sells',
  'generator':'plot-generator',
  'draft-to-published-course':'from-draft-to-published'
};
function findProduct(id){
  const canonical = PRODUCT_ALIASES[id] || id;
  return productCatalog.find(p=>p.id===canonical);
}

// Scheduled reconciliation block
if(process.env.ENABLE_PAYMENT_RECONCILIATION === 'true' && !global.__RECONCILIATION_SCHED){
  global.__RECONCILIATION_SCHED = true;
  const { spawn } = require('child_process');
  const path = require('path');
  const intervalMs = Number(process.env.RECONCILIATION_INTERVAL_MS || 6*60*60*1000);
  setInterval(()=>{
    console.log('[reconciliation] starting scheduled run');
    const proc = spawn(process.execPath, [path.join(__dirname,'scripts','reconcile-payments.js')], { stdio:'inherit' });
    proc.on('exit', code=> console.log('[reconciliation] completed with code', code));
  }, intervalMs).unref();
}