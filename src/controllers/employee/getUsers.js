const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const { getIsConnected } = require("../../config/db");
const User = require("../../models/User");
const Company = require("../../models/Company");
const getTenantModel = require("../../utils/tenantDb");
const { fallbackUsers, fallbackCompanies } = require("../../utils/fallbackStore");

async function getUsers(req, res) {
  const companyId = req.user.companyId;
  const role = req.user.role;
  
  if (getIsConnected()) {
    try {
      if (role === "Super Admin") {
        // Fetch all active (non-deleted) companies to filter users
        const activeCompanies = await Company.find({ isDeleted: { $ne: true } }).select("_id");
        const activeCompanyIds = activeCompanies
          .map(c => c._id)
          .filter(id => id && mongoose.Types.ObjectId.isValid(id));

        const queryConditions = [
          { companyId: { $exists: false } },
          { companyId: null }
        ];

        if (activeCompanyIds.length > 0) {
          queryConditions.push({ companyId: { $in: activeCompanyIds } });
        }

        const usersList = await User.find({
          $or: queryConditions
        }).setOptions({ bypassTenant: true });

        return res.status(200).json({
          success: true,
          data: usersList
        });
      } else {
        if (!companyId || !mongoose.Types.ObjectId.isValid(companyId)) {
          return res.status(200).json({
            success: true,
            data: []
          });
        }
        const UserModel = getTenantModel(companyId, "User");
        const usersList = await UserModel.find({
          companyId
        });
        return res.status(200).json({
          success: true,
          data: usersList
        });
      }
    } catch (err) {
      console.error("[getUsers] Error:", err);
      return res.status(500).json({ success: false, message: "Internal server error fetching users." });
    }
  }

  // Fallback store logic
  const fallbackFilter = u => {
    if (role === "Super Admin") {
      if (!u.companyId) return true; // Super Admins themselves
      const comp = fallbackCompanies.find(c => c.id === u.companyId);
      return comp && !comp.isDeleted;
    }
    return u.companyId === companyId;
  };
  
  return res.status(200).json({
    success: true,
    data: fallbackUsers.filter(fallbackFilter)
  });
}

module.exports = { getUsers };

