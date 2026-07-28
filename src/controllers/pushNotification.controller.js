const PushRegistration = require('../models/PushRegistration');
const Notification = require('../models/Notification');
const { isPushEnabled } = require('../config/firebaseAdmin');
const { sendPushToUser, sendPushToMultipleUsers } = require('../services/pushNotification.service');
const { createAndDispatchNotification, dispatchBulkNotifications } = require('../services/notificationEvent.service');
const {
  validateRegistrationInput,
  validatePreferencesInput,
  validateAdminSendInput
} = require('../validators/pushNotification.validator');

// In-memory simple rate limiting for self-test notifications (max 3 tests per 10 minutes per user)
const testRateLimitMap = new Map();

function checkTestRateLimit(userId) {
  const now = Date.now();
  const windowMs = 10 * 60 * 1000;
  const maxAllowed = 3;

  const records = testRateLimitMap.get(userId) || [];
  const validRecords = records.filter(timestamp => now - timestamp < windowMs);

  if (validRecords.length >= maxAllowed) {
    return false;
  }

  validRecords.push(now);
  testRateLimitMap.set(userId, validRecords);
  return true;
}

/**
 * Mask installation ID for safe API responses
 */
function maskInstallationId(id) {
  if (!id || typeof id !== 'string') return '****';
  if (id.length <= 10) return '****' + id.slice(-4);
  return id.slice(0, 4) + '...' + id.slice(-6);
}

/**
 * POST /api/push/registrations
 * Register or update browser FID registration
 */
