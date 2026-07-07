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

async function getClientDetail(req, res) {
  const {
    id
  } = req.params;
  const companyId = req.user.companyId;
  const user = getEffectiveUser(req);
  try {
    let client = null;
    let projects = [];
    if (getIsConnected()) {
      const ClientModel = getTenantModel(companyId, "Client");
      const ProjectModel = getTenantModel(companyId, "Project");
      client = await ClientModel.findOne({
        _id: id,
        companyId,
        isDeleted: {
          $ne: true
        }
      });
      if (!client && id.includes("@")) {
        client = await ClientModel.findOne({
          email: id.toLowerCase(),
          companyId,
          isDeleted: {
            $ne: true
          }
        });
      }
      projects = await ProjectModel.find({
        companyId,
        isDeleted: {
          $ne: true
        }
      });
    } else {
      client = fallbackClients.find(c => (c.id === id || c.email.toLowerCase() === id.toLowerCase()) && c.companyId === companyId && !c.isDeleted);
      projects = fallbackProjects.filter(p => p.companyId === companyId && !p.isDeleted);
    }
    if (!client) {
      return res.status(404).json({
        success: false,
        message: "Client not found."
      });
    }
    const clientEmail = client.email.toLowerCase();
    const myProjects = projects.filter(p => isProjectLead(p, user) && p.clientEmail && p.clientEmail.toLowerCase() === clientEmail);
    const clientObj = client.toObject ? client.toObject() : {
      ...client
    };
    clientObj.linkedProjects = myProjects.map(p => ({
      id: p._id || p.id,
      name: p.name,
      status: p.status
    }));
    return res.status(200).json({
      success: true,
      data: clientObj
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Server error loading client details."
    });
  }
}

module.exports = { getClientDetail };

