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

async function permanentDeleteCompany(req, res) {
  const {
    id
  } = req.params;
  if (getIsConnected()) {
    try {
      const company = await Company.findByIdAndDelete(id);
      if (!company) {
        return res.status(404).json({
          success: false,
          message: "Company not found."
        });
      }
      
      // Cascade delete all users and employees belonging to this company in MongoDB
      const deleteResult = await User.deleteMany({ companyId: id }).setOptions({ bypassTenant: true });
      const employeeDeleteResult = await Employee.deleteMany({ companyId: id }).setOptions({ bypassTenant: true });
      console.log(`[permanentDeleteCompany] Permanently deleted company "${company.name}" and removed ${deleteResult.deletedCount} associated users and ${employeeDeleteResult.deletedCount} employees.`);

      return res.status(200).json({
        success: true,
        message: "Company and all associated employee accounts permanently deleted."
      });
    } catch (err) {
      console.error("Failed to permanently delete company in MongoDB:", err.message);
      return res.status(500).json({ success: false, message: "Internal server error performing cascade deletion." });
    }
  }
  const index = fallbackCompanies.findIndex(c => c.id === id);
  if (index !== -1) {
    const compName = fallbackCompanies[index].name;
    fallbackCompanies.splice(index, 1);

    // Cascade delete users from the fallback store
    let deletedFallbackCount = 0;
    for (let i = fallbackUsers.length - 1; i >= 0; i--) {
      if (fallbackUsers[i].companyId === id) {
        fallbackUsers.splice(i, 1);
        deletedFallbackCount++;
      }
    }
    console.log(`[permanentDeleteCompany] (Fallback) Permanently deleted company "${compName}" and removed ${deletedFallbackCount} associated users.`);

    return res.status(200).json({
      success: true,
      message: "Company and all associated employee accounts permanently deleted."
    });
  }
  return res.status(404).json({
    success: false,
    message: "Company not found in datastore."
  });
}

module.exports = { permanentDeleteCompany };

