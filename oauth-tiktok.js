// Basic TikTok OAuth handler (Node.js/Express example)
const express = require('express');
const router = express.Router();
const axios = require('axios');

const CLIENT_ID = process.env.TIKTOK_CLIENT_ID;
const CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET;
const REDIRECT_URI = process.env.TIKTOK_REDIRECT_URI;

// Step 1: Redirect user to TikTok for authorization
router.get('/auth/tiktok', (req, res) => {
  const url = `https://www.tiktok.com/v2/auth/authorize/?client_key=${CLIENT_ID}&response_type=code&scope=user.info.basic&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;
  res.redirect(url);
});

// Step 2: TikTok redirects back with code
router.get('/auth/tiktok/callback', async (req, res) => {
  const { code } = req.query;
  const { notifyDiscord } = require('./billing/jobs');
  try {
    const response = await axios.post('https://open.tiktokapis.com/v2/oauth/token/', {
      client_key: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: REDIRECT_URI
    });
    // Save tokens as needed
    notifyDiscord({ type: 'milestone', message: `TikTok OAuth success for code ${code}` });
    res.json(response.data);
  } catch (err) {
    notifyDiscord({ type: 'error', message: `TikTok OAuth error: ${err.message}` });
    res.status(500).json({ error: 'OAuth failed', details: err.message });
  }
});

module.exports = router;
