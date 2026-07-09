const service = require('../services/subscriptionPackage.service');
const asyncHandler = require('../utils/asyncHandler');

// 1. GET /api/super-admin/subscription-packages
const getAllPackages = asyncHandler(async (req, res) => {
  const list = await service.getAllPackages();
  res.status(200).json({ success: true, data: list });
});

// 2. POST /api/super-admin/subscription-packages
const createPackage = asyncHandler(async (req, res) => {
  const email = req.user?.email || 'Super Admin';
  const result = await service.createPackage(req.body, email);
  res.status(201).json({ success: true, data: result });
});

// 3. PUT /api/super-admin/subscription-packages/:id
const updatePackage = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const email = req.user?.email || 'Super Admin';
  const result = await service.updatePackage(id, req.body, email);
  res.status(200).json({ success: true, data: result });
});

// 4. DELETE /api/super-admin/subscription-packages/:id
const deletePackage = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await service.deletePackage(id);
  res.status(200).json({ success: true, message: 'Subscription package deleted successfully.' });
});

// 5. PATCH /api/super-admin/subscription-packages/:id/toggle-status
const togglePackageStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = await service.togglePackageStatus(id);
  res.status(200).json({ success: true, data: result });
});

// 6. PATCH /api/super-admin/subscription-packages/:id/mark-popular
const markPackagePopular = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = await service.markPackagePopular(id);
  res.status(200).json({ success: true, data: result });
});

module.exports = {
  getAllPackages,
  createPackage,
  updatePackage,
  deletePackage,
  togglePackageStatus,
  markPackagePopular
};
