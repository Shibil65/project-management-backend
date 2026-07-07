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

async function getTrashCompanies(req, res) {
  if (getIsConnected()) {
    try {
      const companiesList = await Company.find({
        isDeleted: true
      });
      return res.status(200).json({
        success: true,
        data: companiesList
      });
    } catch (err) {
      console.error(err);
      return res.status(200).json({
        success: true,
        data: fallbackCompanies.filter(c => c.isDeleted)
      });
    }
  }
  return res.status(200).json({
    success: true,
    data: fallbackCompanies.filter(c => c.isDeleted)
  });
}

module.exports = { getTrashCompanies };

