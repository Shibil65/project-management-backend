const bcrypt = require("bcryptjs");
const { getIsConnected } = require("../../config/db");
const User = require("../../models/User");
const Employee = require("../../models/Employee");
const Company = require("../../models/Company");
const getTenantModel = require("../../utils/tenantDb");
const { fallbackUsers, fallbackCompanies, fallbackPlans } = require("../../utils/fallbackStore");
const { resolvePlanDetails, getFallbackPlanDetails } = require("../../utils/planResolver");
const { updateCompanyEmployeeCount } = require("../../utils/companyHelper");

async function resolveSeatLimit(company, connected) {
  const planDetails = connected ? await resolvePlanDetails(company?.plan) : getFallbackPlanDetails(company?.plan);
  return Number(planDetails?.maxUsers) || 5;
}

async function employeeRegister(req, res) {
  const { companyName, name, email, password, phone, domain, location } = req.body;
  if (!companyName || !name || !email || !password) {
    return res.status(400).json({ success: false, message: "Company Name, Name, Email, and Password are required." });
  }

  const emailLower = email.trim().toLowerCase();
  const companyNameTrim = companyName.trim();

  try {
    let company = null;
    if (getIsConnected()) {
      company = await Company.findOne({
        name: { $regex: new RegExp("^" + companyNameTrim + "$", "i") },
        isDeleted: { $ne: true }
      });
    } else {
      company = fallbackCompanies.find(c => c.name.toLowerCase() === companyNameTrim.toLowerCase() && !c.isDeleted);
    }

    if (!company) {
      return res.status(400).json({ success: false, message: "Company not found. Please verify the company name with your administrator." });
    }
    if (company.status === "Suspended") {
      return res.status(403).json({ success: false, message: "This company is suspended. Please contact your administrator." });
    }

    const companyId = company._id ? company._id : company.id;
    const org = company.name;
    const maxUsers = await resolveSeatLimit(company, getIsConnected());

    let currentCount = 0;
    if (getIsConnected()) {
      const UserModel = getTenantModel(companyId, "User");
      const EmployeeModel = getTenantModel(companyId, "Employee");
      const [userCount, employeeCount] = await Promise.all([
        UserModel.countDocuments({ companyId, role: "Employee", status: { $ne: "Deleted" } }),
        EmployeeModel.countDocuments({ companyId, status: { $ne: "Deleted" } })
      ]);
      currentCount = Math.max(userCount, employeeCount);
    } else {
      currentCount = fallbackUsers.filter(u => u.companyId === companyId && u.role === "Employee" && u.status !== "Deleted").length;
    }

    if (currentCount >= maxUsers) {
      return res.status(400).json({
        success: false,
        message: `Your company's plan restricts it to a maximum of ${maxUsers} employees. Please contact your administrator to upgrade.`
      });
    }

    let existingUser = null;
    if (getIsConnected()) {
      existingUser = await User.findOne({ email: emailLower }).setOptions({ bypassTenant: true });
    } else {
      existingUser = fallbackUsers.find(u => u.email.toLowerCase() === emailLower);
    }
    if (existingUser) {
      return res.status(400).json({ success: false, message: "An account with this email address already exists." });
    }

    const hashed = await bcrypt.hash(password, 10);
    const avatarColors = ["#6366f1", "#ec4899", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6"];
    const avatarColor = avatarColors[Math.floor(Math.random() * avatarColors.length)];
    const newUserPayload = {
      name: name.trim(),
      email: emailLower,
      password: hashed,
      companyId,
      org,
      role: "Employee",
      phone: phone || "",
      domain: domain || "",
      location: location || "",
      avatarColor,
      status: "Active",
      portalSetup: false,
      securityPin: "123456",
      githubUsername: ""
    };

    let savedUser = null;
    if (getIsConnected()) {
      savedUser = await new User(newUserPayload).save();
      const EmployeeModel = getTenantModel(companyId, "Employee");
      await new EmployeeModel({
        authUserId: savedUser._id,
        name: savedUser.name,
        email: savedUser.email,
        companyId,
        companyName: org,
        org,
        role: "Employee",
        phone: phone || "",
        domain: domain || "",
        location: location || "",
        avatarColor,
        status: "Active",
        portalSetup: false
      }).save();
    } else {
      savedUser = { id: `fb_u_${Date.now()}`, companyName: org, ...newUserPayload };
      fallbackUsers.push(savedUser);
    }

    await updateCompanyEmployeeCount(companyId);

    return res.status(201).json({
      success: true,
      message: "Self-registration successful! You can now log in to the employee portal.",
      data: { id: savedUser._id || savedUser.id, name: savedUser.name, email: savedUser.email }
    });
  } catch (err) {
    console.error("[employeeRegister] Error:", err);
    return res.status(500).json({ success: false, message: "Server error during self-registration." });
  }
}

module.exports = { employeeRegister };
