const mongoose = require('mongoose');
const { getIsConnected } = require('../config/db');
const getTenantModel = require('../utils/tenantDb');
const {
  fallbackCRMProjectLeads,
  fallbackCRMClientLeads,
  fallbackProjects,
  fallbackClients
} = require('../utils/fallbackStore');

function toCurrencyNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function toIsoDateString(value) {
  return value || new Date().toISOString().split('T')[0];
}

function buildInitialInvoice(budget, targetDate) {
  const amount = toCurrencyNumber(budget);
  return {
    invoiceId: `INV-${Date.now().toString().slice(-6)}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`,
    date: new Date().toISOString().split('T')[0],
    desc: 'Initial Project Contract Value',
    amount,
    status: 'Pending',
    dueDate: targetDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    paidDate: ''
  };
}

// ── CRM Project Leads ─────────────────────────────────────────────────────────

async function getCRMProjectLeads(req, res) {
  const companyId = req.user.companyId;
  if (getIsConnected()) {
    try {
      const CRMProjectLead = getTenantModel(companyId, 'CRMProjectLead');
      const list = await CRMProjectLead.find({ companyId });
      return res.status(200).json({ success: true, data: list });
    } catch (err) {
      console.error('[getCRMProjectLeads] Error:', err);
      return res.status(500).json({ success: false, message: 'Database error fetching CRM project leads.' });
    }
  } else {
    const list = fallbackCRMProjectLeads.filter(l => l.companyId === companyId);
    return res.status(200).json({ success: true, data: list });
  }
}

