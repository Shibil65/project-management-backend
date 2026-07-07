const express = require('express');
const router = express.Router();
const messageController = require('../controllers/messageController');
const { validateRequiredFields } = require('../validators/requestValidator');
const authMiddleware = require('../middlewares/auth');

router.get('/', authMiddleware, messageController.getMessages);
router.post('/', authMiddleware, validateRequiredFields(['sender', 'senderName']), messageController.createMessage);

module.exports = router;
