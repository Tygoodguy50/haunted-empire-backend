// Consulting Services API endpoints and health check
const express = require('express');
const router = express.Router();

// Health check endpoint for frontend validation
router.get('/test-connect', (req, res) => {
  res.json({ status: 'ok', env: process.env.NODE_ENV || 'production' });
});

// List consulting packages
router.get('/consulting', (req, res) => {
  res.json({ packages: [] });
});

// Book a consulting session
router.post('/consulting/book', (req, res) => {
  // Implement booking logic
  const { notifyDiscord } = require('./billing/jobs');
  try {
    // ...booking logic...
    notifyDiscord({ type: 'milestone', message: `🗓️ Consulting session booked by user ${req.body.userId || 'unknown'}` });
    res.json({ success: true });
  } catch (err) {
    notifyDiscord({ type: 'error', message: `Consulting booking error: ${err.message}` });
    res.status(500).json({ error: 'Booking failed', details: err.message });
  }
});

module.exports = router;
