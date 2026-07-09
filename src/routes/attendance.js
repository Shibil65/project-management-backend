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
const qrController = require('../controllers/attendanceQr.controller');

// Settings management (Company Admin)
router.get('/settings', authMiddleware, adminGuard, settingsController.getSettings);
router.patch('/settings', authMiddleware, adminGuard, settingsController.updateSettings);

// QR Session Generation (Company Admin)
router.post('/qr/session/start', authMiddleware, adminGuard, qrController.startSession);
router.patch('/qr/session/:sessionId/heartbeat', authMiddleware, adminGuard, qrController.heartbeat);
router.patch('/qr/session/:sessionId/close', authMiddleware, adminGuard, qrController.closeSession);

// QR Session Status (Both Admin and Employee can read status)
router.get('/qr/session/:sessionId/status', authMiddleware, qrController.getSessionStatus);

// Employee verify check-in / check-out
router.post('/qr/verify', authMiddleware, qrController.verifyToken);

module.exports = router;
