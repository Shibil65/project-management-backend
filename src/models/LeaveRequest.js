const mongoose = require('mongoose');

const LeaveRequestSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true
  },
  org: { type: String, required: true },
  reason: { type: String, default: '' },
  startDate: { type: String, required: true },
  endDate: { type: String, required: true },
  status: { type: String, enum: ['Pending', 'Approved', 'Declined'], default: 'Pending' }
}, { timestamps: true });

const { tenantPlugin } = require('../utils/tenantPlugin');
LeaveRequestSchema.plugin(tenantPlugin);

module.exports = mongoose.models.LeaveRequest || mongoose.model('LeaveRequest', LeaveRequestSchema);
