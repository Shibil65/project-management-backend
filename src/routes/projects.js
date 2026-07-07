const express = require('express');
const router = express.Router();
const projectController = require('../controllers/projectController');
const { validateRequiredFields } = require('../validators/requestValidator');
const authMiddleware = require('../middlewares/auth');
const { leadGuard } = require('../middlewares/roleGuard');

router.get('/', authMiddleware, projectController.getProjects);
router.get('/trash', authMiddleware, leadGuard, projectController.getTrashProjects);
router.get('/all', authMiddleware, leadGuard, projectController.getAllProjectsAdmin);
router.post('/', authMiddleware, leadGuard, validateRequiredFields(['name', 'clientEmail']), projectController.createProject);
router.post('/:id/delete', authMiddleware, leadGuard, projectController.softDeleteProject);
router.post('/:id/restore', authMiddleware, leadGuard, projectController.restoreProject);
router.delete('/:id', authMiddleware, leadGuard, projectController.permanentDeleteProject);
router.get('/share/:key', projectController.shareProjectGateway);
router.post('/share/:key/requirements', projectController.addClientRequirement);
router.get('/share/:key/messages', projectController.getClientMessages);
router.post('/share/:key/messages', projectController.sendClientMessage);

router.put('/:id/status', authMiddleware, leadGuard, projectController.updateProjectStatus);
router.put('/:id', authMiddleware, leadGuard, projectController.updateProject);
router.put('/:id/deploy', authMiddleware, leadGuard, projectController.updateProjectDeployedUrl);
router.put('/:id/tasks/:taskId', authMiddleware, leadGuard, projectController.updateProjectTask);
router.delete('/:id/tasks/:taskId', authMiddleware, leadGuard, projectController.deleteProjectTask);
router.get('/:id/tasks', authMiddleware, projectController.getProjectTasks);
router.post('/:id/tasks', authMiddleware, leadGuard, projectController.createProjectTask);
router.post('/:id/documents', authMiddleware, leadGuard, projectController.uploadProjectDocument);

module.exports = router;
