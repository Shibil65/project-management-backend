const { getIsConnected } = require('../config/db');
const Plan = require('../models/Plan');
const { fallbackPlans } = require('../utils/fallbackStore');
const { normalizePlanName } = require('../utils/planResolver');

function normalizePlanPayload(body) {
  const name = typeof body.name === 'string' ? body.name.trim() : body.name;
  const price = Number(body.price);
  const maxUsers = body.maxUsers !== undefined ? Number(body.maxUsers) : 15;
  const maxProjects = body.maxProjects !== undefined ? Number(body.maxProjects) : 10;

  if (!name || body.price === undefined) {
    return { error: 'Plan Name and Price are required.' };
  }
  if (!Number.isFinite(price) || price < 0) {
    return { error: 'Plan price must be a valid non-negative number.' };
  }
  if (!Number.isFinite(maxUsers) || maxUsers < 1) {
    return { error: 'Max users must be at least 1.' };
  }
  if (!Number.isFinite(maxProjects) || maxProjects < 1) {
    return { error: 'Max projects must be at least 1.' };
  }

  return {
    data: {
      name,
      price,
      limit: body.limit || 'Unlimited Users',
      maxUsers,
      maxProjects,
      supportType: body.supportType || 'Standard Email Support',
      billingCycle: body.billingCycle || 'Monthly',
      features: Array.isArray(body.features) ? body.features : []
    }
  };
}

async function getPlans(req, res) {
  if (getIsConnected()) {
    try {
      let list = await Plan.find({}).sort({ price: 1 });
      if (list.length === 0) {
        // Seed default plans if collection is empty
        const defaults = [
          { name: 'Free', price: 0, limit: '5 Users', maxUsers: 5, maxProjects: 3 },
          { name: 'Starter Package', price: 2500, limit: '15 Users', maxUsers: 15, maxProjects: 10 },
          { name: 'Scale Package Tier', price: 8900, limit: '50 Users', maxUsers: 50, maxProjects: 30 },
        ];
        await Plan.insertMany(defaults);
        list = await Plan.find({}).sort({ price: 1 });
      }
      return res.status(200).json({ success: true, data: list });
    } catch (err) {
      console.error('Failed to fetch plans from MongoDB:', err.message);
    }
  }
  const sortedFallbackPlans = [...fallbackPlans].sort((a, b) => a.price - b.price);
  return res.status(200).json({ success: true, data: sortedFallbackPlans });
}

