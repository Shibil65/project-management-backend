const {
  getIsConnected
} = require("../../config/db");
const Company = require("../../models/Company");
const getTenantModel = require("../../utils/tenantDb");
const {
  fallbackProjects,
  fallbackCompanies
} = require("../../utils/fallbackStore");

async function addClientRequirement(req, res) {
  const {
    key
  } = req.params;
  const {
    text,
    cost
  } = req.body;
  if (!text || typeof cost !== "number") {
    return res.status(400).json({
      success: false,
      message: "Requirement text and numeric cost are required."
    });
  }
  const requirementString = `${text} (Cost: $${cost})`;
  if (getIsConnected()) {
    try {
      const Project = require("../../models/Project");
      const project = await Project.findOne({
        clientAccessKey: key,
        isDeleted: {
          $ne: true
        }
      }).setOptions({ bypassTenant: true });
      if (project) {
        project.requirements.push(requirementString);
        if (!project.paymentDetails) {
          project.paymentDetails = {
            total: 0,
            paid: 0,
            outstanding: 0
          };
        }
        project.paymentDetails.total = (project.paymentDetails.total || 0) + cost;
        project.paymentDetails.outstanding = (project.paymentDetails.outstanding || 0) + cost;
        await project.save();
        const company = await Company.findById(project.companyId);
        const projectData = project.toObject ? project.toObject() : project;
        projectData.companyAdminEmail = company ? company.admin : "admin@company.com";
        return res.status(200).json({
          success: true,
          data: projectData
        });
      }
    } catch (err) {
      console.error(err);
      return res.status(500).json({
        success: false,
        message: "Internal server error."
      });
    }
  }
  const project = fallbackProjects.find(p => p.clientAccessKey === key && !p.isDeleted);
  if (project) {
    if (!project.requirements) project.requirements = [];
    project.requirements.push(requirementString);
    if (!project.paymentDetails) {
      project.paymentDetails = {
        total: 0,
        paid: 0,
        outstanding: 0
      };
    }
    project.paymentDetails.total = (project.paymentDetails.total || 0) + cost;
    project.paymentDetails.outstanding = (project.paymentDetails.outstanding || 0) + cost;
    const company = fallbackCompanies.find(c => c.id === project.companyId);
    const projectData = {
      ...project
    };
    projectData.companyAdminEmail = company ? company.admin : "admin@company.com";
    return res.status(200).json({
      success: true,
      data: projectData
    });
  }
  return res.status(404).json({
    success: false,
    message: "Project not found or link has expired."
  });
}

module.exports = { addClientRequirement };

