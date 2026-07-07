const mongoose = require('mongoose');

// Pre-load all database schemas to prevent "Schema hasn't been registered" errors
require('../models/User');
require('../models/Employee');
require('../models/Project');
require('../models/Attendance');
require('../models/Message');
require('../models/LeaveRequest');
require('../models/Client');
require('../models/Payment');
require('../models/Company');
require('../models/Plan');
require('../models/Timesheet');
require('../models/CRMProjectLead');
require('../models/CRMClientLead');

/**
 * Returns a mongoose model bound to the default connection (single-database).
 * 
 * @param {string} companyId - Unused in single-db architecture.
 * @param {string} modelName - The mongoose model name.
 */
function getTenantModel(companyId, modelName) {
  return mongoose.model(modelName);
}

// Keep a stub function for backward-compatibility if referenced in create/register company
getTenantModel.updateCompanyNameInCache = function(companyId, companyName) {
  // Stub - no cache needed in single db
};

module.exports = getTenantModel;
