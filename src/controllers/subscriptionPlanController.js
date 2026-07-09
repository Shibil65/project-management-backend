const { getIsConnected } = require('../config/db');
const SubscriptionPlan = require('../models/SubscriptionPlan');
const { fallbackPlans } = require('../utils/fallbackStore');

// Helper to seed plans if none exist in database or fallback
const defaultSeedPlans = [
  {
    name: 'Free',
    slug: 'free',
    price: 0,
    currency: 'INR',
    billingCycle: 'monthly',
    description: 'Perfect for small teams getting started.',
    features: ['Scrum Sprints', 'Basic Kanban Board', '3 Active Projects', '10 Seat Roster Limits'],
    limits: { maxProjects: 3, maxEmployees: 10, maxClients: 5, storageGB: 2 },
    isPopular: false,
    isActive: true,
    displayOrder: 1,
    buttonLabel: 'Start Free Trial'
  },
  {
    name: 'Base',
    slug: 'base',
    price: 900,
    currency: 'INR',
    billingCycle: 'monthly',
    description: 'Essential management for expanding agencies.',
    features: ['SaaS Kanban Boards', 'Waterfall Gantt Charts', 'Timesheets Integration', 'Standard Support Node'],
    limits: { maxProjects: 4, maxEmployees: 10, maxClients: 10, storageGB: 5 },
    isPopular: false,
    isActive: true,
    displayOrder: 2,
    buttonLabel: 'Choose Base'
  },
  {
    name: 'Starter Package',
    slug: 'starter',
    price: 2500,
    currency: 'INR',
    billingCycle: 'monthly',
    description: 'Complete workspace features and higher limits.',
    features: ['Full Project Workspaces', 'Multi-Phase Waterfall Models', 'Lead Generation CRM Tool', 'Dedicated Executive Support'],
    limits: { maxProjects: 10, maxEmployees: 15, maxClients: 15, storageGB: 10 },
    isPopular: false,
    isActive: true,
    displayOrder: 3,
    buttonLabel: 'Choose Starter'
  },
  {
    name: 'Scale Package Tier',
    slug: 'scale',
    price: 8900,
    currency: 'INR',
    billingCycle: 'monthly',
    description: 'High capacity operations for large-scale enterprises.',
    features: ['Unlimited Active Projects', 'Unlimited Kanban Boards', 'CRM Lead Lifecycle Console', 'Priority support escalation SLA'],
    limits: { maxProjects: 999999, maxEmployees: 50, maxClients: 50, storageGB: 50 },
    isPopular: true,
    isActive: true,
    displayOrder: 4,
    buttonLabel: 'Choose Scale'
  }
];

// Seed fallbackPlans if empty or in legacy format
function checkAndSeedFallbackPlans() {
  if (fallbackPlans.length === 0 || !fallbackPlans[0].limits) {
    fallbackPlans.length = 0; // Clear legacy
    defaultSeedPlans.forEach((plan, i) => {
      fallbackPlans.push({
        id: `fb_p_${Date.now()}_${i}`,
        ...plan,
        // direct values for backward compatibility
        maxUsers: plan.limits.maxEmployees,
        maxProjects: plan.limits.maxProjects,
        limit: `${plan.limits.maxEmployees} Users`
      });
    });
  }
}

// 1. GET /api/subscription-plans/active (Public)
async function getActivePlans(req, res) {
  if (getIsConnected()) {
    try {
      const count = await SubscriptionPlan.countDocuments({});
      if (count === 0) {
        // Automatically seed default plans if DB empty
        await SubscriptionPlan.insertMany(defaultSeedPlans);
      }
      // Query plans where isActive is not false (to support legacy plans without isActive field)
      const list = await SubscriptionPlan.find({ isActive: { $ne: false } }).sort({ displayOrder: 1 });
      return res.status(200).json({ success: true, data: list });
    } catch (err) {
      console.error('Failed to get active plans:', err);
      return res.status(500).json({ success: false, message: 'Database error fetching active plans.' });
    }
  }

  checkAndSeedFallbackPlans();
  const list = fallbackPlans.filter(p => p.isActive).sort((a, b) => a.displayOrder - b.displayOrder);
  return res.status(200).json({ success: true, data: list });
}

// 2. GET /api/super-admin/subscription-plans
async function getAllPlans(req, res) {
  if (getIsConnected()) {
    try {
      const count = await SubscriptionPlan.countDocuments({});
      if (count === 0) {
        await SubscriptionPlan.insertMany(defaultSeedPlans);
      }
      const list = await SubscriptionPlan.find({}).sort({ displayOrder: 1 });
      return res.status(200).json({ success: true, data: list });
    } catch (err) {
      console.error('Failed to get all plans:', err);
      return res.status(500).json({ success: false, message: 'Database error fetching plans.' });
    }
  }

  checkAndSeedFallbackPlans();
  return res.status(200).json({ success: true, data: fallbackPlans });
}

