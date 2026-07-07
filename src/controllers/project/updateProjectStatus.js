const {
  getIsConnected
} = require("../../config/db");
const Company = require("../../models/Company");
const getTenantModel = require("../../utils/tenantDb");
const {
  fallbackProjects,
  fallbackCompanies
} = require("../../utils/fallbackStore");

async function updateProjectStatus(req, res) {
  const {
    id
  } = req.params;
  const {
    status
  } = req.body;
  const validStatuses = ["Pending", "In Progress", "On Hold", "Completed", "Cancelled", "Planning", "Dev", "QA", "Quality Assurance", "Active"];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({
      success: false,
      message: "Invalid status value."
    });
  }
  if (getIsConnected()) {
    try {
      const ProjectModel = getTenantModel(req.user.companyId, "Project");
      const project = await ProjectModel.findById(id);
      if (project) {
        project.status = status;
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
    project.status = status;
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

module.exports = { updateProjectStatus };

