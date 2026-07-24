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

async function sendMessage(req, res) {
  const {
    receiver,
    text,
    imageUrl
  } = req.body;
  const {
    email,
    userId,
    companyId
  } = req.user;
  if (!receiver) {
    return res.status(400).json({
      success: false,
      message: "Receiver is required."
    });
  }
  try {
    let senderName = "Employee";
    let org = req.user.org;
    if (getIsConnected()) {
      const UserModel = getTenantModel(companyId, "User");
      const {
        employeeUser
      } = await resolveEmployeeUser(companyId, userId, email, UserModel);
      if (employeeUser) {
        senderName = employeeUser.name;
        org = employeeUser.org;
      }
      const MessageModel = getTenantModel(companyId, "Message");
      const newMsg = new MessageModel({
        sender: email,
        senderName,
        receiver,
        companyId,
        org,
        text: text || "",
        imageUrl: imageUrl || ""
      });
      await newMsg.save();
      return res.status(201).json({
        success: true,
        data: newMsg
      });
    } else {
      const fbUser = resolveFallbackUser(userId, email);
      if (fbUser) senderName = fbUser.name;
      const newMsg = {
        id: `fb_msg_${Date.now()}`,
        sender: email,
        senderName,
        receiver,
        companyId,
        org,
        text: text || "",
        imageUrl: imageUrl || "",
        createdAt: new Date()
      };
      fallbackMessages.push(newMsg);
      return res.status(201).json({
        success: true,
        data: newMsg
      });
    }
  } catch (err) {
    console.error("[sendMessage] Error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to send message."
    });
  }
}

module.exports = { sendMessage };