async function registerPush(req, res) {
  try {
    const validation = validateRegistrationInput(req.body);
    if (!validation.isValid) {
      return res.status(400).json({ success: false, message: validation.message });
    }

    const { installationId, permission = 'granted', platform, browser, deviceName, userAgent } = req.body;
    
    // Derive tenant & user identity strictly from authenticated JWT
    const companyId = req.user.companyId;
    const userId = req.user.id;
    const employeeId = req.user.id; // Or employee reference ID

    if (!companyId || !userId) {
      return res.status(400).json({ success: false, message: 'Invalid user or tenant context.' });
    }

    // Upsert registration securely
    const existing = await PushRegistration.findOne({ installationId });

    let registration;
    if (existing) {
      existing.companyId = companyId;
      existing.userId = userId;
      if (employeeId) existing.employeeId = employeeId;
      existing.permission = permission;
      existing.enabled = permission === 'granted';
      if (platform) existing.platform = platform;
      if (browser) existing.browser = browser;
      if (deviceName) existing.deviceName = deviceName;
      if (userAgent) existing.userAgent = userAgent;
      existing.lastRegisteredAt = new Date();
      existing.lastSeenAt = new Date();
      existing.disabledAt = permission === 'granted' ? null : new Date();
      registration = await existing.save();
    } else {
      registration = await PushRegistration.create({
        companyId,
        userId,
        employeeId,
        installationId,
        permission,
        enabled: permission === 'granted',
        platform: platform || 'unknown',
        browser: browser || 'Unknown Browser',
        deviceName: deviceName || 'Unknown Device',
        userAgent: userAgent || '',
        lastRegisteredAt: new Date(),
        lastSeenAt: new Date()
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Push registration updated successfully.',
      data: {
        registered: registration.enabled,
        permission: registration.permission,
        maskedId: maskInstallationId(registration.installationId),
        lastRegisteredAt: registration.lastRegisteredAt
      }
    });
  } catch (err) {
    console.error('[PushController] Error registering push:', err);
    return res.status(500).json({ success: false, message: 'Failed to process push registration.' });
  }
}

/**
 * DELETE /api/push/registrations/current
 * Disable or remove current device registration
 */
async function deregisterPush(req, res) {
  try {
    const { installationId } = req.body || {};
    const userId = req.user.id;
    const companyId = req.user.companyId;

    if (!installationId) {
      // If installationId is not passed, disable all active registrations for this user
      await PushRegistration.updateMany(
        { userId, companyId, enabled: true },
        { $set: { enabled: false, permission: 'denied', disabledAt: new Date() } }
      );
      return res.status(200).json({
        success: true,
        message: 'Push notifications disabled for all devices.'
      });
    }

    const registration = await PushRegistration.findOne({
      installationId,
      userId,
      companyId
    });

    if (registration) {
      registration.enabled = false;
      registration.permission = 'denied';
      registration.disabledAt = new Date();
      await registration.save();
    }

    return res.status(200).json({
      success: true,
      message: 'Device push registration disabled successfully.'
    });
  } catch (err) {
    console.error('[PushController] Error deregistering push:', err);
    return res.status(500).json({ success: false, message: 'Failed to disable push registration.' });
  }
}

/**
 * GET /api/push/status
 * Return current user's push notification status & preferences
 */
async function getPushStatus(req, res) {
  try {
    const userId = req.user.id;
    const companyId = req.user.companyId;

    const configured = isPushEnabled();
    const registrations = await PushRegistration.find({ companyId, userId });

    const activeCount = registrations.filter(r => r.enabled).length;
    const latestReg = registrations.sort((a, b) => b.lastSeenAt - a.lastSeenAt)[0];

    const preferences = latestReg?.preferences || {
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

    return res.status(200).json({
      success: true,
      data: {
        supported: true,
        configured,
        permission: latestReg?.permission || 'default',
        registered: activeCount > 0,
        enabled: activeCount > 0 && configured,
        deviceCount: activeCount,
        totalDevices: registrations.length,
        preferences
      }
    });
  } catch (err) {
    console.error('[PushController] Error fetching push status:', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve push status.' });
  }
}

/**
 * PATCH /api/push/preferences
 * Update notification preference settings for authenticated user
 */
async function updatePreferences(req, res) {
  try {
    const validation = validatePreferencesInput(req.body);
    if (!validation.isValid) {
      return res.status(400).json({ success: false, message: validation.message });
    }

    const userId = req.user.id;
    const companyId = req.user.companyId;

    const registrations = await PushRegistration.find({ companyId, userId });
    if (!registrations.length) {
      return res.status(404).json({ success: false, message: 'No registered devices found for your account.' });
    }

    for (const reg of registrations) {
      reg.preferences = {
        ...reg.preferences,
        ...validation.sanitized
      };
      await reg.save();
    }

    return res.status(200).json({
      success: true,
      message: 'Notification preferences updated successfully.',
      data: { preferences: registrations[0].preferences }
    });
  } catch (err) {
    console.error('[PushController] Error updating preferences:', err);
    return res.status(500).json({ success: false, message: 'Failed to update preferences.' });
  }
}

/**
 * POST /api/push/test
 * Send a test notification to authenticated user's registered devices
 */
async function sendTestNotification(req, res) {
  try {
    const userId = req.user.id;
    const companyId = req.user.companyId;

    if (!checkTestRateLimit(userId)) {
      return res.status(429).json({
        success: false,
        message: 'Rate limit exceeded. Maximum 3 test notifications allowed in 10 minutes.'
      });
    }

    const notification = await createAndDispatchNotification({
      companyId,
      recipientId: userId,
      actorId: userId,
      type: 'adminCustom',
      title: 'Test Push Notification',
      message: 'Your web push notifications are working properly! 🎉',
      route: '/employee/profile',
      metadata: { isTest: true }
    });

    return res.status(200).json({
      success: true,
      message: 'Test notification sent to your active devices.',
      data: { notificationId: notification?._id }
    });
  } catch (err) {
    console.error('[PushController] Error sending test notification:', err);
    return res.status(500).json({ success: false, message: 'Failed to send test notification.' });
  }
}

/**
 * POST /api/push/admin/send
 * Company Admin / Super Admin broadcast or targeted notification send
 */
async function adminSendNotification(req, res) {
  try {
    const validation = validateAdminSendInput(req.body);
    if (!validation.isValid) {
      return res.status(400).json({ success: false, message: validation.message });
    }

    const { title, message, route = '/', recipientIds } = req.body;
    const adminCompanyId = req.user.companyId;
    const adminUserId = req.user.id;

    // Enforce tenant scoping: resolve valid recipient user IDs strictly belonging to admin's company
    const User = require('../models/User');
    const Employee = require('../models/Employee');

    let targetUserIds = [];

    if (recipientIds && recipientIds.length) {
      // Find matching users/employees within companyId
      const matchedUsers = await User.find({ _id: { $in: recipientIds }, companyId: adminCompanyId }, '_id');
      const matchedEmployees = await Employee.find({ _id: { $in: recipientIds }, companyId: adminCompanyId }, '_id');

      const set = new Set([
        ...matchedUsers.map(u => String(u._id)),
        ...matchedEmployees.map(e => String(e._id))
      ]);
      targetUserIds = Array.from(set);
    } else {
      // Broadcast to all active users/employees in company
      const companyUsers = await User.find({ companyId: adminCompanyId, status: { $ne: 'Deleted' } }, '_id');
      const companyEmployees = await Employee.find({ companyId: adminCompanyId, status: { $ne: 'Deleted' } }, '_id');

      const set = new Set([
        ...companyUsers.map(u => String(u._id)),
        ...companyEmployees.map(e => String(e._id))
      ]);
      targetUserIds = Array.from(set);
    }

    if (!targetUserIds.length) {
      return res.status(404).json({ success: false, message: 'No valid company recipients found.' });
    }

    // Dispatch notifications
    const sentNotifs = await dispatchBulkNotifications({
      companyId: adminCompanyId,
      recipientIds: targetUserIds,
      actorId: adminUserId,
      type: 'announcement',
      title: title.trim(),
      message: message.trim(),
      route: route ? route.trim() : '/',
      metadata: { sentByAdmin: adminUserId }
    });

    return res.status(200).json({
      success: true,
      message: `Notification dispatched to ${targetUserIds.length} employee(s).`,
      data: {
        recipientCount: targetUserIds.length,
        dispatchedCount: sentNotifs.length
      }
    });
  } catch (err) {
    console.error('[PushController] Error in admin send:', err);
    return res.status(500).json({ success: false, message: 'Failed to send admin notification.' });
  }
}

module.exports = {
  registerPush,
  deregisterPush,
  getPushStatus,
  updatePreferences,
  sendTestNotification,
  adminSendNotification
};
