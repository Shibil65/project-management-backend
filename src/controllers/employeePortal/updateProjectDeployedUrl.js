const { getIsConnected } = require("../../config/db");
const getTenantModel = require("../../utils/tenantDb");
const { fallbackProjects } = require("../../utils/fallbackStore");
const { isEmailMatch } = require("../../utils/taskAssignment");

async function updateProjectDeployedUrl(req, res) {
  const { projectId } = req.params;
  const { deployedUrl } = req.body;
  const { email, companyId } = req.user;

  try {
    if (getIsConnected()) {
      const ProjectModel = getTenantModel(companyId, "Project");
      const project = await ProjectModel.findOne({
        _id: projectId,
        companyId
      });
      if (!project) return res.status(404).json({
        success: false,
        message: "Project not found."
      });

      // Verify that the employee is assigned to this project
      const isAssigned = project.assignedStaff?.some(staffEmail => isEmailMatch(staffEmail, email));
      if (!isAssigned) {
        return res.status(403).json({
          success: false,
          message: "You are not authorized to update this project's deployment link."
        });
      }

      project.deployedUrl = deployedUrl || "";
      await project.save();

      return res.status(200).json({
        success: true,
        message: "Deployment link updated successfully.",
        data: project
      });
    } else {
      const project = fallbackProjects.find(p => p.id === projectId && p.companyId === companyId);
      if (!project) return res.status(404).json({
        success: false,
        message: "Project not found."
      });

      const isAssigned = project.assignedStaff?.some(staffEmail => isEmailMatch(staffEmail, email));
      if (!isAssigned) {
        return res.status(403).json({
          success: false,
          message: "You are not authorized to update this project's deployment link."
        });
      }

      project.deployedUrl = deployedUrl || "";
      return res.status(200).json({
        success: true,
        message: "Deployment link updated successfully.",
        data: project
      });
    }
  } catch (err) {
    console.error("[updateProjectDeployedUrl] Error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to update project deployment link."
    });
  }
}

module.exports = { updateProjectDeployedUrl };