async function createCRMProjectLead(req, res) {
  const companyId = req.user.companyId;
  let org         = req.user.org || '';
  const { projectName, clientName, clientEmail, phone, budget, targetDate, status, currentPhase } = req.body;
  const cleanProjectName = (projectName || '').trim();
  const cleanClientName = (clientName || '').trim();
  const cleanClientEmail = (clientEmail || '').trim().toLowerCase();
  const cleanPhone = (phone || '').trim();
  const budgetValue = toCurrencyNumber(budget);
  const leadStatus = status || 'Prospect';
  const phase = currentPhase || 'Client Gave Idea';

  if (!cleanProjectName || !cleanClientEmail) {
    return res.status(400).json({ success: false, message: 'Project Name and Client Email are required.' });
  }

  // Safe resolution of org if empty (to avoid required validation failure in Mongoose)
  if (!org && getIsConnected()) {
    try {
      const CompanyModel = mongoose.model('Company');
      const comp = await CompanyModel.findById(companyId);
      if (comp) org = comp.name;
    } catch (e) {
      console.error('[createCRMProjectLead] Failed to fetch company org name:', e);
    }
  }
  if (!org) {
    org = 'My Agency'; // absolute fallback
  }

  let savedLead, savedProject, savedClientProfile, savedClientLead;

  if (getIsConnected()) {
    try {
      const CRMProjectLead = getTenantModel(companyId, 'CRMProjectLead');
      const newLead = new CRMProjectLead({
        projectName:   cleanProjectName,
        clientName:    cleanClientName,
        clientEmail:   cleanClientEmail,
        phone:         cleanPhone,
        budget:        budgetValue,
        targetDate:   targetDate   || '',
        status:       leadStatus,
        currentPhase: phase,
        companyId
      });
      savedLead = await newLead.save();

      // ── Auto-create Project + Client Payments (Invoice) ────────────────
      try {
        const ProjectModel = getTenantModel(companyId, 'Project');
        const clientAccessKey = `access_${Math.random().toString(36).substring(2, 10)}`;
        const defaultInvoice = buildInitialInvoice(budgetValue, targetDate);

        savedProject = new ProjectModel({
          name:         cleanProjectName,
          desc:         '',
          companyId,
          org,
          clientEmail:  cleanClientEmail,
          status:       'Planning',
          currentPhase: phase,
          clientAccessKey,
          isDeleted:    false,
          budget:       budgetValue,
          startDate:    '',
          endDate:      targetDate || '',
          leadId:       String(savedLead._id),
          invoices:     [defaultInvoice],
          paymentDetails: {
            total:       budgetValue,
            paid:        0,
            outstanding: budgetValue
          }
        });
        savedProject = await savedProject.save();
        // Write back projectId to the lead
        savedLead.projectId = String(savedProject._id);
        await savedLead.save();
      } catch (projErr) {
        console.error('[createCRMProjectLead] Auto-project creation failed:', projErr);
        await CRMProjectLead.deleteOne({ _id: savedLead._id });
        return res.status(400).json({ success: false, message: `Auto-project creation failed: ${projErr.message}` });
      }

      // ── Auto-create Client Profile ─────────────────────────────────────
      try {
        const ClientModel = getTenantModel(companyId, 'Client');
        const existingProfile = await ClientModel.findOne({ email: cleanClientEmail, companyId });
        if (existingProfile) {
          if (cleanClientName && existingProfile.name !== cleanClientName) existingProfile.name = cleanClientName;
          existingProfile.status = 'Active';
          existingProfile.isDeleted = false;
          savedClientProfile = await existingProfile.save();
        } else {
          savedClientProfile = await new ClientModel({
            name:      cleanClientName || cleanClientEmail,
            email:     cleanClientEmail,
            companyId,
            org,
            status:    'Active',
            isDeleted: false
          }).save();
        }
        if (savedProject && savedClientProfile) {
          savedProject.clientId = String(savedClientProfile._id);
          await savedProject.save();
        }
      } catch (cpErr) {
        console.error('[createCRMProjectLead] Auto client profile creation failed:', cpErr);
        const ProjectModel = getTenantModel(companyId, 'Project');
        if (savedProject) await ProjectModel.deleteOne({ _id: savedProject._id });
        await CRMProjectLead.deleteOne({ _id: savedLead._id });
        return res.status(400).json({ success: false, message: `Auto client profile creation failed: ${cpErr.message}` });
      }

      // ── Auto-create Client Lead ────────────────────────────────────────
      try {
        const CRMClientLead = getTenantModel(companyId, 'CRMClientLead');
        const existingClient = await CRMClientLead.findOne({ email: cleanClientEmail, companyId });
        if (existingClient) {
          existingClient.clientName = cleanClientName || cleanClientEmail;
          existingClient.phone = cleanPhone;
          existingClient.position = cleanProjectName;
          existingClient.targetDate = targetDate || '';
          existingClient.status = existingClient.status || 'New';
          savedClientLead = await existingClient.save();
        } else {
          savedClientLead = await new CRMClientLead({
            clientName: cleanClientName || cleanClientEmail,
            email:      cleanClientEmail,
            phone:      cleanPhone,
            position:   cleanProjectName,
            targetDate: targetDate || '',
            status:     'New',
            companyId
          }).save();
        }
      } catch (clErr) {
        console.error('[createCRMProjectLead] Auto client-lead creation failed:', clErr);
      }

      return res.status(201).json({
        success:   true,
        data:      savedLead,
        projectId: savedProject ? String(savedProject._id) : null,
        clientId:  savedClientProfile ? String(savedClientProfile._id) : null,
        clientLeadId: savedClientLead ? String(savedClientLead._id) : null
      });
    } catch (err) {
      console.error('[createCRMProjectLead] Error:', err);
      return res.status(500).json({ success: false, message: `Database error creating project lead: ${err.message}` });
    }
  } else {
    // ── Fallback (offline) ─────────────────────────────────────────────
    const newLead = {
      _id:          `crm_pl_${Date.now()}`,
      projectName:  cleanProjectName,
      clientName:   cleanClientName,
      clientEmail:  cleanClientEmail,
      phone:        cleanPhone,
      budget:       budgetValue,
      targetDate:   targetDate   || '',
      status:       leadStatus,
      currentPhase: phase,
      companyId
    };
    fallbackCRMProjectLeads.push(newLead);

    const clientAccessKey = `access_${Math.random().toString(36).substring(2, 10)}`;
    const defaultInvoice = buildInitialInvoice(budgetValue, targetDate);

    const newProject = {
      id:           `p_${Date.now()}`,
      name:         cleanProjectName,
      desc:         '',
      companyId,
      org,
      clientEmail:  cleanClientEmail,
      status:       'Planning',
      currentPhase: phase,
      clientAccessKey,
      isDeleted:    false,
      budget:       budgetValue,
      startDate:    '',
      endDate:      targetDate || '',
      leadId:       newLead._id,
      tasks:        [],
      invoices:     [defaultInvoice],
      paymentDetails: {
        total:       budgetValue,
        paid:        0,
        outstanding: budgetValue
      }
    };
    fallbackProjects.push(newProject);
    newLead.projectId = newProject.id;

    const existingProfile = fallbackClients.find(c => c.email === cleanClientEmail && c.companyId === companyId);
    if (!existingProfile) {
      const newClientProfile = {
        _id:       `c_${Date.now()}`,
        name:      cleanClientName || cleanClientEmail,
        email:     cleanClientEmail,
        companyId,
        org,
        status:    'Active',
        isDeleted: false
      };
      fallbackClients.push(newClientProfile);
      newProject.clientId = newClientProfile._id;
    } else {
      existingProfile.name = cleanClientName || existingProfile.name;
      existingProfile.status = 'Active';
      existingProfile.isDeleted = false;
      newProject.clientId = existingProfile._id || existingProfile.id;
    }

    const existingClient = fallbackCRMClientLeads.find(l => l.email === cleanClientEmail && l.companyId === companyId);
    if (!existingClient) {
      fallbackCRMClientLeads.push({
        _id:        `crm_cl_${Date.now()}`,
        clientName: cleanClientName || cleanClientEmail,
        email:      cleanClientEmail,
        phone:      cleanPhone,
        position:   cleanProjectName,
        targetDate: targetDate || '',
        status:     'New',
        companyId
      });
    } else {
      existingClient.clientName = cleanClientName || cleanClientEmail;
      existingClient.phone = cleanPhone;
      existingClient.position = cleanProjectName;
      existingClient.targetDate = targetDate || '';
    }

    return res.status(201).json({
      success:   true,
      data:      newLead,
      projectId: newProject.id,
      clientId:  newProject.clientId || null,
      clientLeadId: (existingClient || fallbackCRMClientLeads.find(l => l.email === cleanClientEmail && l.companyId === companyId))?._id || null
    });
  }
}


