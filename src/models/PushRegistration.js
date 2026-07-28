const mongoose = require('mongoose');

const defaultPreferences = {
  taskAssigned: true,
  taskUpdated: true,
  taskComment: true,
  deadlineReminder: true,
  attendanceReminder: true,
  forgotCheckout: true,
  leaveUpdate: true,
  meetingReminder: true,
  announcement: true
};

const pushRegistrationSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      index: true
    },
    installationId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true
    },
    platform: {
      type: String,
      enum: ['android', 'ios', 'desktop', 'unknown'],
      default: 'unknown'
    },
    browser: {
      type: String,
      default: 'Unknown Browser'
    },
    deviceName: {
      type: String,
      default: 'Unknown Device'
    },
    userAgent: {
      type: String,
      default: ''
    },
    permission: {
      type: String,
      enum: ['granted', 'denied', 'default'],
      default: 'granted'
    },
    enabled: {
      type: Boolean,
      default: true,
      index: true
    },
    preferences: {
      taskAssigned: { type: Boolean, default: true },
      taskUpdated: { type: Boolean, default: true },
      taskComment: { type: Boolean, default: true },
      deadlineReminder: { type: Boolean, default: true },
      attendanceReminder: { type: Boolean, default: true },
      forgotCheckout: { type: Boolean, default: true },
      leaveUpdate: { type: Boolean, default: true },
      meetingReminder: { type: Boolean, default: true },
      announcement: { type: Boolean, default: true }
    },
    lastRegisteredAt: {
      type: Date,
      default: Date.now
    },
    lastSeenAt: {
      type: Date,
      default: Date.now
    },
    disabledAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

// Compound index for efficient user multi-device queries within tenant
pushRegistrationSchema.index({ companyId: 1, userId: 1, enabled: 1 });
pushRegistrationSchema.index({ companyId: 1, employeeId: 1, enabled: 1 });

module.exports = mongoose.model('PushRegistration', pushRegistrationSchema);
