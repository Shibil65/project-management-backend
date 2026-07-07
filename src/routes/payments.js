const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const authMiddleware = require('../middlewares/auth');
const { adminGuard, superAdminGuard } = require('../middlewares/roleGuard');

router.get('/', authMiddleware, adminGuard, paymentController.getPayments);
router.post('/razorpay-order', paymentController.createRazorpayOrder);
router.post('/razorpay-verify', authMiddleware, paymentController.verifyRazorpayPayment);

module.exports = router;
