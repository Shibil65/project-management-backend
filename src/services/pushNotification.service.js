const { getMessaging, isPushEnabled } = require('../config/firebaseAdmin');
const PushRegistration = require('../models/PushRegistration');
const { createNotificationPayload } = require('../utils/notificationPayload');

/**
 * Cleanup registrations that Firebase flags as invalid or unregistered
 */
async function deactivateInvalidRegistrations(installationIds, errorCodes) {
  if (!installationIds || !installationIds.length) return;
  try {
    await PushRegistration.updateMany(
      { installationId: { $in: installationIds } },
      { $set: { enabled: false, disabledAt: new Date() } }
    );
    console.log(`[PushService] Soft-disabled ${installationIds.length} invalid/unregistered FCM installation IDs`);
  } catch (err) {
    console.error('[PushService] Error deactivating invalid registrations:', err.message);
  }
}

/**
 * Send push notification to all active devices of a user
 */
async function sendPushToUser({
  companyId,
  userId,
  employeeId,
  title,
  body,
  route = '/',
  type = 'system',
  entityId = null,
  notificationId = null,
  deduplicationKey = null
}) {
  if (!isPushEnabled()) {
    return { success: false, sentCount: 0, failedCount: 0, status: 'skipped', message: 'Push service disabled' };
  }

  const messaging = getMessaging();
  if (!messaging) {
    return { success: false, sentCount: 0, failedCount: 0, status: 'skipped', message: 'Firebase messaging unavailable' };
  }

  try {
    // 1. Load active registrations for user in company
    const query = { companyId, enabled: true, permission: 'granted' };
    if (userId) {
      query.userId = userId;
    } else if (employeeId) {
      query.employeeId = employeeId;
    } else {
      return { success: false, sentCount: 0, failedCount: 0, status: 'skipped', message: 'No target user provided' };
    }

    const registrations = await PushRegistration.find(query);
    if (!registrations || !registrations.length) {
      return { success: true, sentCount: 0, failedCount: 0, status: 'skipped', message: 'No registered devices found' };
    }

    // 2. Filter registrations based on employee preferences
    const activeRegistrations = registrations.filter(reg => {
      if (!reg.preferences) return true;
      // Check if user has opted out of this specific notification category
      if (type && reg.preferences[type] === false) return false;
      return true;
    });

    if (!activeRegistrations.length) {
      return { success: true, sentCount: 0, failedCount: 0, status: 'skipped', message: 'User disabled push for this category' };
    }

    // 3. Build payload
    const payload = createNotificationPayload({
      title,
      body,
      route,
      type,
      entityId: entityId ? String(entityId) : '',
      notificationId: notificationId ? String(notificationId) : '',
      deduplicationKey
    });

    let sentCount = 0;
    let failedCount = 0;
    const invalidInstallationIds = [];

    // 4. Send to each installation ID
    for (const reg of activeRegistrations) {
      const message = {
        ...payload,
        token: reg.installationId // FCM Installation ID or registration token
      };

      try {
        await messaging.send(message);
        sentCount++;
        // Update lastSeenAt timestamp
        PushRegistration.updateOne({ _id: reg._id }, { $set: { lastSeenAt: new Date() } }).catch(() => {});
      } catch (fcmErr) {
        failedCount++;
        const code = fcmErr.code || fcmErr.errorInfo?.code || '';
        console.warn(`[PushService] Failed sending to installation ID (...${reg.installationId.slice(-6)}):`, code || fcmErr.message);

        // Track invalid token errors for cleanup
        if (
          code === 'messaging/invalid-registration-token' ||
          code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-argument' ||
          fcmErr.message?.includes('not registered')
        ) {
          invalidInstallationIds.push(reg.installationId);
        }
      }
    }

    // 5. Cleanup stale installation IDs
    if (invalidInstallationIds.length) {
      deactivateInvalidRegistrations(invalidInstallationIds);
    }

    const status = sentCount > 0 ? (failedCount === 0 ? 'sent' : 'partial') : 'failed';
    return { success: sentCount > 0, sentCount, failedCount, status };
  } catch (err) {
    console.error('[PushService] Exception during push dispatch:', err.message);
    return { success: false, sentCount: 0, failedCount: 1, status: 'failed', error: err.message };
  }
}

/**
 * Send push notification to multiple users in bulk
 */
async function sendPushToMultipleUsers({ companyId, userIds = [], title, body, route, type, data }) {
  if (!userIds || !userIds.length) return { sentCount: 0, failedCount: 0 };
  let totalSent = 0;
  let totalFailed = 0;

  for (const userId of userIds) {
    const result = await sendPushToUser({ companyId, userId, title, body, route, type, ...data });
    totalSent += result.sentCount || 0;
    totalFailed += result.failedCount || 0;
  }

  return { sentCount: totalSent, failedCount: totalFailed };
}

module.exports = {
  sendPushToUser,
  sendPushToMultipleUsers,
  deactivateInvalidRegistrations
};
