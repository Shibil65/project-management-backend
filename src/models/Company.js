const mongoose = require('mongoose');

const CompanySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  desc: { type: String, default: '' },
  plan: { type: String, default: 'Free' },
  users: { type: Number, default: 0 },
  billing: { type: Number, default: 0 },
  billingName: { type: String, default: '' },
  billingEmail: { type: String, default: '' },
  billingPhone: { type: String, default: '' },
  billingAddress: { type: String, default: '' },
  logo: { type: String, default: '' },
  autopay: { type: Boolean, default: true },
  status: { type: String, enum: ['Active', 'Suspended'], default: 'Active' },
  admin: { type: String, required: true },
  isDeleted: { type: Boolean, default: false },
  gpsLatitude: { type: Number, default: null },
  gpsLongitude: { type: Number, default: null },
  gpsRadius: { type: Number, default: 200 },
  gpsTrackingEnabled: { type: Boolean, default: true },
  ipTrackingEnabled: { type: Boolean, default: false },
  allowedPublicIps: { type: [String], default: [] },
  attendancePortalEnabled: { type: Boolean, default: true },
  attendancePortalOpenTime: { type: String, default: '09:00' },
  attendancePortalCloseTime: { type: String, default: '18:00' }
}, { timestamps: true });

module.exports = mongoose.models.Company || mongoose.model('Company', CompanySchema);


