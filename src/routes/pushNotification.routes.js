const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/auth');
const { leadGuard, adminGuard } = require('../middlewares/roleGuard');
const {
  registerPush,
  deregisterPush,
  getPushStatus,
  updatePreferences,
  sendTestNotification,
  adminSendNotification
} = require('../controllers/pushNotification.controller');

// All push notification routes require JWT authentication
router.use(authMiddleware);

// User push registration & settings endpoints
router.post('/registrations', registerPush);
router.delete('/registrations/current', deregisterPush);
router.get('/status', getPushStatus);
router.patch('/preferences', updatePreferences);
router.post('/test', sendTestNotification);

// Admin broadcast send endpoint (Company Admin, Super Admin, Project Lead)
router.post('/admin/send', leadGuard, adminSendNotification);

module.exports = router;