async function updateCRMProjectLead(req, res) {
  const companyId = req.user.companyId;
  const leadId = req.params.id;
  const { projectName, clientName, clientEmail, phone, budget, targetDate, status, currentPhase } = req.body;

  if (getIsConnected()) {
    try {
      const CRMProjectLead = getTenantModel(companyId, 'CRMProjectLead');
      const existingLead = await CRMProjectLead.findOne({ _id: leadId, companyId });
      const updatePayload = {
        projectName: projectName !== undefined ? String(projectName).trim() : undefined,
        clientName: clientName !== undefined ? String(clientName).trim() : undefined,
        clientEmail: clientEmail !== undefined ? String(clientEmail).trim().toLowerCase() : undefined,
        phone: phone !== undefined ? String(phone).trim() : undefined,
        budget: budget !== undefined ? toCurrencyNumber(budget) : undefined,
        targetDate,
        status,
        currentPhase
      };
      Object.keys(updatePayload).forEach((key) => {
        if (updatePayload[key] === undefined) delete updatePayload[key];
      });
      const updated = await CRMProjectLead.findOneAndUpdate(
        { _id: leadId, companyId },
        updatePayload,
        { new: true }
      );
      if (!updated) {
        return res.status(404).json({ success: false, message: 'CRM project lead not found.' });
      }

      // ── Propagate edits to the linked Project ──
      try {
        const ProjectModel = getTenantModel(companyId, 'Project');
        const project = await ProjectModel.findOne({ leadId: leadId, companyId });
        if (project) {
          if (projectName !== undefined) project.name = projectName;
          if (clientEmail !== undefined) project.clientEmail = clientEmail;
          if (budget !== undefined) {
            project.budget = Number(budget) || 0;
            const paid = project.paymentDetails?.paid || 0;
            project.paymentDetails = {
              total: Number(budget) || 0,
              paid: paid,
              outstanding: (Number(budget) || 0) - paid
            };
            const inv = (project.invoices || []).find(i => i.desc === 'Initial Project Contract Value');
            if (inv) {
              inv.amount = Number(budget) || 0;
            }
          }
          if (targetDate !== undefined) {
            project.endDate = targetDate;
            const inv = (project.invoices || []).find(i => i.desc === 'Initial Project Contract Value');
            if (inv) {
              inv.dueDate = targetDate;
            }
          }
          if (currentPhase !== undefined) {
            project.currentPhase = currentPhase;
          }
          await project.save();
        }
      } catch (projErr) {
        console.error('[updateCRMProjectLead] Project update propagation failed:', projErr);
      }

      // ── Propagate edits to Client profile if name/email changed ──
      try {
        const ClientModel = getTenantModel(companyId, 'Client');
        const client = await ClientModel.findOne({
          companyId,
          email: { $in: [existingLead?.clientEmail, updated.clientEmail].filter(Boolean) }
        });
        if (client) {
          if (clientName !== undefined) client.name = String(clientName).trim() || updated.clientEmail;
          if (clientEmail !== undefined) client.email = updated.clientEmail;
          await client.save();
        }
      } catch (clientErr) {
        console.error('[updateCRMProjectLead] Client update propagation failed:', clientErr);
      }

      // Propagate edits to Client Lead pipeline
      try {
        const CRMClientLead = getTenantModel(companyId, 'CRMClientLead');
        const clientLead = await CRMClientLead.findOne({
          companyId,
          email: { $in: [existingLead?.clientEmail, updated.clientEmail].filter(Boolean) }
        });
        if (clientLead) {
          clientLead.clientName = updated.clientName || updated.clientEmail;
          clientLead.email = updated.clientEmail;
          clientLead.phone = updated.phone || '';
          clientLead.position = updated.projectName;
          clientLead.targetDate = updated.targetDate || '';
          await clientLead.save();
        }
      } catch (clientLeadErr) {
        console.error('[updateCRMProjectLead] Client lead update propagation failed:', clientLeadErr);
      }

      return res.status(200).json({ success: true, data: updated });
    } catch (err) {
      console.error('[updateCRMProjectLead] Error:', err);
      return res.status(500).json({ success: false, message: 'Database error updating CRM project lead.' });
    }
  } else {
    const index = fallbackCRMProjectLeads.findIndex(l => (l._id === leadId || l.id === leadId) && l.companyId === companyId);
    if (index === -1) {
      return res.status(404).json({ success: false, message: 'CRM project lead not found in fallback.' });
    }
    const existing = fallbackCRMProjectLeads[index];
    const updated = {
      ...existing,
      projectName:  projectName  !== undefined ? projectName  : existing.projectName,
      clientName:   clientName   !== undefined ? clientName   : existing.clientName,
      clientEmail:  clientEmail  !== undefined ? clientEmail  : existing.clientEmail,
      phone:        phone        !== undefined ? phone        : existing.phone,
      budget:       budget       !== undefined ? Number(budget) || 0 : existing.budget,
      targetDate:   targetDate   !== undefined ? targetDate   : existing.targetDate,
      status:       status       !== undefined ? status       : existing.status,
      currentPhase: currentPhase !== undefined ? currentPhase : existing.currentPhase,
    };
    fallbackCRMProjectLeads[index] = updated;

    // Propagate fallback updates to Project
    const projIndex = fallbackProjects.findIndex(p => p.leadId === leadId && p.companyId === companyId);
    if (projIndex !== -1) {
      const proj = fallbackProjects[projIndex];
      proj.name = updated.projectName;
      proj.budget = updated.budget;
      proj.clientEmail = updated.clientEmail;
      proj.currentPhase = updated.currentPhase;
      proj.endDate = updated.targetDate;
      
      const inv = (proj.invoices || []).find(i => i.desc === 'Initial Project Contract Value');
      if (inv) {
        inv.amount = updated.budget;
        inv.dueDate = updated.targetDate;
      }
      proj.paymentDetails = {
        total: updated.budget,
        paid: proj.paymentDetails?.paid || 0,
        outstanding: updated.budget - (proj.paymentDetails?.paid || 0)
      };
    }

    // Propagate fallback updates to Client
    const clientProfile = fallbackClients.find(c =>
      c.companyId === companyId && (c.email === existing.clientEmail || c.email === updated.clientEmail)
    );
    if (clientProfile) {
      if (clientName !== undefined) clientProfile.name = String(clientName).trim() || updated.clientEmail;
      if (clientEmail !== undefined) clientProfile.email = updated.clientEmail;
    }

    // Propagate fallback updates to Client Lead
    const clientLead = fallbackCRMClientLeads.find(l =>
      l.companyId === companyId && (l.email === existing.clientEmail || l.email === updated.clientEmail)
    );
    if (clientLead) {
      clientLead.clientName = updated.clientName || updated.clientEmail;
      clientLead.email = updated.clientEmail;
      clientLead.phone = updated.phone || '';
      clientLead.position = updated.projectName;
      clientLead.targetDate = updated.targetDate || '';
    }

    return res.status(200).json({ success: true, data: updated });
  }
}