// 3. POST /api/super-admin/subscription-plans
async function createPlan(req, res) {
  const {
    name, slug, price, currency, billingCycle, description, features,
    limits, isPopular, isActive, displayOrder, buttonLabel
  } = req.body;

  if (!name || price === undefined) {
    return res.status(400).json({ success: false, message: 'Plan Name and Price are required.' });
  }

  const email = req.user?.email || 'Super Admin';

  const newPlanData = {
    name,
    slug: slug || name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
    price: Number(price),
    currency: currency || 'INR',
    billingCycle: billingCycle || 'monthly',
    description: description || '',
    features: Array.isArray(features) ? features : [],
    limits: {
      maxProjects: limits?.maxProjects !== undefined ? Number(limits.maxProjects) : 10,
      maxEmployees: limits?.maxEmployees !== undefined ? Number(limits.maxEmployees) : 15,
      maxClients: limits?.maxClients !== undefined ? Number(limits.maxClients) : 15,
      storageGB: limits?.storageGB !== undefined ? Number(limits.storageGB) : 10
    },
    isPopular: Boolean(isPopular),
    isActive: isActive !== false,
    displayOrder: displayOrder !== undefined ? Number(displayOrder) : 0,
    buttonLabel: buttonLabel || 'Subscribe',
    createdBy: email
  };

  if (getIsConnected()) {
    try {
      const existing = await SubscriptionPlan.findOne({ name: new RegExp(`^${name.trim()}$`, 'i') });
      if (existing) {
        return res.status(400).json({ success: false, message: 'A plan with this name already exists.' });
      }

      // If this plan is popular, unmark others
      if (newPlanData.isPopular) {
        await SubscriptionPlan.updateMany({}, { isPopular: false });
      }

      const planDoc = new SubscriptionPlan(newPlanData);
      await planDoc.save();
      return res.status(201).json({ success: true, data: planDoc });
    } catch (err) {
      console.error('Failed to create plan:', err);
      return res.status(500).json({ success: false, message: 'Database error creating plan.' });
    }
  }

  checkAndSeedFallbackPlans();
  const existingFallback = fallbackPlans.find(p => p.name.toLowerCase() === name.trim().toLowerCase());
  if (existingFallback) {
    return res.status(400).json({ success: false, message: 'A plan with this name already exists in fallback store.' });
  }

  if (newPlanData.isPopular) {
    fallbackPlans.forEach(p => p.isPopular = false);
  }

  const fallbackObj = {
    id: `fb_p_${Date.now()}`,
    ...newPlanData,
    maxUsers: newPlanData.limits.maxEmployees,
    maxProjects: newPlanData.limits.maxProjects,
    limit: `${newPlanData.limits.maxEmployees} Users`
  };
  fallbackPlans.push(fallbackObj);

  return res.status(201).json({ success: true, data: fallbackObj });
}

// 4. PUT /api/super-admin/subscription-plans/:id
async function updatePlan(req, res) {
  const { id } = req.params;
  const {
    name, slug, price, currency, billingCycle, description, features,
    limits, isPopular, isActive, displayOrder, buttonLabel
  } = req.body;

  const email = req.user?.email || 'Super Admin';

  const updates = {};
  if (name !== undefined) updates.name = name;
  if (slug !== undefined) updates.slug = slug;
  if (price !== undefined) updates.price = Number(price);
  if (currency !== undefined) updates.currency = currency;
  if (billingCycle !== undefined) updates.billingCycle = billingCycle;
  if (description !== undefined) updates.description = description;
  if (features !== undefined) updates.features = Array.isArray(features) ? features : [];
  if (limits !== undefined) {
    updates.limits = {
      maxProjects: limits.maxProjects !== undefined ? Number(limits.maxProjects) : 10,
      maxEmployees: limits.maxEmployees !== undefined ? Number(limits.maxEmployees) : 15,
      maxClients: limits.maxClients !== undefined ? Number(limits.maxClients) : 15,
      storageGB: limits.storageGB !== undefined ? Number(limits.storageGB) : 10
    };
  }
  if (isPopular !== undefined) updates.isPopular = Boolean(isPopular);
  if (isActive !== undefined) updates.isActive = Boolean(isActive);
  if (displayOrder !== undefined) updates.displayOrder = Number(displayOrder);
  if (buttonLabel !== undefined) updates.buttonLabel = buttonLabel;
  updates.updatedBy = email;

  if (getIsConnected()) {
    try {
      const planDoc = await SubscriptionPlan.findById(id);
      if (!planDoc) {
        return res.status(404).json({ success: false, message: 'Plan not found.' });
      }

      if (updates.isPopular) {
        await SubscriptionPlan.updateMany({ _id: { $ne: id } }, { isPopular: false });
      }

      Object.assign(planDoc, updates);
      await planDoc.save();
      return res.status(200).json({ success: true, data: planDoc });
    } catch (err) {
      console.error('Failed to update plan:', err);
      return res.status(500).json({ success: false, message: 'Database error updating plan.' });
    }
  }

  checkAndSeedFallbackPlans();
  const planIdx = fallbackPlans.findIndex(p => p.id === id);
  if (planIdx !== -1) {
    const original = fallbackPlans[planIdx];
    if (updates.isPopular) {
      fallbackPlans.forEach(p => p.isPopular = false);
    }
    const updatedObj = {
      ...original,
      ...updates,
      limits: updates.limits ? { ...original.limits, ...updates.limits } : original.limits
    };
    // Sync legacy props
    updatedObj.maxUsers = updatedObj.limits.maxEmployees;
    updatedObj.maxProjects = updatedObj.limits.maxProjects;
    updatedObj.limit = `${updatedObj.limits.maxEmployees} Users`;

    fallbackPlans[planIdx] = updatedObj;
    return res.status(200).json({ success: true, data: updatedObj });
  }

  return res.status(404).json({ success: false, message: 'Plan not found.' });
}

