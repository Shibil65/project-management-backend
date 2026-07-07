const Plan = require('../models/Plan');
const { fallbackPlans } = require('./fallbackStore');
const { getIsConnected } = require('../config/db');

const BUILT_IN_PLANS = [
  { name: 'Free', price: 0, maxUsers: 5, maxProjects: 3 },
  { name: 'Starter Package', price: 2500, maxUsers: 15, maxProjects: 10 },
  { name: 'Scale Package Tier', price: 8900, maxUsers: 50, maxProjects: 30 },
];

function normalizePlanName(name = '') {
  return String(name)
    .toLowerCase()
    .replace(/\b(package|tier|saas)\b/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function matchesPlanName(plan, name) {
  return normalizePlanName(plan?.name) === normalizePlanName(name);
}

function findPlanInList(list, name) {
  return (list || []).find((plan) => matchesPlanName(plan, name));
}

async function resolvePlanDetails(planName) {
  if (!planName) return null;

  if (getIsConnected()) {
    try {
      const escaped = String(planName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const exact = await Plan.findOne({ name: new RegExp(`^${escaped}$`, 'i') });
      if (exact) return exact;

      const plans = await Plan.find({});
      const normalizedMatch = findPlanInList(plans, planName);
      if (normalizedMatch) return normalizedMatch;
    } catch (err) {
      console.error('[resolvePlanDetails] Plan lookup failed:', err.message);
    }
  }

  return findPlanInList(fallbackPlans, planName) || findPlanInList(BUILT_IN_PLANS, planName);
}

function getFallbackPlanDetails(planName) {
  return findPlanInList(fallbackPlans, planName) || findPlanInList(BUILT_IN_PLANS, planName);
}

module.exports = {
  resolvePlanDetails,
  getFallbackPlanDetails,
  normalizePlanName,
};
