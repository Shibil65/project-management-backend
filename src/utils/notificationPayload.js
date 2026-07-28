/**
 * Utility to construct safe FCM web push notification payloads
 */

function sanitizeRoute(route) {
  if (!route || typeof route !== 'string') return '/';
  const trimmed = route.trim();
  // Ensure route is relative and starts with /
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.includes('://')) {
    return '/';
  }
  return trimmed;
}

function buildBaseUrl() {
  const envUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  return envUrl.replace(/\/$/, '');
}

function createNotificationPayload({
  title,
  body,
  route = '/',
  type = 'system',
  entityId = '',
  notificationId = '',
  deduplicationKey = null
}) {
  const safeRoute = sanitizeRoute(route);
  const baseUrl = buildBaseUrl();
  const absoluteUrl = `${baseUrl}${safeRoute}`;

  // FCM data payload requires ALL string values
  const dataPayload = {
    type: String(type || 'system'),
    route: String(safeRoute),
    entityId: String(entityId || ''),
    notificationId: String(notificationId || ''),
    click_action: String(absoluteUrl)
  };

  const tag = deduplicationKey || `notif-${type}-${Date.now()}`;

  return {
    notification: {
      title: String(title || 'Notification').slice(0, 100),
      body: String(body || '').slice(0, 300)
    },
    data: dataPayload,
    webpush: {
      notification: {
        title: String(title || 'Notification').slice(0, 100),
        body: String(body || '').slice(0, 300),
        icon: '/icons/notification-icon-192.png',
        badge: '/icons/notification-badge-72.png',
        tag: String(tag),
        requireInteraction: false
      },
      fcmOptions: {
        link: absoluteUrl
      }
    }
  };
}

module.exports = {
  sanitizeRoute,
  buildBaseUrl,
  createNotificationPayload
};
