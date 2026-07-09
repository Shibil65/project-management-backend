const mongoose = require('mongoose');

const SubscriptionPlanSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  slug: { type: String },
  price: { type: Number, required: true },
  currency: { type: String, default: 'INR' },
  billingCycle: { type: String, default: 'monthly' },
  description: { type: String, default: '' },
  features: { type: [String], default: [] },
  limits: {
    maxProjects: { type: Number, default: 10 },
    maxEmployees: { type: Number, default: 15 },
    maxClients: { type: Number, default: 15 },
    storageGB: { type: Number, default: 10 }
  },
  isPopular: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  displayOrder: { type: Number, default: 0 },
  buttonLabel: { type: String, default: 'Subscribe' },
  createdBy: { type: String },
  updatedBy: { type: String }
}, {
  timestamps: true,
  collection: 'plans',
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtuals for backward compatibility with existing codebase
SubscriptionPlanSchema.virtual('maxUsers').get(function() {
  return this.limits ? this.limits.maxEmployees : undefined;
}).set(function(val) {
  if (!this.limits) this.limits = {};
  this.limits.maxEmployees = val;
});

SubscriptionPlanSchema.virtual('maxProjects').get(function() {
  return this.limits ? this.limits.maxProjects : undefined;
}).set(function(val) {
  if (!this.limits) this.limits = {};
  this.limits.maxProjects = val;
});

SubscriptionPlanSchema.virtual('limit').get(function() {
  if (this.limits && this.limits.maxEmployees) {
    return this.limits.maxEmployees >= 999999 ? 'Unlimited Users' : `${this.limits.maxEmployees} Users`;
  }
  return 'Unlimited Users';
});

const SubscriptionPlan = mongoose.models.SubscriptionPlan || mongoose.model('SubscriptionPlan', SubscriptionPlanSchema);

// Register Plan model alias pointing to the same collection
if (!mongoose.models.Plan) {
  mongoose.model('Plan', SubscriptionPlanSchema);
}

module.exports = SubscriptionPlan;
