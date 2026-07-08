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
const JWT_SECRET = process.env.JWT_SECRET || "syncra_secret_key_123";
const { validatePassword } = require("../../utils/passwordPolicy");

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

async function changePassword(req, res) {
  const {
    oldPassword,
    newPassword
  } = req.body;
  const {
    userId,
    companyId,
    email
  } = req.user;
  if (!oldPassword || !newPassword) {
    return res.status(400).json({ success: false, message: "Current password and new password are required." });
  }

  const passwordValidation = validatePassword(newPassword);
  if (!passwordValidation.valid) {
    return res.status(400).json({ success: false, message: passwordValidation.message });
  }
  try {
    const sysUser = getIsConnected() ? await User.findById(userId) : resolveFallbackUser(userId, email);
    if (!sysUser) return res.status(404).json({
      success: false,
      message: "User not found."
    });
    const match = await bcrypt.compare(oldPassword, sysUser.password || "");
    if (!match) return res.status(401).json({
      success: false,
      message: "Current password is incorrect."
    });
    const hashed = await bcrypt.hash(newPassword, 10);
    if (getIsConnected()) {
      await User.findByIdAndUpdate(userId, {
        password: hashed,
        mustChangePassword: false
      });
      const UserModel = getTenantModel(companyId, "User");
      const {
        employeeUser
      } = await resolveEmployeeUser(companyId, userId, email, UserModel);
      if (employeeUser) {
        await UserModel.findByIdAndUpdate(employeeUser._id, {
          password: hashed,
          mustChangePassword: false
        });
      }
    } else {
      const fbUser = resolveFallbackUser(userId, email);
      if (fbUser) {
        fbUser.password = hashed;
        fbUser.mustChangePassword = false;
      }
    }
    return res.status(200).json({
      success: true,
      message: "Password updated successfully."
    });
  } catch (err) {
    console.error("[changePassword] Error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to update password."
    });
  }
}

module.exports = { changePassword };

