const { getIsConnected } = require('../config/db');
const Company = require('../models/Company');
const getTenantModel = require('../utils/tenantDb');
const { fallbackClients, fallbackCompanies } = require('../utils/fallbackStore');

async function getClients(req, res) {
  const companyId = req.user.companyId;

  if (getIsConnected()) {
    try {
      const ClientModel = getTenantModel(companyId, 'Client');
      const list = await ClientModel.find({ companyId, isDeleted: { $ne: true } });
      return res.status(200).json({ success: true, data: list });
    } catch (err) {
      console.error(err);
    }
  }
  const list = fallbackClients.filter(c => c.companyId === companyId && !c.isDeleted);
  return res.status(200).json({ success: true, data: list });
}

async function getTrashClients(req, res) {
  const companyId = req.user.companyId;

  if (getIsConnected()) {
    try {
      const ClientModel = getTenantModel(companyId, 'Client');
      const list = await ClientModel.find({ companyId, isDeleted: true });
      return res.status(200).json({ success: true, data: list });
    } catch (err) {
      console.error(err);
    }
  }
  const list = fallbackClients.filter(c => c.companyId === companyId && c.isDeleted);
  return res.status(200).json({ success: true, data: list });
}

async function createClient(req, res) {
  const { name, email } = req.body;
  const companyId = req.user.companyId;
  const org = req.user.org;

  if (!name || !email) {
    return res.status(400).json({ success: false, message: 'Name and email are required.' });
  }

  // Enforce Free plan limit: max 2 clients
  let plan = 'Free';
  if (getIsConnected()) {
    try {
      const company = await Company.findById(companyId);
      if (company) plan = company.plan;
    } catch (err) {
      console.error(err);
    }
  } else {
    const company = fallbackCompanies.find(c => c.id === companyId);
    if (company) plan = company.plan;
  }

  if (plan === 'Free') {
    let activeClientsCount = 0;
    const ClientModel = getTenantModel(companyId, 'Client');
    if (getIsConnected()) {
      try {
        activeClientsCount = await ClientModel.countDocuments({ companyId, isDeleted: { $ne: true } });
      } catch (err) {
        console.error(err);
      }
    } else {
      activeClientsCount = fallbackClients.filter(c => c.companyId === companyId && !c.isDeleted).length;
    }

    if (activeClientsCount >= 2) {
      return res.status(400).json({ 
        success: false, 
        message: 'The Free Plan is limited to a maximum of 2 clients. Please upgrade your subscription to add more clients.' 
      });
    }
  }

  const ClientModel = getTenantModel(companyId, 'Client');
  if (getIsConnected()) {
    try {
      const client = new ClientModel({ name, email, companyId, org, status: 'Active', isDeleted: false });
      await client.save();
      return res.status(201).json({ success: true, data: client });
    } catch (err) {
      console.error(err);
    }
  }

  const client = { id: `c_${Date.now()}`, name, email, companyId, org, status: 'Active', isDeleted: false };
  fallbackClients.push(client);
  return res.status(201).json({ success: true, data: client });
}

async function softDeleteClient(req, res) {
  const { id } = req.params;
  const companyId = req.user.companyId;

  if (getIsConnected()) {
    try {
      const ClientModel = getTenantModel(companyId, 'Client');
      const client = await ClientModel.findById(id);
      if (client) {
        client.isDeleted = true;
        await client.save();
        return res.status(200).json({ success: true, data: client });
      }
    } catch (err) {
      console.error(err);
    }
  }
  const client = fallbackClients.find(c => c.id === id);
  if (client) {
    client.isDeleted = true;
    return res.status(200).json({ success: true, data: client });
  }
  return res.status(404).json({ success: false, message: 'Client not found.' });
}

async function restoreClient(req, res) {
  const { id } = req.params;
  const companyId = req.user.companyId;

  if (getIsConnected()) {
    try {
      const ClientModel = getTenantModel(companyId, 'Client');
      const client = await ClientModel.findById(id);
      if (client) {
        client.isDeleted = false;
        await client.save();
        return res.status(200).json({ success: true, data: client });
      }
    } catch (err) {
      console.error(err);
    }
  }
  const client = fallbackClients.find(c => c.id === id);
  if (client) {
    client.isDeleted = false;
    return res.status(200).json({ success: true, data: client });
  }
  return res.status(404).json({ success: false, message: 'Client not found.' });
}

async function permanentDeleteClient(req, res) {
  const { id } = req.params;
  const companyId = req.user.companyId;

  if (getIsConnected()) {
    try {
      const ClientModel = getTenantModel(companyId, 'Client');
      await ClientModel.findByIdAndDelete(id);
      return res.status(200).json({ success: true, message: 'Client permanently deleted.' });
    } catch (err) {
      console.error(err);
    }
  }
  const index = fallbackClients.findIndex(c => c.id === id);
  if (index !== -1) {
    fallbackClients.splice(index, 1);
    return res.status(200).json({ success: true, message: 'Client permanently deleted.' });
  }
  return res.status(404).json({ success: false, message: 'Client not found.' });
}

module.exports = {
  getClients,
  getTrashClients,
  createClient,
  softDeleteClient,
  restoreClient,
  permanentDeleteClient
};
