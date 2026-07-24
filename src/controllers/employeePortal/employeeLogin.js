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

async function employeeLogin(req, res) {
  const {
    email,
    password
  } = req.body;
  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: "Email and password are required."
    });
  }
  const normalizedEmail = email.trim().toLowerCase();
  try {
    let user = null;
    if (getIsConnected()) {
      user = await User.findOne({
        email: normalizedEmail,
        role: { $in: ["Employee", "employee", "project_lead", "Project Lead"] }
      }).setOptions({ bypassTenant: true });

      if (!user) {
        user = await User.findOne({ email: normalizedEmail }).setOptions({ bypassTenant: true });
      }
    } else {
      user = fallbackUsers.find(u => u.email.toLowerCase() === normalizedEmail) || null;
    }
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "No employee account found with this email."
      });
    }
    if (user.status === "Suspended") {
      return res.status(403).json({
        success: false,
        message: "Your account has been suspended. Contact your company admin."
      });
    }
    const match = await bcrypt.compare(password, user.password || "");
    if (!match) {
      return res.status(401).json({
        success: false,
        message: "Incorrect password. Please try again."
      });
    }
    const token = jwt.sign({
      userId: user._id || user.id,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
      org: user.org
    }, JWT_SECRET, {
      expiresIn: "14d"
    });
    return res.status(200).json({
      success: true,
      token,
      role: user.role,
      companyId: user.companyId,
      org: user.org,
      name: user.name,
      employeeId: user._id || user.id,
      portalSetup: user.portalSetup || false
    });
  } catch (err) {
    console.error("[employeeLogin] Error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error during login."
    });
  }
}

module.exports = { employeeLogin };

