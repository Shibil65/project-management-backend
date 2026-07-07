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
      console.error("[lead updateProjectTask] Failed to query assignee names:", err);
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

async function applyAssigneeUpdate(task, companyId, assignees, assigneeEmail, assigneeName) {
  if (assignees === undefined && assigneeEmail === undefined && assigneeName === undefined) return;

  const nextAssignees = assignees !== undefined
    ? normalizeAssignees(assignees)
    : normalizeAssignees([], assigneeEmail, assigneeName);

  const resolvedAssignees = await resolveAssigneeNames(companyId, nextAssignees);
  const primaryAssignee = resolvedAssignees[0] || { email: "", name: "" };

  task.assignees = resolvedAssignees;
  task.assigneeEmail = primaryAssignee.email;
  task.assigneeName = primaryAssignee.name;
}

async function updateProjectTask(req, res) {
  const { id } = req.params;
  const {
    projectId,
    status,
    note,
    assigneeEmail,
    assigneeName,
    assignees,
    title,
    deadline,
    priority
  } = req.body;
  const companyId = req.user.companyId;
  const user = getEffectiveUser(req);

  try {
    if (getIsConnected()) {
      const ProjectModel = getTenantModel(companyId, "Project");
      const project = await ProjectModel.findOne({ _id: projectId, companyId });
      if (!project) {
        return res.status(404).json({ success: false, message: "Project not found." });
      }
      if (!isProjectLead(project, user)) {
        return res.status(403).json({ success: false, message: "Forbidden. You do not lead this project." });
      }
      const task = project.tasks.find(t => (t.id || t._id.toString()) === id);
      if (!task) {
        return res.status(404).json({ success: false, message: "Task not found." });
      }
      if (status) task.status = status;
      if (note !== undefined) task.note = note;
      await applyAssigneeUpdate(task, companyId, assignees, assigneeEmail, assigneeName);
      if (title !== undefined) task.title = title.trim();
      if (deadline !== undefined) task.deadline = deadline;
      if (priority !== undefined) task.priority = priority;
      syncAssignedStaff(project, task.assignees && task.assignees.length ? task.assignees : task.assigneeEmail);
      await project.save();
      return res.status(200).json({ success: true, data: task });
    }

    const project = fallbackProjects.find(p => p.id === projectId && p.companyId === companyId);
    if (!project) {
      return res.status(404).json({ success: false, message: "Project not found." });
    }
    if (!isProjectLead(project, user)) {
      return res.status(403).json({ success: false, message: "Forbidden. You do not lead this project." });
    }
    const task = project.tasks.find(t => (t.id || t._id) === id);
    if (!task) {
      return res.status(404).json({ success: false, message: "Task not found." });
    }
    if (status) task.status = status;
    if (note !== undefined) task.note = note;
    await applyAssigneeUpdate(task, companyId, assignees, assigneeEmail, assigneeName);
    if (title !== undefined) task.title = title.trim();
    if (deadline !== undefined) task.deadline = deadline;
    if (priority !== undefined) task.priority = priority;
    syncAssignedStaff(project, task.assignees && task.assignees.length ? task.assignees : task.assigneeEmail);
    return res.status(200).json({ success: true, data: task });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error updating task." });
  }
}

module.exports = { updateProjectTask };
