const bcrypt = require("bcryptjs");
const {
  getIsConnected
} = require("../../config/db");
const User = require("../../models/User");
const Company = require("../../models/Company");
const getTenantModel = require("../../utils/tenantDb");
const {
  fallbackUsers,
  fallbackCompanies
} = require("../../utils/fallbackStore");
const {
  sendEmployeeCredentialsEmail
} = require("../../services/email/emailService");
const { validatePassword } = require("../../utils/passwordPolicy");
const { getFrontendBaseUrl } = require("../../utils/frontendUrl");
const { updateCompanyEmployeeCount } = require("../../utils/companyHelper");
async function createProjectLead(req, res) {
  const {
    name,
    email,
    password,
    phone,
    domain,
    location
  } = req.body;
  const companyId = req.user.companyId;
  const org = req.user.org;

  const mongoose = require("mongoose");
  let parsedCompanyId = null;
  if (companyId && mongoose.Types.ObjectId.isValid(companyId)) {
    parsedCompanyId = new mongoose.Types.ObjectId(companyId);
  }

  if (!name || !email || !password) {
    return res.status(400).json({
      success: false,
      message: "Name, email, and temporary password are required."
    });
  }

  const passwordValidation = validatePassword(password);
  if (!passwordValidation.valid) {
    return res.status(400).json({ success: false, message: passwordValidation.message });
  }
  let maxUsers = 5;
  let plan = "Free";
  if (getIsConnected()) {
    try {
      const company = await Company.findById(parsedCompanyId);
      if (company) {
        plan = company.plan;
        const Plan = require("../../models/Plan");
        const planDetails = await Plan.findOne({
          name: plan
        });
        if (planDetails) {
          maxUsers = planDetails.maxUsers;
        } else {
          if (plan === "Starter Package" || plan === "Starter") maxUsers = 15;
          else if (plan === "Scale Package Tier" || plan === "Scale") maxUsers = 50;
          else maxUsers = 5;
        }
      }
    } catch (err) {
      console.error("Plan limits fetch failed:", err);
    }
  } else {
    const company = fallbackCompanies.find(c => c.id === companyId);
    if (company) {
      plan = company.plan;
      const fallbackPlans = require("../../utils/fallbackStore").fallbackPlans;
      const planDetails = fallbackPlans.find(p => p.name === plan);
      if (planDetails) maxUsers = planDetails.maxUsers;
    }
  }
  let currentUsersCount = 0;
  const UserModel = getTenantModel(parsedCompanyId, "User");
  if (getIsConnected()) {
    try {
      currentUsersCount = await UserModel.countDocuments({
        companyId: parsedCompanyId,
        role: {
          $in: ["Employee", "Project Lead", "project_lead"]
        },
        status: {
          $ne: "Deleted"
        }
      });
    } catch (err) {
      console.error(err);
    }
  } else {
    currentUsersCount = fallbackUsers.filter(u => u.companyId === companyId && (u.role === "Employee" || u.role === "Project Lead" || u.role === "project_lead")).length;
  }
  if (currentUsersCount >= maxUsers) {
    return res.status(400).json({
      success: false,
      message: `Your current plan restricts you to a maximum of ${maxUsers} employees/leads. Please upgrade your subscription to add more seats.`
    });
  }
  try {
    const hashed = await bcrypt.hash(password, 10);
    const avatarColors = ["#6366f1", "#ec4899", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6"];
    const avatarColor = avatarColors[Math.floor(Math.random() * avatarColors.length)];
    if (getIsConnected()) {
      const existing = await User.findOne({
        email: email.toLowerCase()
      }).setOptions({ bypassTenant: true });
      if (existing) {
        return res.status(400).json({
          success: false,
          message: "An account with this email address already exists."
        });
      }
      const systemUser = new User({
        name,
        email: email.toLowerCase(),
        password: hashed,
        companyId: parsedCompanyId,
        org,
        role: "Project Lead",
        phone: phone || "",
        domain: domain || "",
        location: location || "",
        avatarColor,
        status: "Active",
        portalSetup: false
      });
      await systemUser.save();
      const returnData = systemUser.toObject();
      delete returnData.password;

      let emailSent = false;
      try {
        const portalUrl = getFrontendBaseUrl(req);
        const emailResult = await sendEmployeeCredentialsEmail(email.toLowerCase(), name, org, password, portalUrl, req.user.email);
        emailSent = emailResult.emailSent;
      } catch (err) {
        console.error("Credentials email failed:", err);
      }

      await updateCompanyEmployeeCount(parsedCompanyId);

      return res.status(201).json({
        success: true,
        data: returnData,
        emailSent
      });
    } else {
      const existing = fallbackUsers.find(u => u.email.toLowerCase() === email.toLowerCase());
      if (existing) {
        return res.status(400).json({
          success: false,
          message: "An account with this email address already exists."
        });
      }
      const lead = {
        id: `emp_${Date.now()}`,
        _id: `emp_${Date.now()}`,
        name,
        email: email.toLowerCase(),
        password: hashed,
        companyId,
        org,
        role: "Project Lead",
        phone: phone || "",
        domain: domain || "",
        location: location || "",
        avatarColor,
        status: "Active",
        portalSetup: false,
        date: new Date().toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric"
        })
      };
      fallbackUsers.push(lead);
      const returnData = {
        ...lead
      };
      delete returnData.password;

      let emailSent = false;
      try {
        const portalUrl = getFrontendBaseUrl(req);
        const emailResult = await sendEmployeeCredentialsEmail(email.toLowerCase(), name, org, password, portalUrl, req.user.email);
        emailSent = emailResult.emailSent;
      } catch (err) {
        console.error("Credentials email failed in fallback store:", err);
      }

      await updateCompanyEmployeeCount(companyId);

      return res.status(201).json({
        success: true,
        data: returnData,
        emailSent
      });
    }
  } catch (err) {
    console.error("Error creating project lead:", err);
    return res.status(500).json({
      success: false,
      message: "Server error during project lead creation.",
      error: err.message,
      stack: err.stack
    });
  }
}

module.exports = { createProjectLead };

