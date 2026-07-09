const mongoose = require('mongoose');

const AttendanceSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true
  },
  org: { type: String, required: true },
  date: { type: String, default: () => new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) },
  checkIn: { type: String, required: true },
  checkOut: { type: String, default: '' },
  duration: { type: String, default: '' },
  // Geolocation and Verification tracking fields
  status: { type: String, enum: ['Approved', 'Pending Verification', 'Rejected', 'Absent', 'Leave'], default: 'Approved' },
  remarks: { type: String, default: '' },
  latitude: { type: Number, default: null },
  longitude: { type: Number, default: null },
  accuracy: { type: Number, default: null },
  distance: { type: Number, default: null },
  publicIp: { type: String, default: '' },
  ipStatus: { type: String, enum: ['Approved', 'Pending Verification', 'Rejected', ''], default: '' },
  checkOutLatitude: { type: Number, default: null },
  checkOutLongitude: { type: Number, default: null },
  checkOutAccuracy: { type: Number, default: null },
  checkOutDistance: { type: Number, default: null },
  checkOutPublicIp: { type: String, default: '' },
  checkOutIpStatus: { type: String, enum: ['Approved', 'Pending Verification', 'Rejected', ''], default: '' },
  checkOutStatus: { type: String, enum: ['Approved', 'Pending Verification', 'Rejected'], default: 'Approved' },
  verificationMethod: { type: String, enum: ['qr', 'gps', 'manual'], default: 'gps' },
  qrSessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceQrSession', default: null },
  deviceInfo: { type: String, default: '' }
}, { timestamps: true });

const { tenantPlugin } = require('../utils/tenantPlugin');
AttendanceSchema.plugin(tenantPlugin);

module.exports = mongoose.models.Attendance || mongoose.model('Attendance', AttendanceSchema);
