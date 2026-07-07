const { getIsConnected } = require("../../config/db");
const getTenantModel = require("../../utils/tenantDb");
const { fallbackProjects } = require("../../utils/fallbackStore");
const { isEmailMatch, isTaskAssignedTo } = require("../../utils/taskAssignment");

function isAuthorizedForProject(project, email) {
  const isStaff = project.assignedStaff?.some(staffEmail => isEmailMatch(staffEmail, email));
  const isTaskAssignee = project.tasks?.some(task => isTaskAssignedTo(task, email));
  return isStaff || isTaskAssignee;
}

async function uploadProjectDocument(req, res) {
  const { projectId } = req.params;
  const { name, fileData, size, category } = req.body;
  const { email, name: userName, companyId } = req.user;

  if (!name || !fileData) {
    return res.status(400).json({ success: false, message: "File name and content are required." });
  }

  const uploadedBy = userName || email || "Employee";

  const newDoc = {
    name,
    url: fileData,
    category: category || "General",
    uploadedBy,
    uploadedAt: new Date(),
    size: size || "1.0 MB"
  };

  try {
    if (getIsConnected()) {
      const ProjectModel = getTenantModel(companyId, "Project");
      const project = await ProjectModel.findOne({ _id: projectId, companyId });
      if (!project) return res.status(404).json({ success: false, message: "Project not found." });

      if (!isAuthorizedForProject(project, email)) {
        return res.status(403).json({ success: false, message: "You are not authorized to upload documents for this project." });
      }

      project.documents.push(newDoc);
      await project.save();
      return res.status(200).json({ success: true, data: project });
    } else {
      const project = fallbackProjects.find(p => p.id === projectId && p.companyId === companyId);
      if (!project) return res.status(404).json({ success: false, message: "Project not found." });

      if (!isAuthorizedForProject(project, email)) {
        return res.status(403).json({ success: false, message: "You are not authorized to upload documents for this project." });
      }

      if (!project.documents) project.documents = [];
      project.documents.push(newDoc);
      return res.status(200).json({ success: true, data: project });
    }
  } catch (err) {
    console.error("[uploadProjectDocument] Error:", err);
    return res.status(500).json({ success: false, message: "Failed to upload document." });
  }
}

module.exports = { uploadProjectDocument };
