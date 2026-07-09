const mongoose = require('mongoose');

const SubscriptionPackageSchema = new mongoose.Schema({
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

// Virtuals for backward compatibility with existing legacy code referencing plan details
SubscriptionPackageSchema.virtual('maxUsers').get(function() {
  return this.limits ? this.limits.maxEmployees : undefined;
}).set(function(val) {
  if (!this.limits) this.limits = {};
  this.limits.maxEmployees = val;
});

SubscriptionPackageSchema.virtual('maxProjects').get(function() {
  return this.limits ? this.limits.maxProjects : undefined;
}).set(function(val) {
  if (!this.limits) this.limits = {};
  this.limits.maxProjects = val;
});

SubscriptionPackageSchema.virtual('limit').get(function() {
  if (this.limits && this.limits.maxEmployees) {
    return this.limits.maxEmployees >= 999999 ? 'Unlimited Users' : `${this.limits.maxEmployees} Users`;
  }
  return 'Unlimited Users';
});

const SubscriptionPackage = mongoose.models.SubscriptionPackage || mongoose.model('SubscriptionPackage', SubscriptionPackageSchema);

// Register Plan model alias pointing to the same schema/collection (for direct mongoose queries using model name 'Plan')
if (!mongoose.models.Plan) {
  mongoose.model('Plan', SubscriptionPackageSchema);
}

module.exports = SubscriptionPackage;
