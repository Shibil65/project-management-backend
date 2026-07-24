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

async function getMessagesThread(req, res) {
  const {
    contactEmail
  } = req.params;
  const {
    email,
    companyId
  } = req.user;
  try {
    let messages = [];
    if (getIsConnected()) {
      const MessageModel = getTenantModel(companyId, "Message");
      if (contactEmail === "all") {
        messages = await MessageModel.find({
          companyId,
          receiver: "all"
        }).sort({
          createdAt: 1
        });
      } else {
        messages = await MessageModel.find({
          companyId,
          $or: [{
            sender: email,
            receiver: contactEmail
          }, {
            sender: contactEmail,
            receiver: email
          }]
        }).sort({
          createdAt: 1
        });
      }
    } else {
      if (contactEmail === "all") {
        messages = fallbackMessages.filter(m => m.companyId === companyId && m.receiver === "all");
      } else {
        messages = fallbackMessages.filter(m => m.companyId === companyId && (m.sender === email && m.receiver === contactEmail || m.sender === contactEmail && m.receiver === email));
      }
    }
    return res.status(200).json({
      success: true,
      data: messages
    });
  } catch (err) {
    console.error("[getMessagesThread] Error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch messages."
    });
  }
}

module.exports = { getMessagesThread };

