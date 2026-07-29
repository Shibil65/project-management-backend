const mongoose = require('mongoose');
const { tenantPlugin } = require('../utils/tenantPlugin');

const CompanyAttendanceSettingsSchema = new mongoose.Schema({
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true,
    unique: true
  },
  attendanceEnabled: { type: Boolean, default: true },
  methods: {
    qr: {
      enabled: { type: Boolean, default: false }
    },
    gps: {
      enabled: { type: Boolean, default: false },
      maximumAcceptedAccuracy: { type: Number, default: 50 },
      locationTimeoutSeconds: { type: Number, default: 12 }
    }
  },
  createdBy: { type: String, default: '' },
  updatedBy: { type: String, default: '' }
}, { timestamps: true });

CompanyAttendanceSettingsSchema.plugin(tenantPlugin);

module.exports = mongoose.models.CompanyAttendanceSettings || mongoose.model('CompanyAttendanceSettings', CompanyAttendanceSettingsSchema);
