const {
  getIsConnected
} = require("../../config/db");
const Company = require("../../models/Company");
const getTenantModel = require("../../utils/tenantDb");
const {
  fallbackProjects,
  fallbackCompanies
} = require("../../utils/fallbackStore");

async function getProjects(req, res) {
  const companyId = req.user.companyId;
  if (getIsConnected()) {
    try {
      const ProjectModel = getTenantModel(companyId, "Project");
      const list = await ProjectModel.find({
        companyId,
        isDeleted: {
          $ne: true
        }
      });
      return res.status(200).json({
        success: true,
        data: list
      });
    } catch (err) {
      console.error(err);
    }
  }
  const list = fallbackProjects.filter(p => p.companyId === companyId && !p.isDeleted);
  return res.status(200).json({
    success: true,
    data: list
  });
}

module.exports = { getProjects };

