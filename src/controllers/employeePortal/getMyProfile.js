const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const {
  getIsConnected
} = require("../../config/db");
const User = require("../../models/User");
const Company = require("../../models/Company");
const Plan = require("../../models/Plan");
const getTenantModel = require("../../utils/tenantDb");
const {
  resolveEmployeeUser
} = require("../../utils/employeeResolver");
const {
  fallbackUsers,
  fallbackProjects,
  fallbackCompanies,
  fallbackAttendance,
  fallbackClients,
  fallbackMessages,
  fallbackPlans
} = require("../../utils/fallbackStore");
const JWT_SECRET = process.env.JWT_SECRET || "duskra_secret_key_123";

function isSameCompany(left, right) {
  return String(left || "") === String(right || "");
}

function resolveFallbackUser(userId, email) {
  return fallbackUsers.find(u => (u._id || u.id) === userId) || email && fallbackUsers.find(u => u.email?.toLowerCase() === email.toLowerCase()) || null;
}

function calculateDurationHelper(checkInStr, checkOutStr) {
  try {
    const parseTime = timeStr => {
      const [time, modifier] = timeStr.split(" ");
      let [hours, minutes, seconds] = time.split(":").map(Number);
      if (modifier === "PM" && hours < 12) hours += 12;
      if (modifier === "AM" && hours === 12) hours = 0;
      return new Date(2000, 0, 1, hours, minutes, seconds || 0);
    };
    const inDate = parseTime(checkInStr);
    const outDate = parseTime(checkOutStr);
    const diffMs = outDate - inDate;
    if (diffMs <= 0) return "0h 0m";
    const diffMins = Math.floor(diffMs / 1000 / 60);
    const hrs = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    return `${hrs}h ${mins}m`;
  } catch {
    return "0h 0m";
  }
}

async function getMyProfile(req, res) {
  try {
    const {
      userId,
      companyId,
      email
    } = req.user;
    let user = null;
    if (getIsConnected()) {
      const UserModel = getTenantModel(companyId, "User");
      const {
        employeeUser,
        resolved
      } = await resolveEmployeeUser(companyId, userId, email, UserModel);
      if (!employeeUser) {
        const sysUser = await User.findById(userId);
        if (sysUser && sysUser.role === "Employee" && isSameCompany(sysUser.companyId, companyId)) {
          console.log(`[SELF-HEALING] Recreating missing tenant user for ${sysUser.email} in company_${companyId}`);
          const payload = sysUser.toObject();
          const tenantUser = new UserModel(payload);
          await tenantUser.save();
          user = await UserModel.findById(userId).select("-password");
        }
      } else {
        const obj = employeeUser.toObject ? employeeUser.toObject() : {
          ...employeeUser
        };
        delete obj.password;
        user = obj;
      }
    } else {
      user = resolveFallbackUser(userId, email);
    }
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Employee profile not found."
      });
    }
    return res.status(200).json({
      success: true,
      data: user
    });
  } catch (err) {
    console.error("[getMyProfile] Error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch profile."
    });
  }
}

module.exports = { getMyProfile };

