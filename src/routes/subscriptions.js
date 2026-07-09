const express = require('express');
const router = express.Router();
const controller = require('../controllers/subscriptionController');
const authMiddleware = require('../middlewares/auth');

router.post('/checkout', controller.checkout);
router.post('/confirm', controller.confirm);
router.get('/my-subscription', authMiddleware, controller.getMySubscription);

module.exports = router;
