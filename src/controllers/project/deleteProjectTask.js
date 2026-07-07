const { getIsConnected } = require('../../config/db');
const getTenantModel = require('../../utils/tenantDb');
const { fallbackProjects } = require('../../utils/fallbackStore');

async function deleteProjectTask(req, res) {
  const companyId = req.user.companyId;
  const { id: projectId, taskId } = req.params;

  if (getIsConnected()) {
    try {
      const ProjectModel = getTenantModel(companyId, 'Project');
      const project = await ProjectModel.findOne({ _id: projectId, companyId });
      if (!project) {
        return res.status(404).json({ success: false, message: 'Project not found.' });
      }

      project.tasks = project.tasks.filter(t => t.id !== taskId && String(t._id) !== taskId);

      await project.save();
      return res.status(200).json({ success: true, data: project.tasks });
    } catch (err) {
      console.error('[deleteProjectTask] Error:', err);
      return res.status(500).json({ success: false, message: 'Database error deleting task.' });
    }
  } else {
    const project = fallbackProjects.find(
      p => (p._id === projectId || p.id === projectId) && p.companyId === companyId
    );
    if (!project) return res.status(404).json({ success: false, message: 'Project not found.' });

    project.tasks = (project.tasks || []).filter(t => t.id !== taskId && t._id !== taskId);
    return res.status(200).json({ success: true, data: project.tasks });
  }
}

module.exports = { deleteProjectTask };
