const mongoose = require('mongoose');

const ClientSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true
  },
  org: { type: String, required: true },
  status: { type: String, enum: ['Active', 'Suspended'], default: 'Active' },
  isDeleted: { type: Boolean, default: false }
}, { timestamps: true });

const { tenantPlugin } = require('../utils/tenantPlugin');
ClientSchema.plugin(tenantPlugin);

module.exports = mongoose.models.Client || mongoose.model('Client', ClientSchema);
