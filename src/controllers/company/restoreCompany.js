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

async function restoreCompany(req, res) {
  const {
    id
  } = req.params;
  if (getIsConnected()) {
    try {
      const company = await Company.findById(id);
      if (!company) {
        return res.status(404).json({
          success: false,
          message: "Company not found."
        });
      }
      company.isDeleted = false;
      await company.save();
      return res.status(200).json({
        success: true,
        message: "Company restored from Trash.",
        data: company
      });
    } catch (err) {
      console.error("Failed to restore company in MongoDB:", err.message);
    }
  }
  const company = fallbackCompanies.find(c => c.id === id);
  if (company) {
    company.isDeleted = false;
    return res.status(200).json({
      success: true,
      message: "Company restored from Trash.",
      data: company
    });
  }
  return res.status(404).json({
    success: false,
    message: "Company not found in datastore."
  });
}

module.exports = { restoreCompany };