// 5. DELETE /api/super-admin/subscription-plans/:id
async function deletePlan(req, res) {
  const { id } = req.params;

  if (getIsConnected()) {
    try {
      const deleted = await SubscriptionPlan.findByIdAndDelete(id);
      if (!deleted) {
        return res.status(404).json({ success: false, message: 'Plan not found.' });
      }
      return res.status(200).json({ success: true, message: 'Plan deleted successfully.' });
    } catch (err) {
      console.error('Failed to delete plan:', err);
      return res.status(500).json({ success: false, message: 'Database error deleting plan.' });
    }
  }

  checkAndSeedFallbackPlans();
  const index = fallbackPlans.findIndex(p => p.id === id);
  if (index !== -1) {
    fallbackPlans.splice(index, 1);
    return res.status(200).json({ success: true, message: 'Plan deleted successfully from fallback store.' });
  }

  return res.status(404).json({ success: false, message: 'Plan not found.' });
}

// 6. PATCH /api/super-admin/subscription-plans/:id/toggle-status
async function togglePlanStatus(req, res) {
  const { id } = req.params;

  if (getIsConnected()) {
    try {
      const planDoc = await SubscriptionPlan.findById(id);
      if (!planDoc) {
        return res.status(404).json({ success: false, message: 'Plan not found.' });
      }
      planDoc.isActive = !planDoc.isActive;
      await planDoc.save();
      return res.status(200).json({ success: true, data: planDoc });
    } catch (err) {
      console.error('Failed to toggle status:', err);
      return res.status(500).json({ success: false, message: 'Database error toggling plan status.' });
    }
  }

  checkAndSeedFallbackPlans();
  const plan = fallbackPlans.find(p => p.id === id);
  if (plan) {
    plan.isActive = !plan.isActive;
    return res.status(200).json({ success: true, data: plan });
  }

  return res.status(404).json({ success: false, message: 'Plan not found.' });
}

// 7. PATCH /api/super-admin/subscription-plans/:id/mark-popular
async function markPlanPopular(req, res) {
  const { id } = req.params;

  if (getIsConnected()) {
    try {
      const planDoc = await SubscriptionPlan.findById(id);
      if (!planDoc) {
        return res.status(404).json({ success: false, message: 'Plan not found.' });
      }
      // Unmark all plans, then mark this one
      await SubscriptionPlan.updateMany({}, { isPopular: false });
      planDoc.isPopular = true;
      await planDoc.save();
      return res.status(200).json({ success: true, data: planDoc });
    } catch (err) {
      console.error('Failed to mark popular:', err);
      return res.status(500).json({ success: false, message: 'Database error marking plan popular.' });
    }
  }

  checkAndSeedFallbackPlans();
  const plan = fallbackPlans.find(p => p.id === id);
  if (plan) {
    fallbackPlans.forEach(p => p.isPopular = false);
    plan.isPopular = true;
    return res.status(200).json({ success: true, data: plan });
  }

  return res.status(404).json({ success: false, message: 'Plan not found.' });
}

module.exports = {
  getActivePlans,
  getAllPlans,
  createPlan,
  updatePlan,
  deletePlan,
  togglePlanStatus,
  markPlanPopular
};
