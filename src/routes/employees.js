const express = require('express');
const router = express.Router();
const employeeController = require('../controllers/employeeController');
const authMiddleware = require('../middlewares/auth');
const { adminGuard } = require('../middlewares/roleGuard');
const employeeReportController = require('../controllers/employeeReportController');
const attendanceController = require('../controllers/attendanceController');
const { changePassword } = require('../controllers/employeePortalController');

router.get('/employees', authMiddleware, adminGuard, employeeController.getEmployees);
router.post('/employees', authMiddleware, adminGuard, employeeController.createEmployee);
router.put('/employees/:id', authMiddleware, adminGuard, employeeController.updateEmployee);
router.delete('/employees/:id', authMiddleware, adminGuard, employeeController.deleteEmployee);
router.post('/employees/:id/resend-credentials', authMiddleware, adminGuard, employeeController.resendCredentials);
router.post('/employees/resend-invite/:employeeId', authMiddleware, adminGuard, (req, res, next) => {
  req.params.id = req.params.employeeId;
  next();
}, employeeController.resendCredentials);
router.post('/employees/change-password', authMiddleware, changePassword);
router.get('/project-leads', authMiddleware, adminGuard, employeeController.getProjectLeads);
router.post('/project-leads', authMiddleware, adminGuard, employeeController.createProjectLead);
router.get('/users', authMiddleware, adminGuard, employeeController.getUsers);
router.delete('/users/:id', authMiddleware, adminGuard, employeeController.deleteUser);
router.get('/employees/:employeeId/attendance/report', authMiddleware, employeeReportController.getAttendanceReport);
router.get('/employees/:employeeId/payment/report', authMiddleware, employeeReportController.getPaymentReport);
router.post('/employees/invite', authMiddleware, adminGuard, employeeController.inviteEmployee);
router.post('/attendance/admin/mark', authMiddleware, adminGuard, attendanceController.adminMarkAttendance);

module.exports = router;
