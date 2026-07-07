const express = require('express');
const router = express.Router();
const companyController = require('../controllers/companyController');
const { validateRequiredFields } = require('../validators/requestValidator');
const authMiddleware = require('../middlewares/auth');
const { adminGuard, superAdminGuard } = require('../middlewares/roleGuard');

// ── Public routes (no auth required) ──────────────────────────────────────────
// Register a new company + create its admin user (sends OTP)
router.post(
    '/register',
    validateRequiredFields(['name', 'adminName', 'adminEmail']),
    companyController.registerCompany
);

// ── Admin-only company management routes ──────────────────────────────────────
router.get('/', authMiddleware, adminGuard, companyController.getCompanies);
router.post('/', authMiddleware, superAdminGuard, companyController.createCompany);
router.get('/trash', authMiddleware, superAdminGuard, companyController.getTrashCompanies);

// Select / upgrade plan for a company (requires Company Admin or Super Admin JWT)
router.post('/:id/plan', authMiddleware, adminGuard, companyController.selectPlan);

// Toggle active/inactive status
router.post('/:id/toggle', authMiddleware, superAdminGuard, companyController.toggleCompanyStatus);

// Soft-delete (moves to trash)
router.post('/:id/delete', authMiddleware, superAdminGuard, companyController.softDeleteCompany);

// Restore from trash
router.post('/:id/restore', authMiddleware, superAdminGuard, companyController.restoreCompany);

// Permanent delete
router.delete('/:id', authMiddleware, superAdminGuard, companyController.permanentDeleteCompany);

module.exports = router;
