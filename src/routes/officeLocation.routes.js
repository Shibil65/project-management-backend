const express = require('express');
const router = express.Router();
const officeController = require('../controllers/officeLocation.controller');
const authMiddleware = require('../middlewares/auth');
const { adminGuard } = require('../middlewares/roleGuard');
const { verifyAppCheck } = require('../middlewares/appCheck.middleware');

// GET /api/company/office-locations (Admin)
router.get('/', authMiddleware, adminGuard, officeController.getOfficeLocations);

// POST /api/company/office-locations (Admin)
router.post('/', authMiddleware, adminGuard, officeController.createOfficeLocation);

// PATCH /api/company/office-locations/:officeId (Admin)
router.patch('/:officeId', authMiddleware, adminGuard, officeController.updateOfficeLocation);

// DELETE /api/company/office-locations/:officeId (Admin)
router.delete('/:officeId', authMiddleware, adminGuard, officeController.deleteOfficeLocation);

// POST /api/company/office-locations/:officeId/retry-radar-sync (Admin)
router.post('/:officeId/retry-radar-sync', authMiddleware, adminGuard, officeController.retryRadarSync);

// Mobile Location Setup Session Routes
// POST /api/company/office-locations/setup-session (Admin creates setup session)
router.post('/setup-session', authMiddleware, adminGuard, officeController.createSetupSession);

// GET /api/company/office-locations/setup-session/:token (Mobile or Desktop reads setup session)
router.get('/setup-session/:token', authMiddleware, officeController.getSetupSession);

// POST /api/company/office-locations/setup-session/:token/capture (Mobile app captures phone GPS)
router.post('/setup-session/:token/capture', authMiddleware, adminGuard, verifyAppCheck, officeController.captureMobileLocation);

// POST /api/company/office-locations/setup-session/:token/confirm (Admin confirms phone capture)
router.post('/setup-session/:token/confirm', authMiddleware, adminGuard, officeController.confirmMobileLocation);

module.exports = router;
