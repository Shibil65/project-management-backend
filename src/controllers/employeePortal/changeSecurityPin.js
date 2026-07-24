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

async function changeSecurityPin(req, res) {
  const {
    pin
  } = req.body;
  const {
    userId,
    companyId,
    email
  } = req.user;
  if (!pin || pin.length < 4 || pin.length > 6 || isNaN(Number(pin))) {
    return res.status(400).json({
      success: false,
      message: "Security PIN must be between 4 and 6 digits."
    });
  }
  try {
    const hashedPin = await bcrypt.hash(pin, 10);
    const pinUpdate = {
      securityPin: pin,
      attendancePin: hashedPin,
      hasAttendancePin: true
    };
    if (getIsConnected()) {
      await User.findByIdAndUpdate(userId, pinUpdate);
      const UserModel = getTenantModel(companyId, "User");
      const {
        employeeUser
      } = await resolveEmployeeUser(companyId, userId, email, UserModel);
      if (!employeeUser) {
        return res.status(404).json({
          success: false,
          message: "Employee not found in tenant database."
        });
      }
      const updated = await UserModel.findByIdAndUpdate(employeeUser._id, pinUpdate, {
        new: true
      }).select("-password");
      console.log(`[AUDIT] Security PIN updated for ${email} (companyId=${companyId})`);
      return res.status(200).json({
        success: true,
        message: "Security PIN updated successfully.",
        data: updated
      });
    }
    const fbUser = resolveFallbackUser(userId, email);
    if (fbUser) {
      Object.assign(fbUser, pinUpdate);
      return res.status(200).json({
        success: true,
        message: "Security PIN updated successfully.",
        data: fbUser
      });
    }
    return res.status(404).json({
      success: false,
      message: "Employee not found."
    });
  } catch (err) {
    console.error("[changeSecurityPin] Error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to update Security PIN."
    });
  }
}

module.exports = { changeSecurityPin };

