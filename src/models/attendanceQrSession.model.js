const mongoose = require('mongoose');
const { tenantPlugin } = require('../utils/tenantPlugin');

const AttendanceQrSessionSchema = new mongoose.Schema({
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true
  },
  tokenHash: { type: String, required: true, index: true },
  sessionStatus: { type: String, enum: ['active', 'expired', 'closed'], default: 'active' },
  isActive: { type: Boolean, default: true },
  expiresAt: { type: Date, required: true },
  lastHeartbeatAt: { type: Date, default: Date.now },
  closedAt: { type: Date },
  createdBy: { type: String, default: '' }
}, { timestamps: true });

AttendanceQrSessionSchema.plugin(tenantPlugin);

module.exports = mongoose.models.AttendanceQrSession || mongoose.model('AttendanceQrSession', AttendanceQrSessionSchema);
