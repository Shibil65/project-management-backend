const express = require('express');
const router = express.Router();
const crmLeadsController = require('../controllers/crmLeadsController');
const authMiddleware = require('../middlewares/auth');

// All CRM leads routes are restricted to authenticated company admins
router.use(authMiddleware);

// Project Leads CRM
router.get('/projects', crmLeadsController.getCRMProjectLeads);
router.post('/projects', crmLeadsController.createCRMProjectLead);
router.put('/projects/:id', crmLeadsController.updateCRMProjectLead);
router.delete('/projects/:id', crmLeadsController.deleteCRMProjectLead);

// Client Leads CRM
router.get('/clients', crmLeadsController.getCRMClientLeads);
router.post('/clients', crmLeadsController.createCRMClientLead);
router.put('/clients/:id', crmLeadsController.updateCRMClientLead);
router.delete('/clients/:id', crmLeadsController.deleteCRMClientLead);

module.exports = router;
