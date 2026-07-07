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

async function getProjectDetail(req, res) {
  const {
    id
  } = req.params;
  const companyId = req.user.companyId;
  const user = getEffectiveUser(req);
  try {
    let project = null;
    let client = null;
    if (getIsConnected()) {
      const ProjectModel = getTenantModel(companyId, "Project");
      const ClientModel = getTenantModel(companyId, "Client");
      project = await ProjectModel.findOne({
        _id: id,
        companyId,
        isDeleted: {
          $ne: true
        }
      });
      if (project) {
        if (project.clientId) {
          client = await ClientModel.findById(project.clientId);
        } else if (project.clientEmail) {
          client = await ClientModel.findOne({
            email: project.clientEmail
          });
        }
      }
    } else {
      project = fallbackProjects.find(p => p.id === id && p.companyId === companyId && !p.isDeleted);
      if (project) {
        client = fallbackClients.find(c => c.email === project.clientEmail);
      }
    }
    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found."
      });
    }
    if (!isProjectLead(project, user)) {
      return res.status(403).json({
        success: false,
        message: "Forbidden. You do not lead this project."
      });
    }
    const projectObj = project.toObject ? project.toObject() : {
      ...project
    };
    projectObj.clientDetails = client || null;
    return res.status(200).json({
      success: true,
      data: projectObj
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Server error loading project details."
    });
  }
}

module.exports = { getProjectDetail };

