const mongoose = require('mongoose');

const LoreLogSchema = new mongoose.Schema({
  creator: { type: mongoose.Schema.Types.ObjectId, ref: 'Creator' },
  eventType: { type: String, required: true },
  details: { type: Object },
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('LoreLog', LoreLogSchema);