async function deleteCRMProjectLead(req, res) {
  const companyId = req.user.companyId;
  const leadId = req.params.id;

  if (getIsConnected()) {
    try {
      const CRMProjectLead = getTenantModel(companyId, 'CRMProjectLead');
      const deleted = await CRMProjectLead.findOneAndDelete({ _id: leadId, companyId });
      if (!deleted) {
        return res.status(404).json({ success: false, message: 'CRM project lead not found.' });
      }
      return res.status(200).json({ success: true, message: 'CRM project lead deleted successfully.' });
    } catch (err) {
      console.error('[deleteCRMProjectLead] Error:', err);
      return res.status(500).json({ success: false, message: 'Database error deleting CRM project lead.' });
    }
  } else {
    const index = fallbackCRMProjectLeads.findIndex(l => (l._id === leadId || l.id === leadId) && l.companyId === companyId);
    if (index === -1) {
      return res.status(404).json({ success: false, message: 'CRM project lead not found in fallback.' });
    }
    fallbackCRMProjectLeads.splice(index, 1);
    return res.status(200).json({ success: true, message: 'CRM project lead deleted successfully from fallback.' });
  }
}

// ── CRM Client Leads ──────────────────────────────────────────────────────────

async function getCRMClientLeads(req, res) {
  const companyId = req.user.companyId;
  if (getIsConnected()) {
    try {
      const CRMClientLead = getTenantModel(companyId, 'CRMClientLead');
      const list = await CRMClientLead.find({ companyId });
      return res.status(200).json({ success: true, data: list });
    } catch (err) {
      console.error('[getCRMClientLeads] Error:', err);
      return res.status(500).json({ success: false, message: 'Database error fetching CRM client leads.' });
    }
  } else {
    const list = fallbackCRMClientLeads.filter(l => l.companyId === companyId);
    return res.status(200).json({ success: true, data: list });
  }
}

