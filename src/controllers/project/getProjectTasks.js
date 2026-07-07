const {
  getIsConnected
} = require("../../config/db");
const Company = require("../../models/Company");
const getTenantModel = require("../../utils/tenantDb");
const {
  fallbackProjects,
  fallbackCompanies
} = require("../../utils/fallbackStore");

async function getProjectTasks(req, res) {
  const {
    id
  } = req.params;
  const companyId = req.user.companyId;
  if (getIsConnected()) {
    try {
      const ProjectModel = getTenantModel(companyId, "Project");
      const project = await ProjectModel.findOne({
        _id: id,
        companyId
      });
      if (!project) {
        return res.status(404).json({
          success: false,
          message: "Project not found."
        });
      }
      return res.status(200).json({
        success: true,
        data: project.tasks || []
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({
        success: false,
        message: "Internal server error."
      });
    }
  }
  const project = fallbackProjects.find(p => p.id === id && p.companyId === companyId);
  if (!project) {
    return res.status(404).json({
      success: false,
      message: "Project not found."
    });
  }
  return res.status(200).json({
    success: true,
    data: project.tasks || []
  });
}

module.exports = { getProjectTasks };

