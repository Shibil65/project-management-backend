const SubscriptionPackage = require('../models/subscriptionPackage.model');

const defaultSeedPackages = [
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

async function seedSubscriptionPackages() {
  try {
    const count = await SubscriptionPackage.countDocuments({});
    if (count === 0) {
      console.log('Seeding default subscription packages into database...');
      await SubscriptionPackage.insertMany(defaultSeedPackages);
      console.log('Seeding completed successfully!');
    }
  } catch (err) {
    console.error('Seeding packages failed:', err.message);
  }
}

module.exports = {
  seedSubscriptionPackages,
  defaultSeedPackages
};
