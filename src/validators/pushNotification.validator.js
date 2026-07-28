/**
 * Validation logic for push notification requests
 */

const ALLOWED_PREFERENCE_KEYS = [
  'taskAssigned',
  'taskUpdated',
  'taskComment',
  'deadlineReminder',
  'attendanceReminder',
  'forgotCheckout',
  'leaveUpdate',
  'meetingReminder',
  'announcement'
];

function validateRegistrationInput(body) {
  const { installationId, permission, platform, browser, deviceName } = body || {};

  if (!installationId || typeof installationId !== 'string' || !installationId.trim()) {
    return { isValid: false, message: 'Valid installationId is required.' };
  }

  if (installationId.length < 5 || installationId.length > 500) {
    return { isValid: false, message: 'Invalid installationId format or length.' };
  }

  if (permission && !['granted', 'denied', 'default'].includes(permission)) {
    return { isValid: false, message: 'Invalid permission state.' };
  }

  return { isValid: true };
}

function validatePreferencesInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { isValid: false, message: 'Preferences payload must be an object.' };
  }

  const sanitized = {};
  for (const key of Object.keys(body)) {
    if (!ALLOWED_PREFERENCE_KEYS.includes(key)) {
      return { isValid: false, message: `Invalid preference field: ${key}` };
    }
    if (typeof body[key] !== 'boolean') {
      return { isValid: false, message: `Preference field '${key}' must be a boolean value.` };
    }
    sanitized[key] = body[key];
  }

  if (!Object.keys(sanitized).length) {
    return { isValid: false, message: 'At least one preference field must be provided.' };
  }

  return { isValid: true, sanitized };
}

function validateAdminSendInput(body) {
  const { title, message, route, recipientIds } = body || {};

  if (!title || typeof title !== 'string' || !title.trim()) {
    return { isValid: false, message: 'Title is required.' };
  }

  if (title.trim().length > 80) {
    return { isValid: false, message: 'Title exceeds maximum length of 80 characters.' };
  }

  if (!message || typeof message !== 'string' || !message.trim()) {
    return { isValid: false, message: 'Message is required.' };
  }

  if (message.trim().length > 240) {
    return { isValid: false, message: 'Message exceeds maximum length of 240 characters.' };
  }

  if (route && (typeof route !== 'string' || !route.startsWith('/') || route.startsWith('//') || route.includes('://'))) {
    return { isValid: false, message: 'Route must be a valid relative application route starting with /.' };
  }

  if (recipientIds && !Array.isArray(recipientIds)) {
    return { isValid: false, message: 'recipientIds must be an array of employee/user IDs.' };
  }

  if (recipientIds && recipientIds.length > 500) {
    return { isValid: false, message: 'Maximum 500 recipients allowed per send operation.' };
  }

  return { isValid: true };
}

module.exports = {
  validateRegistrationInput,
  validatePreferencesInput,
  validateAdminSendInput,
  ALLOWED_PREFERENCE_KEYS
};
