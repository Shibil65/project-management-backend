const service = require("../../services/clientShareService");
const {
  getIsConnected
} = require("../../config/db");
const getTenantModel = require("../../utils/tenantDb");
const {
  fallbackMessages,
  fallbackUsers
} = require("../../utils/fallbackStore");

async function getPendingActions(req, res) {
  return getDashboard(req, res);
}

module.exports = { getPendingActions };

