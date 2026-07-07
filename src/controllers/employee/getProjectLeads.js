const bcrypt = require("bcryptjs");
const {
  getIsConnected
} = require("../../config/db");
const User = require("../../models/User");
const Company = require("../../models/Company");
const getTenantModel = require("../../utils/tenantDb");
const {
  fallbackUsers,
  fallbackCompanies
} = require("../../utils/fallbackStore");

async function getProjectLeads(req, res) {
  const companyId = req.user.companyId;
  if (getIsConnected()) {
    try {
      const UserModel = getTenantModel(companyId, "User");
      const list = await UserModel.find({
        companyId,
        role: {
          $in: ["Project Lead", "project_lead"]
        },
        status: {
          $ne: "Deleted"
        }
      });
      return res.status(200).json({
        success: true,
        data: list
      });
    } catch (err) {
      console.error(err);
    }
  }
  const list = fallbackUsers.filter(u => u.companyId === companyId && (u.role === "Project Lead" || u.role === "project_lead"));
  return res.status(200).json({
    success: true,
    data: list
  });
}

module.exports = { getProjectLeads };

