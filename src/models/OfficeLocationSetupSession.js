const mongoose = require('mongoose');
const { tenantPlugin } = require('../utils/tenantPlugin');

const OfficeLocationSetupSessionSchema = new mongoose.Schema({
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true
  },
  createdBy: {
    type: String,
    required: true
  },
  tokenHash: {
    type: String,
    required: true,
    index: true
  },
  officeLocationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'OfficeLocation',
    default: null
  },
  status: {
    type: String,
    enum: ['pending', 'captured', 'confirmed', 'expired'],
    default: 'pending'
  },
  capturedLocation: {
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    address: { type: String, default: '' }
  },
  accuracyMeters: {
    type: Number,
    default: null
  },
  expiresAt: {
    type: Date,
    required: true,
    expires: 300 // TTL 5 minutes
  }
}, { timestamps: true });

OfficeLocationSetupSessionSchema.plugin(tenantPlugin);

module.exports = mongoose.models.OfficeLocationSetupSession || mongoose.model('OfficeLocationSetupSession', OfficeLocationSetupSessionSchema);
