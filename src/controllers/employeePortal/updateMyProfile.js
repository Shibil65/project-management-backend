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

async function updateMyProfile(req, res) {
  const {
    name,
    phone,
    bio,
    skills,
    avatarColor,
    location,
    domain,
    githubUsername
  } = req.body;
  const {
    userId,
    companyId,
    email
  } = req.user;
  try {
    const updates = {};
    if (name) updates.name = name;
    if (phone) updates.phone = phone;
    if (bio) updates.bio = bio;
    if (skills) updates.skills = Array.isArray(skills) ? skills : skills.split(",").map(s => s.trim());
    if (avatarColor) updates.avatarColor = avatarColor;
    if (location) updates.location = location;
    if (domain) updates.domain = domain;
    if (githubUsername !== undefined) updates.githubUsername = githubUsername;
    updates.portalSetup = true;
    if (getIsConnected()) {
      await User.findByIdAndUpdate(userId, {
        $set: updates
      });
      const UserModel = getTenantModel(companyId, "User");
      const {
        employeeUser
      } = await resolveEmployeeUser(companyId, userId, email, UserModel);
      const tenantId = employeeUser ? employeeUser._id : userId;
      const updated = await UserModel.findByIdAndUpdate(tenantId, {
        $set: updates
      }, {
        new: true
      }).select("-password");
      return res.status(200).json({
        success: true,
        data: updated
      });
    }
    const user = resolveFallbackUser(userId, email);
    if (user) {
      Object.assign(user, updates);
      return res.status(200).json({
        success: true,
        data: user
      });
    }
    return res.status(404).json({
      success: false,
      message: "Employee not found."
    });
  } catch (err) {
    console.error("[updateMyProfile] Error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to update profile."
    });
  }
}

module.exports = { updateMyProfile };

