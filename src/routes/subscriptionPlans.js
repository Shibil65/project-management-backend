const express = require('express');
const controller = require('../controllers/subscriptionPlanController');
const authMiddleware = require('../middlewares/auth');
const { superAdminGuard } = require('../middlewares/roleGuard');

const publicRouter = express.Router();
publicRouter.get('/active', controller.getActivePlans);

const adminRouter = express.Router();
adminRouter.use(authMiddleware);
adminRouter.use(superAdminGuard);

adminRouter.get('/', controller.getAllPlans);
adminRouter.post('/', controller.createPlan);
adminRouter.put('/:id', controller.updatePlan);
adminRouter.delete('/:id', controller.deletePlan);
adminRouter.patch('/:id/toggle-status', controller.togglePlanStatus);
adminRouter.patch('/:id/mark-popular', controller.markPlanPopular);

module.exports = {
  publicRouter,
  adminRouter
};
