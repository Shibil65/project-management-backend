const { getIsConnected } = require("../../config/db");
const getTenantModel = require("../../utils/tenantDb");
const { fallbackProjects } = require("../../utils/fallbackStore");

async function updateProjectDeployedUrl(req, res) {
  const { id } = req.params;
  const { deployedUrl } = req.body;
  const { companyId } = req.user;

  try {
    if (getIsConnected()) {
      const ProjectModel = getTenantModel(companyId, "Project");
      const project = await ProjectModel.findOne({
        _id: id,
        companyId
      });
      if (!project) return res.status(404).json({
        success: false,
        message: "Project not found."
      });

      project.deployedUrl = deployedUrl || "";
      await project.save();

      return res.status(200).json({
        success: true,
        message: "Deployment link updated successfully.",
        data: project
      });
    } else {
      const project = fallbackProjects.find(p => p.id === id && p.companyId === companyId);
      if (!project) return res.status(404).json({
        success: false,
        message: "Project not found."
      });

      project.deployedUrl = deployedUrl || "";
      return res.status(200).json({
        success: true,
        message: "Deployment link updated successfully.",
        data: project
      });
    }
  } catch (err) {
    console.error("[updateProjectDeployedUrlAdmin] Error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to update project deployment link."
    });
  }
}

module.exports = { updateProjectDeployedUrl };
