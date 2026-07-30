const mongoose = require('mongoose');
const { tenantPlugin } = require('../utils/tenantPlugin');

const OfficeLocationSchema = new mongoose.Schema({
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  address: {
    type: String,
    default: ''
  },
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    // Array format: [longitude, latitude]
    coordinates: {
      type: [Number],
      required: true
    }
  },
  radiusMeters: {
    type: Number,
    default: 100,
    min: 10
  },
  maximumAcceptedAccuracy: {
    type: Number,
    default: 60,
    min: 5
  },
  isActive: {
    type: Boolean,
    default: true
  },
  radarGeofenceId: {
    type: String,
    default: ''
  },
  radarTag: {
    type: String,
    default: 'company-office'
  },
  radarExternalId: {
    type: String,
    default: ''
  },
  radarSyncStatus: {
    type: String,
    enum: ['pending', 'synced', 'failed'],
    default: 'pending'
  },
  radarLastSyncedAt: {
    type: Date,
    default: null
  },
  createdBy: {
    type: String,
    default: ''
  },
  updatedBy: {
    type: String,
    default: ''
  }
}, { timestamps: true });

// 2dsphere index for geo queries
OfficeLocationSchema.index({ location: '2dsphere' });
OfficeLocationSchema.plugin(tenantPlugin);

module.exports = mongoose.models.OfficeLocation || mongoose.model('OfficeLocation', OfficeLocationSchema);