async function createPlan(req, res) {
  const normalized = normalizePlanPayload(req.body);
  if (normalized.error) return res.status(400).json({ success: false, message: normalized.error });
  const { name, price, limit, maxUsers, maxProjects, supportType, billingCycle, features } = normalized.data;

  if (getIsConnected()) {
    try {
      const existing = await Plan.findOne({ name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
      if (existing) {
        return res.status(400).json({ success: false, message: 'A plan with this name already exists.' });
      }
      const newPlan = new Plan({
        name,
        price: Number(price),
        limit: limit || 'Unlimited Users',
        maxUsers: maxUsers !== undefined ? Number(maxUsers) : 15,
        maxProjects: maxProjects !== undefined ? Number(maxProjects) : 10,
        supportType,
        billingCycle,
        features
      });
      await newPlan.save();
      return res.status(201).json({ success: true, data: newPlan });
    } catch (err) {
      console.error('Failed to create plan in MongoDB:', err.message);
      if (err.code === 11000) {
        return res.status(400).json({ success: false, message: 'A plan with this name already exists.' });
      }
      return res.status(500).json({ success: false, message: `Database error creating plan: ${err.message}` });
    }
  }

  const existingFallback = fallbackPlans.find(p => normalizePlanName(p.name) === normalizePlanName(name));
  if (existingFallback) {
    return res.status(400).json({ success: false, message: 'A plan with this name already exists in fallback store.' });
  }

  const newPlan = {
    id: `fb_p_${Date.now()}`,
    name,
    price: Number(price),
    limit: limit || 'Unlimited Users',
    maxUsers: maxUsers !== undefined ? Number(maxUsers) : 15,
    maxProjects: maxProjects !== undefined ? Number(maxProjects) : 10,
    supportType,
    billingCycle,
    features
  };
  fallbackPlans.push(newPlan);
  return res.status(201).json({ success: true, data: newPlan });
}

async function updatePlan(req, res) {
  const { id } = req.params;
  const { name, price, limit, maxUsers, maxProjects, supportType, billingCycle, features } = req.body;
  const nextName = typeof name === 'string' ? name.trim() : name;
  const nextPrice = price !== undefined ? Number(price) : undefined;
  const nextMaxUsers = maxUsers !== undefined ? Number(maxUsers) : undefined;
  const nextMaxProjects = maxProjects !== undefined ? Number(maxProjects) : undefined;

  if (nextName !== undefined && !nextName) {
    return res.status(400).json({ success: false, message: 'Plan name cannot be empty.' });
  }
  if (nextPrice !== undefined && (!Number.isFinite(nextPrice) || nextPrice < 0)) {
    return res.status(400).json({ success: false, message: 'Plan price must be a valid non-negative number.' });
  }
  if (nextMaxUsers !== undefined && (!Number.isFinite(nextMaxUsers) || nextMaxUsers < 1)) {
    return res.status(400).json({ success: false, message: 'Max users must be at least 1.' });
  }
  if (nextMaxProjects !== undefined && (!Number.isFinite(nextMaxProjects) || nextMaxProjects < 1)) {
    return res.status(400).json({ success: false, message: 'Max projects must be at least 1.' });
  }

  if (getIsConnected()) {
    try {
      const plan = await Plan.findById(id);
      if (!plan) {
        return res.status(404).json({ success: false, message: 'Plan not found.' });
      }
      if (nextName !== undefined) plan.name = nextName;
      if (nextPrice !== undefined) plan.price = nextPrice;
      if (limit !== undefined) plan.limit = limit;
      if (nextMaxUsers !== undefined) plan.maxUsers = nextMaxUsers;
      if (nextMaxProjects !== undefined) plan.maxProjects = nextMaxProjects;
      if (supportType !== undefined) plan.supportType = supportType;
      if (billingCycle !== undefined) plan.billingCycle = billingCycle;
      if (features !== undefined) plan.features = features;
      await plan.save();
      return res.status(200).json({ success: true, data: plan });
    } catch (err) {
      console.error('Failed to update plan in MongoDB:', err.message);
      if (err.code === 11000) {
        return res.status(400).json({ success: false, message: 'A plan with this name already exists.' });
      }
      return res.status(500).json({ success: false, message: `Database error updating plan: ${err.message}` });
    }
  }

  const plan = fallbackPlans.find(p => p.id === id);
  if (plan) {
    if (nextName !== undefined) plan.name = nextName;
    if (nextPrice !== undefined) plan.price = nextPrice;
    if (limit !== undefined) plan.limit = limit;
    if (nextMaxUsers !== undefined) plan.maxUsers = nextMaxUsers;
    if (nextMaxProjects !== undefined) plan.maxProjects = nextMaxProjects;
    if (supportType !== undefined) plan.supportType = supportType;
    if (billingCycle !== undefined) plan.billingCycle = billingCycle;
    if (features !== undefined) plan.features = features;
    return res.status(200).json({ success: true, data: plan });
  }

  return res.status(404).json({ success: false, message: 'Plan not found in fallback store.' });
}

async function deletePlan(req, res) {
  const { id } = req.params;

  if (getIsConnected()) {
    try {
      const plan = await Plan.findByIdAndDelete(id);
      if (!plan) {
        return res.status(404).json({ success: false, message: 'Plan not found.' });
      }
      return res.status(200).json({ success: true, message: 'Plan deleted successfully.' });
    } catch (err) {
      console.error('Failed to delete plan in MongoDB:', err.message);
      return res.status(500).json({ success: false, message: 'Database error deleting plan.' });
    }
  }

  const index = fallbackPlans.findIndex(p => p.id === id);
  if (index !== -1) {
    fallbackPlans.splice(index, 1);
    return res.status(200).json({ success: true, message: 'Plan deleted successfully from fallback store.' });
  }

  return res.status(404).json({ success: false, message: 'Plan not found in fallback store.' });
}

module.exports = {
  getPlans,
  createPlan,
  updatePlan,
  deletePlan
};
