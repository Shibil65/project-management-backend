const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/auth');
const { adminGuard } = require('../middlewares/roleGuard');
const {
  getAttendanceSettings,
  updateAttendanceSettings
} = require('../controllers/attendanceSettingsController');

router.use(authMiddleware);
router.use(adminGuard);

router.get('/attendance-settings', getAttendanceSettings);
router.patch('/attendance-settings', updateAttendanceSettings);

module.exports = router;
