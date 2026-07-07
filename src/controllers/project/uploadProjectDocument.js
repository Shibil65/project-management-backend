const { getIsConnected } = require("../../config/db");
const getTenantModel = require("../../utils/tenantDb");
const { fallbackProjects } = require("../../utils/fallbackStore");

async function uploadProjectDocument(req, res) {
  const { id } = req.params;
  const { name, fileData, size, category } = req.body;

  if (!name || !fileData) {
    return res.status(400).json({ success: false, message: "File name and content are required." });
  }

  const uploadedBy = req.user?.name || req.user?.email || "Admin";

  const newDoc = {
    name,
    url: fileData,
    category: category || "General",
    uploadedBy,
    uploadedAt: new Date(),
    size: size || "1.0 MB"
  };

  if (getIsConnected()) {
    try {
      const ProjectModel = getTenantModel(req.user.companyId, "Project");
      const project = await ProjectModel.findById(id);
      if (project) {
        project.documents.push(newDoc);
        await project.save();
        return res.status(200).json({ success: true, data: project });
      }
    } catch (err) {
      console.error(err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  // Fallback
  const project = fallbackProjects.find(p => p.id === id);
  if (project) {
    if (!project.documents) project.documents = [];
    project.documents.push(newDoc);
    return res.status(200).json({ success: true, data: project });
  }

  return res.status(404).json({ success: false, message: "Project not found." });
}

module.exports = { uploadProjectDocument };
