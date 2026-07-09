const mongoose = require('mongoose');
const SubscriptionPackage = require('./subscriptionPackage.model');

// Export SubscriptionPackage model registered as 'Plan' for backward compatibility
module.exports = mongoose.models.Plan || mongoose.model('Plan', SubscriptionPackage.schema);
