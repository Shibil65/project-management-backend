const { getIsConnected } = require('../config/db');
const Company = require('../models/Company');
const getTenantModel = require('../utils/tenantDb');
const { fallbackProjects, fallbackCompanies, fallbackMessages } = require('../utils/fallbackStore');

// Helper to resolve project by token
async function findProjectByAccessKey(key) {
  if (getIsConnected()) {
    try {
      const Project = require('../models/Project');
      const project = await Project.findOne({ clientAccessKey: key, isDeleted: { $ne: true } }).setOptions({ bypassTenant: true });
      if (project) {
        const company = await Company.findById(project.companyId);
        return { 
          project, 
          companyId: project.companyId.toString(), 
          org: company ? company.name : project.org,
          companyAdminEmail: company ? company.admin : 'admin@company.com' 
        };
      }
    } catch (err) {
      console.error('[clientShareService] Error finding project:', err);
    }
  }
  const project = fallbackProjects.find(p => p.clientAccessKey === key && !p.isDeleted);
  if (project) {
    const company = fallbackCompanies.find(c => c.id === project.companyId);
    return { 
      project, 
      companyId: project.companyId, 
      org: project.org,
      companyAdminEmail: company ? company.admin : 'admin@company.com' 
    };
  }
  return null;
}

// Guarantee default milestones if empty
function ensureMilestones(project) {
  return project.milestones || [];
}

// Guarantee default invoices if empty
function ensureInvoices(project) {
  return project.invoices || [];
}

// Guarantee default rich documents if empty
function ensureDocuments(project) {
  return project.documents || [];
}

module.exports = {
  findProjectByAccessKey,
  ensureMilestones,
  ensureInvoices,
  ensureDocuments
};
