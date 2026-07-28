/**
 * Single reusable Firebase Admin initialization module.
 * Safely initializes Firebase Admin SDK without crashing the application
 * if configuration is missing or push notifications are disabled.
 */

let firebaseAdmin = null;
let messagingInstance = null;
let initError = null;

function initializeFirebaseAdmin() {
  if (messagingInstance) {
    return { admin: firebaseAdmin, messaging: messagingInstance, isEnabled: true, error: null };
  }

  const pushEnabledEnv = String(process.env.FIREBASE_PUSH_ENABLED || 'true').toLowerCase();
  if (pushEnabledEnv === 'false' || pushEnabledEnv === '0') {
    return { admin: null, messaging: null, isEnabled: false, error: 'Push notifications disabled via configuration' };
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !rawPrivateKey) {
    initError = 'Firebase credentials missing in environment variables';
    return { admin: null, messaging: null, isEnabled: false, error: initError };
  }

  try {
    const admin = require('firebase-admin');
    
    if (!admin.apps.length) {
      const privateKey = rawPrivateKey.replace(/\\n/g, '\n');
      
      firebaseAdmin = admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey
        })
      });
      console.log(`[FirebaseAdmin] Firebase Admin SDK successfully initialized for project "${projectId}"`);
    } else {
      firebaseAdmin = admin.app();
    }

    messagingInstance = firebaseAdmin.messaging();
    initError = null;
    return { admin: firebaseAdmin, messaging: messagingInstance, isEnabled: true, error: null };
  } catch (err) {
    initError = err.message;
    if (err.code === 'MODULE_NOT_FOUND' || err.message?.includes('Cannot find module')) {
      console.warn('[FirebaseAdmin] Warning: "firebase-admin" package is not installed in node_modules yet. Run "npm install" in project-management-backend.');
    } else {
      console.error('[FirebaseAdmin] Error initializing Firebase Admin SDK:', err.message);
    }
    return { admin: null, messaging: null, isEnabled: false, error: err.message };
  }
}

function getMessaging() {
  const { messaging } = initializeFirebaseAdmin();
  return messaging;
}

function isPushEnabled() {
  const { isEnabled } = initializeFirebaseAdmin();
  return isEnabled;
}

module.exports = {
  initializeFirebaseAdmin,
  getMessaging,
  isPushEnabled
};
