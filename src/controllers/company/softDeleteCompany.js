const {
  getIsConnected
} = require("../../config/db");
const Company = require("../../models/Company");
const User = require("../../models/User");
const Employee = require("../../models/Employee");
const Payment = require("../../models/Payment");
const {
  fallbackCompanies,
  fallbackUsers,
  fallbackPayments
} = require("../../utils/fallbackStore");
const {
  sendWelcomeEmail
} = require("../../services/emailService");

async function softDeleteCompany(req, res) {
  const {
    id
  } = req.params;
  if (getIsConnected()) {
    try {
      const company = await Company.findById(id);
      if (!company) {
        return res.status(404).json({
          success: false,
          message: "Company not found."
        });
      }
      company.isDeleted = true;
      await company.save();

      // Cascade delete all users and employees belonging to this company in MongoDB
      const userDeleteResult = await User.deleteMany({ companyId: id }).setOptions({ bypassTenant: true });
      const employeeDeleteResult = await Employee.deleteMany({ companyId: id }).setOptions({ bypassTenant: true });
      console.log(`[softDeleteCompany] Soft deleted company "${company.name}" and removed ${userDeleteResult.deletedCount} associated users and ${employeeDeleteResult.deletedCount} employees.`);

      return res.status(200).json({
        success: true,
        message: "Company moved to Trash.",
        data: company
      });
    } catch (err) {
      console.error("Failed to soft-delete company in MongoDB:", err.message);
    }
  }
  const company = fallbackCompanies.find(c => c.id === id);
  if (company) {
    company.isDeleted = true;

    // Cascade delete users from fallback store
    let deletedFallbackCount = 0;
    for (let i = fallbackUsers.length - 1; i >= 0; i--) {
      if (fallbackUsers[i].companyId === id) {
        fallbackUsers.splice(i, 1);
        deletedFallbackCount++;
      }
    }
    console.log(`[softDeleteCompany] (Fallback) Soft deleted company "${company.name}" and removed ${deletedFallbackCount} associated users.`);

    return res.status(200).json({
      success: true,
      message: "Company moved to Trash.",
      data: company
    });
  }
  return res.status(404).json({
    success: false,
    message: "Company not found in datastore."
  });
}

module.exports = { softDeleteCompany };

