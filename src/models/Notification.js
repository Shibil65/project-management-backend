const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true
    },
    recipientId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true
    },
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null
    },
    type: {
      type: String,
      required: true,
      enum: [
        'taskAssigned',
        'taskUpdated',
        'taskComment',
        'deadlineReminder',
        'leaveUpdate',
        'attendanceReminder',
        'forgotCheckout',
        'meetingReminder',
        'announcement',
        'adminCustom',
        'system'
      ],
      index: true
    },
    title: {
      type: String,
      required: true,
      maxlength: 120
    },
    message: {
      type: String,
      required: true,
      maxlength: 300
    },
    route: {
      type: String,
      default: '/'
    },
    entityType: {
      type: String,
      default: null
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null
    },
    deliveryChannels: {
      inApp: { type: Boolean, default: true },
      push: { type: Boolean, default: true }
    },
    pushStatus: {
      type: String,
      enum: ['pending', 'sent', 'partial', 'failed', 'skipped'],
      default: 'pending'
    },
    sentAt: {
      type: Date,
      default: null
    },
    readAt: {
      type: Date,
      default: null
    },
    deduplicationKey: {
      type: String,
      default: null,
      index: true
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true
  }
);

// Compound index for querying user notifications quickly
notificationSchema.index({ companyId: 1, recipientId: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
