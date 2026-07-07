const mongoose = require('mongoose');

const OtpCodeSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  otp: { type: String, required: true },
  expiresAt: { type: Date, required: true, expires: 0 }
}, { timestamps: true });

module.exports = mongoose.models.OtpCode || mongoose.model('OtpCode', OtpCodeSchema);
