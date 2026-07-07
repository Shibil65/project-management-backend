const {
  getIsConnected
} = require("../../config/db");
const Company = require("../../models/Company");
const getTenantModel = require("../../utils/tenantDb");
const {
  fallbackProjects,
  fallbackCompanies
} = require("../../utils/fallbackStore");

async function permanentDeleteProject(req, res) {
  const {
    id
  } = req.params;
  const companyId = req.user.companyId;
  if (getIsConnected()) {
    try {
      const ProjectModel = getTenantModel(companyId, "Project");
      await ProjectModel.findByIdAndDelete(id);
      return res.status(200).json({
        success: true,
        message: "Project permanently deleted."
      });
    } catch (err) {
      console.error(err);
    }
  }
  const index = fallbackProjects.findIndex(p => p.id === id);
  if (index !== -1) {
    fallbackProjects.splice(index, 1);
    return res.status(200).json({
      success: true,
      message: "Project permanently deleted."
    });
  }
  return res.status(404).json({
    success: false,
    message: "Project not found."
  });
}

module.exports = { permanentDeleteProject };

