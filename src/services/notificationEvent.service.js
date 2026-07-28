const Notification = require('../models/Notification');
const { sendPushToUser } = require('./pushNotification.service');

/**
 * Reusable event service to create in-app notification and trigger push delivery
 */
async function createAndDispatchNotification({
  companyId,
  recipientId,
  actorId = null,
  type,
  title,
  message,
  route = '/',
  entityType = null,
  entityId = null,
  deduplicationKey = null,
  metadata = {}
}) {
  if (!companyId || !recipientId || !type || !title || !message) {
    console.warn('[NotificationEvent] Missing required fields for notification dispatch');
    return null;
  }

  try {
    // 1. Check deduplication key if provided
    if (deduplicationKey) {
      const existing = await Notification.findOne({ companyId, recipientId, deduplicationKey });
      if (existing) {
        console.log(`[NotificationEvent] Skipping duplicate notification key "${deduplicationKey}"`);
        return existing;
      }
    }

    // 2. Create in-app Notification record
    const notification = await Notification.create({
      companyId,
      recipientId,
      actorId,
      type,
      title: title.slice(0, 120),
      message: message.slice(0, 300),
      route,
      entityType,
      entityId,
      deliveryChannels: { inApp: true, push: true },
      pushStatus: 'pending',
      deduplicationKey,
      metadata
    });

    // 3. Attempt async push dispatch
    sendPushToUser({
      companyId,
      userId: recipientId,
      title,
      body: message,
      route,
      type,
      entityId,
      notificationId: notification._id,
      deduplicationKey
    })
      .then(pushResult => {
        const updateData = { pushStatus: pushResult.status || 'failed' };
        if (pushResult.success) updateData.sentAt = new Date();
        Notification.updateOne({ _id: notification._id }, { $set: updateData }).catch(err => {
          console.error('[NotificationEvent] Failed updating pushStatus:', err.message);
        });
      })
      .catch(err => {
        console.error('[NotificationEvent] Push dispatch error:', err.message);
        Notification.updateOne({ _id: notification._id }, { $set: { pushStatus: 'failed' } }).catch(() => {});
      });

    return notification;
  } catch (err) {
    console.error('[NotificationEvent] Exception in createAndDispatchNotification:', err.message);
    return null;
  }
}

/**
 * Dispatch to multiple recipients at once
 */
async function dispatchBulkNotifications({
  companyId,
  recipientIds = [],
  actorId = null,
  type,
  title,
  message,
  route = '/',
  entityType = null,
  entityId = null,
  metadata = {}
}) {
  if (!recipientIds || !recipientIds.length) return [];
  const results = [];
  for (const recipientId of recipientIds) {
    const notif = await createAndDispatchNotification({
      companyId,
      recipientId,
      actorId,
      type,
      title,
      message,
      route,
      entityType,
      entityId,
      metadata
    });
    if (notif) results.push(notif);
  }
  return results;
}

module.exports = {
  createAndDispatchNotification,
  dispatchBulkNotifications
};
