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

async function getContacts(req, res) {
  const {
    companyId,
    email
  } = req.user;
  try {
    let users = [];
    let clients = [];
    if (getIsConnected()) {
      const UserModel = getTenantModel(companyId, "User");
      const ClientModel = getTenantModel(companyId, "Client");
      const ProjectModel = getTenantModel(companyId, "Project");
      users = await UserModel.find({
        companyId,
        status: {
          $ne: "Suspended"
        }
      }).select("name email role avatarColor");
      clients = await ClientModel.find({
        companyId,
        status: {
          $ne: "Suspended"
        }
      }).select("name email status");
      const projectClients = await ProjectModel.find({
        companyId,
        clientEmail: {
          $exists: true,
          $ne: ""
        }
      }).select("clientName clientEmail name");
      projectClients.forEach(project => {
        if (!clients.some(client => client.email?.toLowerCase() === project.clientEmail?.toLowerCase())) {
          clients.push({
            name: project.clientName || `${project.name || "Project"} Client`,
            email: project.clientEmail
          });
        }
      });
    } else {
      users = fallbackUsers.filter(u => u.companyId === companyId && u.status !== "Suspended");
      clients = fallbackClients.filter(c => c.companyId === companyId && c.status !== "Suspended");
      fallbackProjects.filter(p => p.companyId === companyId && p.clientEmail).forEach(project => {
        if (!clients.some(client => client.email?.toLowerCase() === project.clientEmail?.toLowerCase())) {
          clients.push({
            name: project.clientName || `${project.name || "Project"} Client`,
            email: project.clientEmail
          });
        }
      });
    }
    const contacts = [...users.filter(u => u.email.toLowerCase() !== email.toLowerCase()).map(u => ({
      name: u.name,
      email: u.email,
      role: u.role,
      type: "Staff",
      avatarColor: u.avatarColor || "#6366f1"
    })), ...clients.map(c => ({
      name: c.name,
      email: c.email,
      role: "Client",
      type: "Client",
      avatarColor: "#10b981"
    }))];
    return res.status(200).json({
      success: true,
      data: contacts
    });
  } catch (err) {
    console.error("[getContacts] Error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch contacts."
    });
  }
}

module.exports = { getContacts };

