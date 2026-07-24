const express = require('express');
const router = express.Router();
const { 
  employeeLogin, 
  getMyProfile, 
  updateMyProfile, 
  changePassword, 
  getMyTasks, 
  updateTaskStatus,
  employeeRegister,
  markAttendance,
  getTodayAttendance,
  getMyProjects,
  getContacts,
  sendMessage,
  getMessagesThread,
  changeSecurityPin,
  updateProjectDeployedUrl,
  updateProjectComments,
  uploadProjectDocument,
  deleteProjectDocument,
  employeeForgotPassword,
  employeeResetPassword
} = require('../controllers/employeePortalController');
const authMiddleware = require('../middlewares/auth');

// Public
router.post('/login', employeeLogin);
router.post('/register', employeeRegister);
router.post('/forgot-password', employeeForgotPassword);
router.post('/reset-password', employeeResetPassword);

// Protected (Requires employee Bearer token)
router.get('/me', authMiddleware, getMyProfile);
router.put('/profile', authMiddleware, updateMyProfile);
router.put('/change-password', authMiddleware, changePassword);
router.get('/tasks', authMiddleware, getMyTasks);
router.put('/tasks/:projectId/:taskId', authMiddleware, updateTaskStatus);

// Attendance
router.post('/attendance/mark', authMiddleware, markAttendance);
router.get('/attendance/today', authMiddleware, getTodayAttendance);

// Projects (metadata list)
router.get('/projects', authMiddleware, getMyProjects);
router.put('/projects/:projectId/deploy', authMiddleware, updateProjectDeployedUrl);
router.put('/projects/:projectId/comments', authMiddleware, updateProjectComments);
router.post('/projects/:projectId/documents', authMiddleware, uploadProjectDocument);
router.delete('/projects/:projectId/documents/:docId', authMiddleware, deleteProjectDocument);

// Messaging
router.get('/messages/contacts', authMiddleware, getContacts);
router.get('/messages/thread/:contactEmail', authMiddleware, getMessagesThread);
router.post('/messages', authMiddleware, sendMessage);

// Security PIN
router.put('/security/pin', authMiddleware, changeSecurityPin);

module.exports = router;
