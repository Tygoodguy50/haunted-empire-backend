const mongoose = require('mongoose');

const ViralScoreSchema = new mongoose.Schema({
  creator: { type: mongoose.Schema.Types.ObjectId, ref: 'Creator' },
  score: { type: Number, default: 0 },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ViralScore', ViralScoreSchema);
