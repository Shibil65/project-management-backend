const {
  getIsConnected
} = require("../../config/db");
const Company = require("../../models/Company");
const getTenantModel = require("../../utils/tenantDb");
const {
  fallbackProjects,
  fallbackCompanies
} = require("../../utils/fallbackStore");

async function shareProjectGateway(req, res) {
  const {
    key
  } = req.params;
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
    }
  }
  const project = fallbackProjects.find(p => p.clientAccessKey === key && !p.isDeleted);
  if (project) {
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

module.exports = { shareProjectGateway };

