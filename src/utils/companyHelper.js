const Company = require("../models/Company");
const User = require("../models/User");
const { getIsConnected } = require("../config/db");
const { fallbackCompanies, fallbackUsers } = require("./fallbackStore");

async function updateCompanyEmployeeCount(companyId) {
  if (!companyId) return;
  if (getIsConnected()) {
    try {
      const count = await User.countDocuments({ companyId: companyId });
      await Company.findByIdAndUpdate(companyId, { users: count });
      console.log(`[updateCompanyEmployeeCount] Updated company ${companyId} users count to ${count}`);
    } catch (err) {
      console.error(`[updateCompanyEmployeeCount] Error updating count for company ${companyId}:`, err);
    }
  } else {
    const compIdStr = String(companyId);
    const count = fallbackUsers.filter(u => String(u.companyId) === compIdStr).length;
    const company = fallbackCompanies.find(c => String(c.id || c._id) === compIdStr);
    if (company) {
      company.users = count;
      console.log(`[updateCompanyEmployeeCount] (Fallback) Updated company ${companyId} users count to ${count}`);
    }
  }
}

module.exports = {
  updateCompanyEmployeeCount
};
