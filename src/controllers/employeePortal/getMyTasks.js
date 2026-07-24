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
const { isEmailMatch, isTaskAssignedTo } = require("../../utils/taskAssignment");
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

async function getMyTasks(req, res) {
  const {
    email,
    companyId
  } = req.user;
  if (!email) {
    return res.status(400).json({
      success: false,
      message: "Invalid token payload (missing email)."
    });
  }
  try {
    let myTasks = [];
    if (getIsConnected()) {
      const ProjectModel = getTenantModel(companyId, "Project");
      const projects = await ProjectModel.find({
        companyId,
        isDeleted: {
          $ne: true
        }
      });
      for (const p of projects) {
        if (p.tasks && p.tasks.length > 0) {
          const assigned = p.tasks.filter(t => isTaskAssignedTo(t, email));
          assigned.forEach(t => {
            myTasks.push({
              taskId: t.id || t._id,
              taskTitle: t.title,
              projectId: p._id,
              projectName: p.name,
              status: t.status
            });
          });
        }
      }
    } else {
      const projects = fallbackProjects.filter(p => p.companyId === companyId && !p.isDeleted);
      for (const p of projects) {
        if (p.tasks && p.tasks.length > 0) {
          const assigned = p.tasks.filter(t => isTaskAssignedTo(t, email));
          assigned.forEach(t => {
            myTasks.push({
              taskId: t.id || t._id,
              taskTitle: t.title,
              projectId: p.id,
              projectName: p.name,
              status: t.status
            });
          });
        }
      }
    }
    return res.status(200).json({
      success: true,
      data: myTasks
    });
  } catch (err) {
    console.error("[getMyTasks] Error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch tasks."
    });
  }
}

module.exports = { getMyTasks };


