const express = require('express');
const router = express.Router();
const leaveController = require('../controllers/leaveController');
const authMiddleware = require('../middlewares/auth');
const { leadGuard } = require('../middlewares/roleGuard');

router.get('/', authMiddleware, leaveController.getLeaves);
router.post('/', authMiddleware, leaveController.createLeaveRequest);
router.post('/:id/approve', authMiddleware, leadGuard, leaveController.approveLeave);
router.post('/:id/decline', authMiddleware, leadGuard, leaveController.declineLeave);

module.exports = router;
