const express = require('express');
const router = express.Router();
const clientController = require('../controllers/clientController');
const { validateRequiredFields } = require('../validators/requestValidator');
const authMiddleware = require('../middlewares/auth');

router.get('/', authMiddleware, clientController.getClients);
router.get('/trash', authMiddleware, clientController.getTrashClients);
router.post('/', authMiddleware, validateRequiredFields(['name', 'email']), clientController.createClient);
router.post('/:id/delete', authMiddleware, clientController.softDeleteClient);
router.post('/:id/restore', authMiddleware, clientController.restoreClient);
router.delete('/:id', authMiddleware, clientController.permanentDeleteClient);

module.exports = router;
