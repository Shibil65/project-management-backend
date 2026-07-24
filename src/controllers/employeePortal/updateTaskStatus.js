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

async function updateTaskStatus(req, res) {
  const {
    projectId,
    taskId
  } = req.params;
  const {
    status,
    note
  } = req.body;
  const {
    email,
    companyId
  } = req.user;
  if (status && !["Planning", "Dev", "QA", "Done"].includes(status)) {
    return res.status(400).json({
      success: false,
      message: "Valid status (Planning, Dev, QA, Done) is required."
    });
  }
  if (!status && note === undefined) {
    return res.status(400).json({
      success: false,
      message: "Either status or note is required."
    });
  }
  try {
    if (getIsConnected()) {
      const ProjectModel = getTenantModel(companyId, "Project");
      const project = await ProjectModel.findOne({
        _id: projectId,
        companyId
      });
      if (!project) return res.status(404).json({
        success: false,
        message: "Project not found."
      });
      const task = project.tasks.find(t => (t.id || t._id.toString()) === taskId);
      if (!task) return res.status(404).json({
        success: false,
        message: "Task not found."
      });
      if (!isTaskAssignedTo(task, email)) {
        return res.status(403).json({
          success: false,
          message: "You are not authorized to update this task."
        });
      }
      if (status) task.status = status;
      if (note !== undefined) task.note = note;
      await project.save();
      return res.status(200).json({
        success: true,
        message: "Task updated.",
        data: task
      });
    } else {
      const project = fallbackProjects.find(p => p.id === projectId && p.companyId === companyId);
      if (!project) return res.status(404).json({
        success: false,
        message: "Project not found."
      });
      const task = project.tasks.find(t => (t.id || t._id) === taskId);
      if (!task) return res.status(404).json({
        success: false,
        message: "Task not found."
      });
      if (!isTaskAssignedTo(task, email)) {
        return res.status(403).json({
          success: false,
          message: "You are not authorized to update this task."
        });
      }
      if (status) task.status = status;
      if (note !== undefined) task.note = note;
      return res.status(200).json({
        success: true,
        message: "Task updated.",
        data: task
      });
    }
  } catch (err) {
    console.error("[updateTaskStatus] Error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to update task."
    });
  }
}

module.exports = { updateTaskStatus };


