const { getIsConnected } = require("../../config/db");
const getTenantModel = require("../../utils/tenantDb");
const { fallbackProjects, fallbackUsers } = require("../../utils/fallbackStore");
const {
  normalizeAssigneeEmail,
  normalizeAssigneeName,
  normalizeAssignees,
  syncAssignedStaff
} = require("../../utils/taskAssignment");

function getEffectiveUser(req) {
  const user = { ...req.user };
  const overrideEmail = req.query.leadEmail || req.headers["x-lead-email"];
  if (overrideEmail && req.user.role === "Company Admin") {
    user.email = overrideEmail;
    user.role = "Project Lead";
  }
  return user;
}

function isProjectLead(project, user) {
  if (user.role === "Company Admin") return true;
  const email = user.email.toLowerCase();
  const userId = user.userId || "";
  const leadId = (project.leadId || "").toLowerCase();
  return leadId === email || leadId === userId || project.clientEmail && project.clientEmail.toLowerCase() === email;
}

async function resolveAssigneeNames(companyId, assignees) {
  const normalized = normalizeAssignees(assignees);
  if (normalized.length === 0) return [];

  const emails = normalized.map((assignee) => assignee.email);
  const nameMap = new Map();

  if (getIsConnected()) {
    try {
      const UserModel = getTenantModel(companyId, "User");
      const users = await UserModel.find({ email: { $in: emails } }).select("name email");
      users.forEach((user) => {
        nameMap.set(normalizeAssigneeEmail(user.email), normalizeAssigneeName(user.name));
      });
    } catch (err) {
      console.error("[lead createProjectTask] Failed to query assignee names:", err);
    }
  } else {
    fallbackUsers.forEach((user) => {
      const email = normalizeAssigneeEmail(user.email);
      if (emails.includes(email)) nameMap.set(email, normalizeAssigneeName(user.name));
    });
  }

  return normalized.map((assignee) => ({
    email: assignee.email,
    name: assignee.name || nameMap.get(assignee.email) || ""
  }));
}

async function createProjectTask(req, res) {
  const { id } = req.params;
  const { title, assigneeEmail, assigneeName, assignees, deadline, priority, note } = req.body;
  const companyId = req.user.companyId;
  const user = getEffectiveUser(req);

  if (!title || !title.trim()) {
    return res.status(400).json({ success: false, message: "Task title is required." });
  }

  try {
    const resolvedAssignees = await resolveAssigneeNames(
      companyId,
      normalizeAssignees(assignees, assigneeEmail, assigneeName)
    );
    const primaryAssignee = resolvedAssignees[0] || { email: "", name: "" };
    const newTask = {
      id: `task_${Math.random().toString(36).substring(2, 9)}`,
      title: title.trim(),
      assigneeEmail: primaryAssignee.email,
      assigneeName: primaryAssignee.name,
      assignees: resolvedAssignees,
      status: "Planning",
      priority: ["High", "Medium", "Low"].includes(priority) ? priority : "Medium",
      note: typeof note === "string" ? note : "",
      deadline: deadline || ""
    };

    if (getIsConnected()) {
      const ProjectModel = getTenantModel(companyId, "Project");
      const project = await ProjectModel.findOne({ _id: id, companyId, isDeleted: { $ne: true } });
      if (!project) {
        return res.status(404).json({ success: false, message: "Project not found." });
      }
      if (!isProjectLead(project, user)) {
        return res.status(403).json({ success: false, message: "Forbidden. You do not lead this project." });
      }
      if (!Array.isArray(project.tasks)) project.tasks = [];
      project.tasks.push(newTask);
      syncAssignedStaff(project, resolvedAssignees);
      await project.save();
      return res.status(201).json({ success: true, data: project.tasks[project.tasks.length - 1] });
    }

    const project = fallbackProjects.find(p => p.id === id && p.companyId === companyId && !p.isDeleted);
    if (!project) {
      return res.status(404).json({ success: false, message: "Project not found." });
    }
    if (!isProjectLead(project, user)) {
      return res.status(403).json({ success: false, message: "Forbidden. You do not lead this project." });
    }
    if (!project.tasks) project.tasks = [];
    project.tasks.push(newTask);
    syncAssignedStaff(project, resolvedAssignees);
    return res.status(201).json({ success: true, data: newTask });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error creating task." });
  }
}

module.exports = { createProjectTask };
