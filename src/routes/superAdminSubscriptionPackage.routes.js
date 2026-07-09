const express = require('express');
const router = express.Router();
const controller = require('../controllers/superAdminSubscriptionPackage.controller');
const authMiddleware = require('../middlewares/auth');
const { superAdminGuard } = require('../middlewares/roleGuard');
const { validateSubscriptionPackage } = require('../validators/subscriptionPackage.validator');

router.use(authMiddleware);
router.use(superAdminGuard);

router.get('/', controller.getAllPackages);
router.post('/', validateSubscriptionPackage, controller.createPackage);
router.put('/:id', validateSubscriptionPackage, controller.updatePackage);
router.delete('/:id', controller.deletePackage);
router.patch('/:id/toggle-status', controller.togglePackageStatus);
router.patch('/:id/mark-popular', controller.markPackagePopular);

module.exports = router;
