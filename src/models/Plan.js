const mongoose = require('mongoose');
const SubscriptionPlan = require('./SubscriptionPlan');

// Export SubscriptionPlan model registered as 'Plan' for backward compatibility
module.exports = mongoose.models.Plan || mongoose.model('Plan', SubscriptionPlan.schema);
