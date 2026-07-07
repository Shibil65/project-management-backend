const { getIsConnected } = require('../../config/db');
const getTenantModel = require('../../utils/tenantDb');
const { fallbackProjects } = require('../../utils/fallbackStore');

async function updateProject(req, res) {
  const companyId = req.user.companyId;
  const projectId = req.params.id;
    const {
    name, desc, status, clientEmail,
    budget, startDate, endDate, currentPhase,
    deployedUrl, leadId, invoices, paymentDetails,
    assignedStaff, milestones, comments, requirements, tasks
  } = req.body;

  if (getIsConnected()) {
    try {
      const ProjectModel = getTenantModel(companyId, 'Project');
      const updateData = {};
      if (name        !== undefined) updateData.name         = name;
      if (desc        !== undefined) updateData.desc         = desc;
      if (status      !== undefined) updateData.status       = status;
      if (clientEmail !== undefined) updateData.clientEmail  = clientEmail;
      if (budget      !== undefined) updateData.budget       = Number(budget) || 0;
      if (startDate   !== undefined) updateData.startDate    = startDate;
      if (endDate     !== undefined) updateData.endDate      = endDate;
      if (currentPhase !== undefined) updateData.currentPhase = currentPhase;
      if (deployedUrl !== undefined) updateData.deployedUrl  = deployedUrl;
      if (leadId      !== undefined) updateData.leadId       = leadId;
      if (invoices    !== undefined) updateData.invoices     = invoices;
      if (paymentDetails !== undefined) updateData.paymentDetails = paymentDetails;
      if (assignedStaff !== undefined) updateData.assignedStaff = assignedStaff;
      if (milestones    !== undefined) updateData.milestones    = milestones;
      if (comments      !== undefined) updateData.comments      = comments;
      if (requirements  !== undefined) updateData.requirements  = requirements;
      if (tasks         !== undefined) updateData.tasks         = tasks;

      const updated = await ProjectModel.findOneAndUpdate(
        { _id: projectId, companyId },
        { $set: updateData },
        { new: true }
      );
      if (!updated) {
        return res.status(404).json({ success: false, message: 'Project not found.' });
      }
      return res.status(200).json({ success: true, data: updated });
    } catch (err) {
      console.error('[updateProject] Error:', err);
      return res.status(500).json({ success: false, message: 'Database error updating project.' });
    }
  } else {
    const index = fallbackProjects.findIndex(
      p => (p._id === projectId || p.id === projectId) && p.companyId === companyId
    );
    if (index === -1) {
      return res.status(404).json({ success: false, message: 'Project not found in fallback.' });
    }
    const existing = fallbackProjects[index];
    fallbackProjects[index] = {
      ...existing,
      name:         name         !== undefined ? name         : existing.name,
      desc:         desc         !== undefined ? desc         : existing.desc,
      status:       status       !== undefined ? status       : existing.status,
      clientEmail:  clientEmail  !== undefined ? clientEmail  : existing.clientEmail,
      budget:       budget       !== undefined ? Number(budget) || 0 : existing.budget,
      startDate:    startDate    !== undefined ? startDate    : existing.startDate,
      endDate:      endDate      !== undefined ? endDate      : existing.endDate,
      currentPhase: currentPhase !== undefined ? currentPhase : existing.currentPhase,
      deployedUrl:  deployedUrl  !== undefined ? deployedUrl  : existing.deployedUrl,
      leadId:       leadId       !== undefined ? leadId       : existing.leadId,
      invoices:     invoices     !== undefined ? invoices     : existing.invoices,
      paymentDetails: paymentDetails !== undefined ? paymentDetails : existing.paymentDetails,
      assignedStaff: assignedStaff !== undefined ? assignedStaff : existing.assignedStaff,
      milestones:   milestones   !== undefined ? milestones   : existing.milestones,
      comments:     comments     !== undefined ? comments     : existing.comments,
      requirements: requirements !== undefined ? requirements : existing.requirements,
      tasks:        tasks        !== undefined ? tasks        : existing.tasks,
    };
    return res.status(200).json({ success: true, data: fallbackProjects[index] });
  }
}

module.exports = { updateProject };
