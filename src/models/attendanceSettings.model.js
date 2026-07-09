const mongoose = require('mongoose');
const { tenantPlugin } = require('../utils/tenantPlugin');

const AttendanceSettingsSchema = new mongoose.Schema({
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true,
    unique: true
  },
  qrAttendanceEnabled: { type: Boolean, default: false },
  qrExpiresInMinutes: { type: Number, default: 5 },
  requireAdminPortalHeartbeat: { type: Boolean, default: true },
  heartbeatIntervalSeconds: { type: Number, default: 10 },
  heartbeatTimeoutSeconds: { type: Number, default: 30 },
  createdBy: { type: String, default: '' },
  updatedBy: { type: String, default: '' }
}, { timestamps: true });

AttendanceSettingsSchema.plugin(tenantPlugin);

module.exports = mongoose.models.AttendanceSettings || mongoose.model('AttendanceSettings', AttendanceSettingsSchema);
