const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { validateRequiredFields } = require('../validators/requestValidator');

router.post('/send-otp', validateRequiredFields(['email']), authController.sendOtp);
router.post('/verify-otp', validateRequiredFields(['email', 'otp']), authController.verifyOtp);

module.exports = router;
