const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  name:       { type: String, required: true },
  email:      { type: String, required: true, unique: true },
  companyId:  {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    index: true
  },
  org:        { type: String, default: '' },
  role:       { type: String, enum: ['Super Admin', 'Company Admin', 'Project Lead', 'project_lead', 'Employee'], default: 'Employee' },
  // Employee-specific fields
  password:   { type: String, default: '' },          // bcrypt-hashed temp password
  phone:      { type: String, default: '' },
  location:   { type: String, default: '' },
  domain:     { type: String, default: '' },           // tech stack / department
  bio:        { type: String, default: '' },
  skills:     [{ type: String }],
  avatarColor: { type: String, default: '#6366f1' },  // random colour for avatar
  date:       { type: String, default: () => new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) },
  status:     { type: String, enum: ['Active', 'Suspended'], default: 'Active' },
  portalSetup: { type: Boolean, default: false },       // true once employee has logged into portal
  mustChangePassword: { type: Boolean, default: false }, // true for newly invited employees
  securityPin: { type: String, default: '123456' },      // 6-digit security PIN for clocking
  attendancePin: { type: String, default: '' },          // bcrypt-hashed PIN
  hasAttendancePin: { type: Boolean, default: false },   // true once security PIN has been updated/hashed
  pinAttempts: { type: Number, default: 0 },             // track failed PIN entries
  pinLockedUntil: { type: Date, default: null },         // lock security checks
  githubUsername: { type: String, default: '' }
}, { timestamps: true });

const { tenantPlugin } = require('../utils/tenantPlugin');
UserSchema.plugin(tenantPlugin);

module.exports = mongoose.models.User || mongoose.model('User', UserSchema);
