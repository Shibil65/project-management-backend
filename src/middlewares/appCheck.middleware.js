const { initializeFirebaseAdmin } = require('../config/firebaseAdmin');

/**
 * Middleware to verify Firebase App Check token sent in X-Firebase-AppCheck header
 */
async function verifyAppCheck(req, res, next) {
  const appCheckToken = req.header('X-Firebase-AppCheck');

  const { admin, isEnabled } = initializeFirebaseAdmin();

  // If Firebase Admin is not configured, bypass for development/testing
  if (!isEnabled || !admin) {
    req.appCheckVerified = false;
    return next();
  }

  if (!appCheckToken) {
    // In production mode with app check enabled, require app check token
    if (process.env.NODE_ENV === 'production' && process.env.ENFORCE_APP_CHECK === 'true') {
      return res.status(401).json({
        success: false,
        code: 'APP_CHECK_REQUIRED',
        message: 'Firebase App Check token missing in X-Firebase-AppCheck header'
      });
    }
    req.appCheckVerified = false;
    return next();
  }

  try {
    const appCheckClaims = await admin.appCheck().verifyToken(appCheckToken);
    req.appCheckClaims = appCheckClaims;
    req.appCheckVerified = true;
    return next();
  } catch (err) {
    console.warn('[AppCheck] Token verification failed:', err.message);
    if (process.env.NODE_ENV === 'production' && process.env.ENFORCE_APP_CHECK === 'true') {
      return res.status(401).json({
        success: false,
        code: 'APP_CHECK_INVALID',
        message: 'Invalid or expired Firebase App Check token'
      });
    }
    req.appCheckVerified = false;
    return next();
  }
}

module.exports = {
  verifyAppCheck
};