async function createCRMClientLead(req, res) {
  const companyId = req.user.companyId;
  const { clientName, email, phone, position, targetDate, status } = req.body;

  if (!clientName || !email) {
    return res.status(400).json({ success: false, message: 'Client Name and Email are required.' });
  }

  if (getIsConnected()) {
    try {
      const CRMClientLead = getTenantModel(companyId, 'CRMClientLead');
      const newLead = new CRMClientLead({
        clientName,
        email,
        phone: phone || '',
        position: position || '',
        targetDate: targetDate || '',
        status: status || 'New',
        companyId
      });
      await newLead.save();
      return res.status(201).json({ success: true, data: newLead });
    } catch (err) {
      console.error('[createCRMClientLead] Error:', err);
      return res.status(500).json({ success: false, message: 'Database error creating CRM client lead.' });
    }
  } else {
    const newLead = {
      _id: `crm_cl_${Date.now()}`,
      clientName,
      email,
      phone: phone || '',
      position: position || '',
      targetDate: targetDate || '',
      status: status || 'New',
      companyId
    };
    fallbackCRMClientLeads.push(newLead);
    return res.status(201).json({ success: true, data: newLead });
  }
}

async function updateCRMClientLead(req, res) {
  const companyId = req.user.companyId;
  const leadId = req.params.id;
  const { clientName, email, phone, position, targetDate, status } = req.body;

  if (getIsConnected()) {
    try {
      const CRMClientLead = getTenantModel(companyId, 'CRMClientLead');
      const updated = await CRMClientLead.findOneAndUpdate(
        { _id: leadId, companyId },
        { clientName, email, phone, position, targetDate, status },
        { new: true }
      );
      if (!updated) {
        return res.status(404).json({ success: false, message: 'CRM client lead not found.' });
      }
      return res.status(200).json({ success: true, data: updated });
    } catch (err) {
      console.error('[updateCRMClientLead] Error:', err);
      return res.status(500).json({ success: false, message: 'Database error updating CRM client lead.' });
    }
  } else {
    const index = fallbackCRMClientLeads.findIndex(l => (l._id === leadId || l.id === leadId) && l.companyId === companyId);
    if (index === -1) {
      return res.status(404).json({ success: false, message: 'CRM client lead not found in fallback.' });
    }
    const updated = {
      ...fallbackCRMClientLeads[index],
      clientName: clientName !== undefined ? clientName : fallbackCRMClientLeads[index].clientName,
      email: email !== undefined ? email : fallbackCRMClientLeads[index].email,
      phone: phone !== undefined ? phone : fallbackCRMClientLeads[index].phone,
      position: position !== undefined ? position : fallbackCRMClientLeads[index].position,
      targetDate: targetDate !== undefined ? targetDate : fallbackCRMClientLeads[index].targetDate,
      status: status !== undefined ? status : fallbackCRMClientLeads[index].status
    };
    fallbackCRMClientLeads[index] = updated;
    return res.status(200).json({ success: true, data: updated });
  }
}

