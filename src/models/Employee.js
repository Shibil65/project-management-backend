const mongoose = require('mongoose');

const EmployeeSchema = new mongoose.Schema({
  authUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  name: { type: String, required: true },
  email: { type: String, required: true, lowercase: true, trim: true, index: true },
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true
  },
  companyName: { type: String, default: '' },
  org: { type: String, default: '' },
  role: { type: String, default: 'Employee' },
  phone: { type: String, default: '' },
  location: { type: String, default: '' },
  domain: { type: String, default: '' },
  bio: { type: String, default: '' },
  skills: [{ type: String }],
  avatarColor: { type: String, default: '#6366f1' },
  date: { type: String, default: () => new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) },
  status: { type: String, enum: ['Active', 'Suspended', 'Deleted'], default: 'Active' },
  portalSetup: { type: Boolean, default: false },
  githubUsername: { type: String, default: '' }
}, { timestamps: true });

EmployeeSchema.index({ companyId: 1, email: 1 }, { unique: true });

const { tenantPlugin } = require('../utils/tenantPlugin');
EmployeeSchema.plugin(tenantPlugin);

module.exports = mongoose.models.Employee || mongoose.model('Employee', EmployeeSchema, 'employees');
