const { getIsConnected } = require('../../config/db');
const getTenantModel = require('../../utils/tenantDb');
const { fallbackProjects, fallbackUsers } = require('../../utils/fallbackStore');
const {
  normalizeAssigneeEmail,
  normalizeAssigneeName,
  normalizeAssignees,
  syncAssignedStaff
} = require('../../utils/taskAssignment');

async function resolveAssigneeNames(companyId, assignees) {
  const normalized = normalizeAssignees(assignees);
  if (normalized.length === 0) return [];

  const emails = normalized.map((assignee) => assignee.email);
  const nameMap = new Map();

  if (getIsConnected()) {
    try {
      const UserModel = getTenantModel(companyId, 'User');
      const users = await UserModel.find({ email: { $in: emails } }).select('name email');
      users.forEach((user) => {
        nameMap.set(normalizeAssigneeEmail(user.email), normalizeAssigneeName(user.name));
      });
    } catch (err) {
      console.error('[updateProjectTask] Failed to query names:', err);
    }
  } else {
    fallbackUsers.forEach((user) => {
      const email = normalizeAssigneeEmail(user.email);
      if (emails.includes(email)) nameMap.set(email, normalizeAssigneeName(user.name));
    });
  }

  return normalized.map((assignee) => ({
    email: assignee.email,
    name: assignee.name || nameMap.get(assignee.email) || ''
  }));
}

async function applyAssigneeUpdate(task, companyId, assignees, assigneeEmail, assigneeName) {
  if (assignees === undefined && assigneeEmail === undefined && assigneeName === undefined) return;

  const nextAssignees = assignees !== undefined
    ? normalizeAssignees(assignees)
    : normalizeAssignees([], assigneeEmail, assigneeName);

  const resolvedAssignees = await resolveAssigneeNames(companyId, nextAssignees);
  const primaryAssignee = resolvedAssignees[0] || { email: '', name: '' };

  task.assignees = resolvedAssignees;
  task.assigneeEmail = primaryAssignee.email;
  task.assigneeName = primaryAssignee.name;
}

async function updateProjectTask(req, res) {
  const companyId = req.user.companyId;
  const { id: projectId, taskId } = req.params;
  const { title, assigneeEmail, assigneeName, assignees, status, note, deadline, priority } = req.body;

  if (getIsConnected()) {
    try {
      const ProjectModel = getTenantModel(companyId, 'Project');
      const project = await ProjectModel.findOne({ _id: projectId, companyId });
      if (!project) {
        return res.status(404).json({ success: false, message: 'Project not found.' });
      }
      const task = project.tasks.id(taskId) || project.tasks.find(t => t.id === taskId);
      if (!task) {
        return res.status(404).json({ success: false, message: 'Task not found.' });
      }

      if (title !== undefined) task.title = title.trim();
      await applyAssigneeUpdate(task, companyId, assignees, assigneeEmail, assigneeName);
      if (status !== undefined) task.status = status;
      if (note !== undefined) task.note = note;
      if (deadline !== undefined) task.deadline = deadline;
      if (priority !== undefined) task.priority = priority;
      syncAssignedStaff(project, task.assignees && task.assignees.length ? task.assignees : task.assigneeEmail);

      await project.save();
      return res.status(200).json({ success: true, data: project });
    } catch (err) {
      console.error('[updateProjectTask] Error:', err);
      return res.status(500).json({ success: false, message: 'Database error updating task.' });
    }
  }

  const project = fallbackProjects.find(
    p => (p._id === projectId || p.id === projectId) && p.companyId === companyId
  );
  if (!project) return res.status(404).json({ success: false, message: 'Project not found.' });
  const task = (project.tasks || []).find(t => (t.id === taskId || t._id === taskId));
  if (!task) return res.status(404).json({ success: false, message: 'Task not found.' });

  if (title !== undefined) task.title = title.trim();
  await applyAssigneeUpdate(task, companyId, assignees, assigneeEmail, assigneeName);
  if (status !== undefined) task.status = status;
  if (note !== undefined) task.note = note;
  if (deadline !== undefined) task.deadline = deadline;
  if (priority !== undefined) task.priority = priority;
  syncAssignedStaff(project, task.assignees && task.assignees.length ? task.assignees : task.assigneeEmail);

  return res.status(200).json({ success: true, data: project });
}

module.exports = { updateProjectTask };
