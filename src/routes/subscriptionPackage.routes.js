const express = require('express');
const router = express.Router();
const controller = require('../controllers/subscriptionPackage.controller');
const authMiddleware = require('../middlewares/auth');

router.get('/active', controller.getActivePackages);
router.post('/checkout', controller.checkout);
router.post('/confirm', controller.confirm);
router.get('/my-subscription', authMiddleware, controller.getMySubscription);

module.exports = router;
