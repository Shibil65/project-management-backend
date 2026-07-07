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
const { getTaskAssigneeNames } = require("../../utils/taskAssignment");

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

async function getDashboardData(req, res) {
  const companyId = req.user.companyId;
  const user = getEffectiveUser(req);
  try {
    let projects = [];
    if (getIsConnected()) {
      const ProjectModel = getTenantModel(companyId, "Project");
      projects = await ProjectModel.find({
        companyId,
        isDeleted: {
          $ne: true
        }
      });
    } else {
      projects = fallbackProjects.filter(p => p.companyId === companyId && !p.isDeleted);
    }
    const myProjects = projects.filter(p => isProjectLead(p, user));
    const activeProjects = myProjects.filter(p => p.status === "Active");
    let overdueTasksCount = 0;
    const workloadMap = {};
    myProjects.forEach(p => {
      if (p.tasks) {
        p.tasks.forEach(t => {
          if (t.status !== "Done") {
            overdueTasksCount++;
            const names = getTaskAssigneeNames(t);
            const workloadNames = names.length ? names : ["Unassigned"];
            workloadNames.forEach((name) => {
              workloadMap[name] = (workloadMap[name] || 0) + 1;
            });
          }
        });
      }
    });
    const teamWorkload = Object.keys(workloadMap).map(name => ({
      name,
      activeTasks: workloadMap[name]
    }));
    return res.status(200).json({
      success: true,
      data: {
        activeProjectsCount: activeProjects.length,
        overdueTasksCount,
        teamWorkload
      }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Server error loading dashboard."
    });
  }
}

module.exports = { getDashboardData };



