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

async function toggleCompanyStatus(req, res) {
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
      company.status = company.status === "Active" ? "Suspended" : "Active";
      await company.save();
      return res.status(200).json({
        success: true,
        data: company
      });
    } catch (err) {
      console.error("Failed to toggle company status in MongoDB:", err.message);
    }
  }
  const company = fallbackCompanies.find(c => c.id === id);
  if (company) {
    company.status = company.status === "Active" ? "Suspended" : "Active";
    return res.status(200).json({
      success: true,
      data: company
    });
  }
  return res.status(404).json({
    success: false,
    message: "Company not found in datastore."
  });
}

module.exports = { toggleCompanyStatus };

