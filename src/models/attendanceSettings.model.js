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
  attendanceEnabled: { type: Boolean, default: true },
  qrAttendanceEnabled: { type: Boolean, default: true },
  qrExpiresInMinutes: { type: Number, default: 30 },
  requireAdminPortalHeartbeat: { type: Boolean, default: true },
  heartbeatIntervalSeconds: { type: Number, default: 10 },
  heartbeatTimeoutSeconds: { type: Number, default: 30 },
  methods: {
    qr: {
      enabled: { type: Boolean, default: true }
    },
    gps: {
      enabled: { type: Boolean, default: false },
      maximumAcceptedAccuracy: { type: Number, default: 100 },
      defaultRadiusMeters: { type: Number, default: 100 },
      requireRadarVerification: { type: Boolean, default: false },
      allowLocalFallback: { type: Boolean, default: false }
    }
  },
  createdBy: { type: String, default: '' },
  updatedBy: { type: String, default: '' }
}, { timestamps: true });

AttendanceSettingsSchema.plugin(tenantPlugin);

module.exports = mongoose.models.AttendanceSettings || mongoose.model('AttendanceSettings', AttendanceSettingsSchema);
