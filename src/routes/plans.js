const express = require('express');
const router = express.Router();
const planController = require('../controllers/planController');
const authMiddleware = require('../middlewares/auth');
const { superAdminGuard } = require('../middlewares/roleGuard');

router.get('/', planController.getPlans);
router.post('/', authMiddleware, superAdminGuard, planController.createPlan);
router.put('/:id', authMiddleware, superAdminGuard, planController.updatePlan);
router.delete('/:id', authMiddleware, superAdminGuard, planController.deletePlan);

module.exports = router;
