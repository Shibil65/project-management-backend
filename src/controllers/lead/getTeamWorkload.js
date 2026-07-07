const {
  getIsConnected
} = require("../../config/db");
const getTenantModel = require("../../utils/tenantDb");
const {
  fallbackProjects,
  fallbackUsers,
  fallbackClients,
  fallbackTimesheets
} = require("../../utils/fallbackStore");
const { getTaskAssigneeEmails } = require("../../utils/taskAssignment");

function getEffectiveUser(req) {
  const user = {
    ...req.user
  };
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

async function getTeamWorkload(req, res) {
  const companyId = req.user.companyId;
  const user = getEffectiveUser(req);
  try {
    let employees = [];
    let projects = [];
    if (getIsConnected()) {
      const UserModel = getTenantModel(companyId, "User");
      const ProjectModel = getTenantModel(companyId, "Project");
      employees = await UserModel.find({
        companyId,
        role: "Employee",
        status: {
          $ne: "Deleted"
        }
      });
      projects = await ProjectModel.find({
        companyId,
        isDeleted: {
          $ne: true
        }
      });
    } else {
      employees = fallbackUsers.filter(u => u.companyId === companyId && u.role === "Employee");
      projects = fallbackProjects.filter(p => p.companyId === companyId && !p.isDeleted);
    }
    const myProjects = projects.filter(p => isProjectLead(p, user));
    const activeTasksMap = {};
    myProjects.forEach(p => {
      if (p.tasks) {
        p.tasks.forEach(t => {
          if (t.status !== "Done") {
            getTaskAssigneeEmails(t).forEach((email) => {
              activeTasksMap[email] = (activeTasksMap[email] || 0) + 1;
            });
          }
        });
      }
    });
    const list = employees.map(emp => {
      const email = emp.email.toLowerCase();
      return {
        _id: emp._id || emp.id,
        id: emp.id || emp._id,
        name: emp.name,
        email: emp.email,
        role: emp.role,
        domain: emp.domain || "Engineering",
        activeTasks: activeTasksMap[email] || 0
      };
    });
    return res.status(200).json({
      success: true,
      data: list
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Server error loading team roster."
    });
  }
}

module.exports = { getTeamWorkload };



