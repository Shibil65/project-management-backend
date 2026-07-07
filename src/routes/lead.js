const express = require('express');
const router = express.Router();
const leadController = require('../controllers/leadController');
const authMiddleware = require('../middlewares/auth');
const { leadGuard } = require('../middlewares/roleGuard');

// Protect all routes with auth and lead guards
router.use(authMiddleware);
router.use(leadGuard);

router.get('/dashboard', leadController.getDashboardData);
router.get('/projects', leadController.getMyProjects);
router.get('/projects/:id', leadController.getProjectDetail);
router.post('/projects/:id/tasks', leadController.createProjectTask);
router.put('/tasks/:id', leadController.updateProjectTask);
router.get('/team', leadController.getTeamWorkload);
router.get('/timesheets', leadController.getTimesheets);
router.put('/timesheets/:id/approve', leadController.approveTimesheet);
router.get('/reports/progress', leadController.getProgressReport);
router.get('/reports/budget', leadController.getBudgetReport);
router.get('/clients/:id', leadController.getClientDetail);

module.exports = router;
