const mongoose = require('mongoose');

const CreatorSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  stripeId: { type: String },
  viralScore: { type: Number, default: 0 },
  loreLogs: [{ type: mongoose.Schema.Types.ObjectId, ref: 'LoreLog' }],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Creator', CreatorSchema);
