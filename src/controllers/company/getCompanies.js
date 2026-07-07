const {
  getIsConnected
} = require("../../config/db");
const Company = require("../../models/Company");
const User = require("../../models/User");
const Payment = require("../../models/Payment");
const {
  fallbackCompanies,
  fallbackUsers,
  fallbackPayments
} = require("../../utils/fallbackStore");
const {
  sendWelcomeEmail
} = require("../../services/emailService");

async function getCompanies(req, res) {
  const isSuper = req.user && req.user.role === 'Super Admin';
  const companyId = req.user ? req.user.companyId : null;

  if (getIsConnected()) {
    try {
      const query = { isDeleted: { $ne: true } };
      if (!isSuper && companyId) {
        query._id = companyId;
      }
      const companiesList = await Company.find(query);
      return res.status(200).json({
        success: true,
        data: companiesList
      });
    } catch (err) {
      console.error(err);
      const fallbackList = fallbackCompanies.filter(c => !c.isDeleted);
      const data = isSuper ? fallbackList : fallbackList.filter(c => String(c.id) === String(companyId));
      return res.status(200).json({
        success: true,
        data
      });
    }
  }
  
  const fallbackList = fallbackCompanies.filter(c => !c.isDeleted);
  const data = isSuper ? fallbackList : fallbackList.filter(c => String(c.id) === String(companyId));
  return res.status(200).json({
    success: true,
    data
  });
}

module.exports = { getCompanies };

