function normalizeAssigneeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function normalizeAssigneeName(name) {
  return typeof name === 'string' ? name.trim() : '';
}

function normalizeAssignees(assignees, fallbackEmail = '', fallbackName = '') {
  const source = Array.isArray(assignees) ? assignees : [];
  const entries = source.map((entry) => {
    if (typeof entry === 'string') {
      return { email: normalizeAssigneeEmail(entry), name: '' };
    }
    return {
      email: normalizeAssigneeEmail(entry?.email || entry?.assigneeEmail),
      name: normalizeAssigneeName(entry?.name || entry?.assigneeName),
    };
  });

  const fallback = normalizeAssigneeEmail(fallbackEmail);
  if (fallback) {
    entries.push({ email: fallback, name: normalizeAssigneeName(fallbackName) });
  }

  const seen = new Set();
  return entries.filter((entry) => {
    if (!entry.email || seen.has(entry.email)) return false;
    seen.add(entry.email);
    return true;
  });
}

function getTaskAssignees(task) {
  return normalizeAssignees(task?.assignees, task?.assigneeEmail, task?.assigneeName);
}

function getTaskAssigneeEmails(task) {
  return getTaskAssignees(task).map((assignee) => assignee.email);
}

function getTaskAssigneeNames(task) {
  return getTaskAssignees(task).map((assignee) => assignee.name || assignee.email);
}

function syncAssignedStaff(project, assigneesOrEmail) {
  const normalizedAssignees = normalizeAssignees(
    Array.isArray(assigneesOrEmail) ? assigneesOrEmail : [],
    Array.isArray(assigneesOrEmail) ? '' : assigneesOrEmail
  );
  if (normalizedAssignees.length === 0) return;

  if (!Array.isArray(project.assignedStaff)) {
    project.assignedStaff = [];
  }

  let changed = false;
  normalizedAssignees.forEach(({ email }) => {
    const alreadyAssigned = project.assignedStaff.some(
      (entry) => normalizeAssigneeEmail(entry) === email
    );

    if (!alreadyAssigned) {
      project.assignedStaff.push(email);
      changed = true;
    }
  });

  if (changed && typeof project.markModified === 'function') {
    project.markModified('assignedStaff');
  }
}

function isEmailMatch(left, right) {
  const normalizedLeft = normalizeAssigneeEmail(left);
  const normalizedRight = normalizeAssigneeEmail(right);
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
}

function isTaskAssignedTo(task, email) {
  const normalizedEmail = normalizeAssigneeEmail(email);
  if (!normalizedEmail) return false;
  return getTaskAssigneeEmails(task).some((assigneeEmail) => assigneeEmail === normalizedEmail);
}

module.exports = {
  normalizeAssigneeEmail,
  normalizeAssigneeName,
  normalizeAssignees,
  getTaskAssignees,
  getTaskAssigneeEmails,
  getTaskAssigneeNames,
  syncAssignedStaff,
  isEmailMatch,
  isTaskAssignedTo,
};
