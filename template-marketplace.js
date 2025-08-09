// Add /test-connect route to main app if not already present
const consultingRouter = require('./consulting');
app.use('/', consultingRouter);
// Placeholder for Template Marketplace API endpoints
const express = require('express');
const router = express.Router();

// List available templates
router.get('/templates', (req, res) => {
  res.json({ templates: [] });
});

// Purchase a template
router.post('/templates/purchase', (req, res) => {
  // Implement purchase logic
  const { notifyDiscord } = require('./billing/jobs');
  try {
    // ...purchase logic...
    notifyDiscord({ type: 'milestone', message: `🛒 Template purchased by user ${req.body.userId || 'unknown'}` });
    res.json({ success: true });
  } catch (err) {
    notifyDiscord({ type: 'error', message: `Template purchase error: ${err.message}` });
    res.status(500).json({ error: 'Purchase failed', details: err.message });
  }
});

module.exports = router;
