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

module.exports = router;
