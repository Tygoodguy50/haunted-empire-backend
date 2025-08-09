const mongoose = require('mongoose');

const TikTokWebhookSchema = new mongoose.Schema({
  creator: { type: mongoose.Schema.Types.ObjectId, ref: 'Creator' },
  eventType: { type: String, required: true },
  fragmentId: { type: String },
  payload: { type: Object },
  receivedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('TikTokWebhook', TikTokWebhookSchema);
