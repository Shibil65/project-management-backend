const express = require('express');
const router = express.Router();
const clientShareController = require('../controllers/clientShareController');

router.get('/:token/dashboard', clientShareController.getDashboard);
router.get('/:token/billing', clientShareController.getBilling);
router.get('/:token/requirements', clientShareController.getRequirements);
router.post('/:token/requirements', clientShareController.createRequirement);
router.get('/:token/files', clientShareController.getFiles);
router.get('/:token/milestones', clientShareController.getMilestones);
router.get('/:token/messages', clientShareController.getMessages);
router.post('/:token/messages', clientShareController.createMessage);
router.get('/:token/activity', clientShareController.getActivity);
router.get('/:token/pending-actions', clientShareController.getPendingActions);

module.exports = router;
