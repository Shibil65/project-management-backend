const mongoose = require('mongoose');
const { tenantPlugin } = require('../utils/tenantPlugin');

const OfficeLocationSchema = new mongoose.Schema({
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true
  },
  name: { type: String, required: true },
  address: { type: String, default: '' },
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: true
    }
  },
  radiusMeters: { type: Number, default: 100 },
  isActive: { type: Boolean, default: true },
  createdBy: { type: String, default: '' },
  updatedBy: { type: String, default: '' }
}, { timestamps: true });

OfficeLocationSchema.index({ location: '2dsphere' });
OfficeLocationSchema.plugin(tenantPlugin);

module.exports = mongoose.models.OfficeLocation || mongoose.model('OfficeLocation', OfficeLocationSchema);
