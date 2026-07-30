const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendanceController');
const authMiddleware = require('../middlewares/auth');
const { adminGuard } = require('../middlewares/roleGuard');

router.get('/', authMiddleware, adminGuard, attendanceController.getAttendance);
router.post('/admin/mark', authMiddleware, adminGuard, attendanceController.adminMarkAttendance);
router.get('/log', authMiddleware, attendanceController.getAttendanceLog);
router.get('/log/:date', authMiddleware, attendanceController.getAttendanceDetailByDate);
router.get('/summary', authMiddleware, attendanceController.getAttendanceSummary);

// Admin actions for Pending Verification logs
router.post('/:id/approve', authMiddleware, adminGuard, attendanceController.approveAttendance);
router.post('/:id/reject', authMiddleware, adminGuard, attendanceController.rejectAttendance);

const settingsController = require('../controllers/attendanceSettings.controller');

// Settings management (Company Admin)
router.get('/settings', authMiddleware, adminGuard, settingsController.getSettings);
router.patch('/settings', authMiddleware, adminGuard, settingsController.updateSettings);

const gpsController = require('../controllers/gpsAttendance.controller');
const { verifyAppCheck } = require('../middlewares/appCheck.middleware');

// Available attendance methods (Employee/Admin)
router.get('/available-methods', authMiddleware, gpsController.getAvailableMethods);

// Employee GPS Check-In & Check-Out
router.post('/check-in/gps', authMiddleware, verifyAppCheck, gpsController.checkInGps);
router.post('/check-out/gps', authMiddleware, verifyAppCheck, gpsController.checkOutGps);

module.exports = router;