async function deleteCRMClientLead(req, res) {
  const companyId = req.user.companyId;
  const leadId = req.params.id;

  if (getIsConnected()) {
    try {
      const CRMClientLead = getTenantModel(companyId, 'CRMClientLead');
      const deleted = await CRMClientLead.findOneAndDelete({ _id: leadId, companyId });
      if (!deleted) {
        return res.status(404).json({ success: false, message: 'CRM client lead not found.' });
      }
      return res.status(200).json({ success: true, message: 'CRM client lead deleted successfully.' });
    } catch (err) {
      console.error('[deleteCRMClientLead] Error:', err);
      return res.status(500).json({ success: false, message: 'Database error deleting CRM client lead.' });
    }
  } else {
    const index = fallbackCRMClientLeads.findIndex(l => (l._id === leadId || l.id === leadId) && l.companyId === companyId);
    if (index === -1) {
      return res.status(404).json({ success: false, message: 'CRM client lead not found in fallback.' });
    }
    fallbackCRMClientLeads.splice(index, 1);
    return res.status(200).json({ success: true, message: 'CRM client lead deleted successfully from fallback.' });
  }
}

module.exports = {
  getCRMProjectLeads,
  createCRMProjectLead,
  updateCRMProjectLead,
  deleteCRMProjectLead,
  getCRMClientLeads,
  createCRMClientLead,
  updateCRMClientLead,
  deleteCRMClientLead
};
