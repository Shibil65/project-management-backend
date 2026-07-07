const {
  getIsConnected
} = require("../../config/db");
const Company = require("../../models/Company");
const getTenantModel = require("../../utils/tenantDb");
const {
  fallbackProjects,
  fallbackCompanies
} = require("../../utils/fallbackStore");

async function getAllProjectsAdmin(req, res) {
  const role = req.user.role;
  if (role !== "Super Admin") {
    return res.status(403).json({
      success: false,
      message: "Forbidden. Access restricted to Super Admin."
    });
  }
  if (getIsConnected()) {
    try {
      const Project = require("../../models/Project");
      const allProjects = await Project.find({
        isDeleted: {
          $ne: true
        }
      }).setOptions({ bypassTenant: true });
      return res.status(200).json({
        success: true,
        data: allProjects
      });
    } catch (err) {
      console.error("Failed to get all projects in MongoDB:", err.message);
    }
  }
  return res.status(200).json({
    success: true,
    data: fallbackProjects.filter(p => !p.isDeleted)
  });
}

module.exports = { getAllProjectsAdmin };

