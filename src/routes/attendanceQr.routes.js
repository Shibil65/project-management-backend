const express = require('express');
const router = express.Router();
const qrController = require('../controllers/attendanceQr.controller');
const authMiddleware = require('../middlewares/auth');
const { adminGuard } = require('../middlewares/roleGuard');

// POST /api/attendance/qr/session/start (Admin)
router.post('/session/start', authMiddleware, adminGuard, qrController.startSession);

// PATCH /api/attendance/qr/session/:sessionId/heartbeat (Admin)
router.patch('/session/:sessionId/heartbeat', authMiddleware, adminGuard, qrController.heartbeat);

// PATCH /api/attendance/qr/session/:sessionId/close (Admin)
router.patch('/session/:sessionId/close', authMiddleware, adminGuard, qrController.closeSession);

// GET /api/attendance/qr/session/:sessionId/status (Both Admin and Employee can read status)
router.get('/session/:sessionId/status', authMiddleware, qrController.getSessionStatus);

// POST /api/attendance/qr/verify (Employee check-in via QR)
router.post('/verify', authMiddleware, qrController.verifyToken);

module.exports = router;
