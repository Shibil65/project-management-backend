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

async function getBudgetReport(req, res) {
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
    const report = myProjects.map(p => {
      const budget = p.budget || p.paymentDetails?.total || 0;
      const paid = p.paymentDetails?.paid || 0;
      const outstanding = p.paymentDetails?.outstanding || budget - paid;
      return {
        projectId: p._id || p.id,
        projectName: p.name,
        budget,
        paid,
        outstanding
      };
    });
    return res.status(200).json({
      success: true,
      data: report
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Server error generating budget report."
    });
  }
}

module.exports = { getBudgetReport };

