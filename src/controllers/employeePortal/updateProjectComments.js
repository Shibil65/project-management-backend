const { getIsConnected } = require("../../config/db");
const getTenantModel = require("../../utils/tenantDb");
const { fallbackProjects } = require("../../utils/fallbackStore");
const { isEmailMatch, isTaskAssignedTo } = require("../../utils/taskAssignment");

function isAuthorizedForProject(project, email) {
  const isStaff = project.assignedStaff?.some(staffEmail => isEmailMatch(staffEmail, email));
  const isTaskAssignee = project.tasks?.some(task => isTaskAssignedTo(task, email));
  return isStaff || isTaskAssignee;
}

async function updateProjectComments(req, res) {
  const { projectId } = req.params;
  const { comments } = req.body;
  const { email, companyId } = req.user;

  if (!comments || !Array.isArray(comments)) {
    return res.status(400).json({ success: false, message: "Comments array is required." });
  }

  try {
    if (getIsConnected()) {
      const ProjectModel = getTenantModel(companyId, "Project");
      const project = await ProjectModel.findOne({ _id: projectId, companyId });
      if (!project) return res.status(404).json({ success: false, message: "Project not found." });

      if (!isAuthorizedForProject(project, email)) {
        return res.status(403).json({ success: false, message: "You are not authorized to comment on this project." });
      }

      project.comments = comments;
      await project.save();
      return res.status(200).json({ success: true, message: "Comments updated.", data: project });
    } else {
      const project = fallbackProjects.find(p => p.id === projectId && p.companyId === companyId);
      if (!project) return res.status(404).json({ success: false, message: "Project not found." });

      if (!isAuthorizedForProject(project, email)) {
        return res.status(403).json({ success: false, message: "You are not authorized to comment on this project." });
      }

      project.comments = comments;
      return res.status(200).json({ success: true, message: "Comments updated.", data: project });
    }
  } catch (err) {
    console.error("[updateProjectComments] Error:", err);
    return res.status(500).json({ success: false, message: "Failed to update project comments." });
  }
}

module.exports = { updateProjectComments };
