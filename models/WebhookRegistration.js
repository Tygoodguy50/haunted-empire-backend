const mongoose = require('mongoose');

const WebhookRegistrationSchema = new mongoose.Schema({
  platform: { type: String, required: true },
  callbackUrl: { type: String, required: true },
  eventTypes: [{ type: String }],
  registrationResponse: { type: Object },
  registeredAt: { type: Date, default: Date.now },
  apiKey: { type: String },
  creator: { type: mongoose.Schema.Types.ObjectId, ref: 'Creator' }
});

module.exports = mongoose.model('WebhookRegistration', WebhookRegistrationSchema);
