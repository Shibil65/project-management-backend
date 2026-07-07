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

async function getTimesheets(req, res) {
  const companyId = req.user.companyId;
  const user = getEffectiveUser(req);
  try {
    let projects = [];
    let timesheets = [];
    if (getIsConnected()) {
      const ProjectModel = getTenantModel(companyId, "Project");
      const TimesheetModel = getTenantModel(companyId, "Timesheet");
      projects = await ProjectModel.find({
        companyId,
        isDeleted: {
          $ne: true
        }
      });
      timesheets = await TimesheetModel.find({});
    } else {
      projects = fallbackProjects.filter(p => p.companyId === companyId && !p.isDeleted);
      timesheets = fallbackTimesheets;
    }
    const myProjects = projects.filter(p => isProjectLead(p, user));
    const projectIds = myProjects.map(p => (p._id || p.id).toString());
    const myTimesheets = timesheets.filter(t => projectIds.includes(t.projectId.toString()));
    let enriched = [];
    if (getIsConnected()) {
      const UserModel = getTenantModel(companyId, "User");
      const users = await UserModel.find({
        companyId
      });
      enriched = myTimesheets.map(t => {
        const u = users.find(usr => (usr._id || usr.id).toString() === t.userId.toString());
        const p = myProjects.find(proj => (proj._id || proj.id).toString() === t.projectId.toString());
        const tObj = t.toObject ? t.toObject() : {
          ...t
        };
        tObj.userName = u ? u.name : "Unknown Employee";
        tObj.projectName = p ? p.name : "Unknown Project";
        return tObj;
      });
    } else {
      enriched = myTimesheets.map(t => {
        const u = fallbackUsers.find(usr => (usr.id || usr._id) === t.userId);
        const p = myProjects.find(proj => (proj.id || proj._id) === t.projectId);
        return {
          ...t,
          userName: u ? u.name : "Unknown Employee",
          projectName: p ? p.name : "Unknown Project"
        };
      });
    }
    return res.status(200).json({
      success: true,
      data: enriched
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Server error loading timesheets."
    });
  }
}

module.exports = { getTimesheets };

