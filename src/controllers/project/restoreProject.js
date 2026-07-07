const {
  getIsConnected
} = require("../../config/db");
const Company = require("../../models/Company");
const getTenantModel = require("../../utils/tenantDb");
const {
  fallbackProjects,
  fallbackCompanies
} = require("../../utils/fallbackStore");

async function restoreProject(req, res) {
  const {
    id
  } = req.params;
  const companyId = req.user.companyId;
  if (getIsConnected()) {
    try {
      const ProjectModel = getTenantModel(companyId, "Project");
      const project = await ProjectModel.findById(id);
      if (project) {
        project.isDeleted = false;
        await project.save();
        return res.status(200).json({
          success: true,
          data: project
        });
      }
    } catch (err) {
      console.error(err);
    }
  }
  const project = fallbackProjects.find(p => p.id === id);
  if (project) {
    project.isDeleted = false;
    return res.status(200).json({
      success: true,
      data: project
    });
  }
  return res.status(404).json({
    success: false,
    message: "Project not found."
  });
}

module.exports = { restoreProject };

