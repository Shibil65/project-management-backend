const mongoose = require('mongoose');

const PlanSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  price: { type: Number, required: true },
  limit: { type: String, default: 'Unlimited Users' },
  maxUsers: { type: Number, default: 15 },
  maxProjects: { type: Number, default: 10 },
  supportType: { type: String, default: 'Standard Email Support' },
  billingCycle: { type: String, default: 'Monthly' },
  features: { type: [String], default: [] }
}, { timestamps: true });

module.exports = mongoose.models.Plan || mongoose.model('Plan', PlanSchema);
