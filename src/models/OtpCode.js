const mongoose = require('mongoose');

const OtpCodeSchema = new mongoose.Schema({
  email: { 
    type: String, 
    required: true, 
    unique: true, 
    lowercase: true, 
    trim: true 
  },
  otp: { 
    type: String, 
    required: true 
  }, // Hashed OTP
  expiresAt: { 
    type: Date, 
    required: true, 
    index: { expires: '15m' } // TTL index to automatically remove the document. We set a 15-minute buffer so that active locks aren't prematurely deleted.
  },
  attempts: { 
    type: Number, 
    default: 0 
  },
  lockedUntil: { 
    type: Date, 
    default: null 
  },
  lastSentAt: { 
    type: Date, 
    default: null 
  }
}, { timestamps: true });

module.exports = mongoose.models.OtpCode || mongoose.model('OtpCode', OtpCodeSchema);
