const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const { getIsConnected } = require("../../config/db");
const User = require("../../models/User");
const Employee = require("../../models/Employee");
const Company = require("../../models/Company");
const getTenantModel = require("../../utils/tenantDb");
const { fallbackUsers, fallbackCompanies } = require("../../utils/fallbackStore");
const { sendEmployeeCredentialsEmail } = require("../../services/email/emailService");
const { resolvePlanDetails, getFallbackPlanDetails } = require("../../utils/planResolver");
const { getEmployeePortalUrl } = require("../../utils/frontendUrl");
const { validatePassword } = require("../../utils/passwordPolicy");
const generateTemporaryPassword = require("../../utils/generateTemporaryPassword");
const { updateCompanyEmployeeCount } = require("../../utils/companyHelper");

function toObjectId(value) {
  return value && mongoose.Types.ObjectId.isValid(value) ? new mongoose.Types.ObjectId(value) : value;
}

function normalizePhone(phone) {
  const cleanPhone = phone ? String(phone).replace(/\s+/g, "") : "";
  if (!cleanPhone) return "";

  const indianPhoneRegex = /^(?:\+91|91)?[6-9]\d{9}$/;
  if (!indianPhoneRegex.test(cleanPhone)) return null;

  if (cleanPhone.startsWith("91") && cleanPhone.length === 12) return `+${cleanPhone}`;
  if (!cleanPhone.startsWith("+91")) return `+91${cleanPhone}`;
  return cleanPhone;
}

async function resolveSeatLimit(company, connected) {
  const planName = company?.plan || "Free";
  const planDetails = connected ? await resolvePlanDetails(planName) : getFallbackPlanDetails(planName);
  return Number(planDetails?.maxUsers) || 5;
}

async function createEmployee(req, res) {
  const { name, email, password, phone, domain, location } = req.body;
  const companyId = req.user.companyId;
  const org = req.user.org;
  const parsedCompanyId = toObjectId(companyId);

  if (!name || !email) {
    return res.status(400).json({ success: false, message: "Name and email are required." });
  }

  const normalizedName = name.trim();
  const normalizedEmail = email.trim().toLowerCase();
  const formattedPhone = normalizePhone(phone);
  if (formattedPhone === null) {
    return res.status(400).json({
      success: false,
      message: "Phone number must be a valid 10-digit Indian number (e.g. +91 9876543210 or 9876543210)."
    });
  }

  let tempPassword = password ? String(password).trim() : "";
  if (!tempPassword) {
    tempPassword = generateTemporaryPassword();
  }

  const passwordValidation = validatePassword(tempPassword);
  if (!passwordValidation.valid) {
    return res.status(400).json({ success: false, message: passwordValidation.message });
  }

  try {
    let company = null;
    if (getIsConnected()) {
      company = await Company.findById(parsedCompanyId);
    } else {
      company = fallbackCompanies.find(c => c.id === companyId || c._id === companyId);
    }

    const maxUsers = await resolveSeatLimit(company, getIsConnected());
    let currentUsersCount = 0;

    if (getIsConnected()) {
      const UserModel = getTenantModel(parsedCompanyId, "User");
      const EmployeeModel = getTenantModel(parsedCompanyId, "Employee");
      const [userCount, employeeCount] = await Promise.all([
        UserModel.countDocuments({ companyId: parsedCompanyId, role: "Employee", status: { $ne: "Deleted" } }),
        EmployeeModel.countDocuments({ companyId: parsedCompanyId, status: { $ne: "Deleted" } })
      ]);
      currentUsersCount = Math.max(userCount, employeeCount);
    } else {
      currentUsersCount = fallbackUsers.filter(u => u.companyId === companyId && u.role === "Employee" && u.status !== "Deleted").length;
    }

    if (currentUsersCount >= maxUsers) {
      return res.status(400).json({
        success: false,
        message: `Your current plan restricts you to a maximum of ${maxUsers} employees. Please upgrade your subscription to add more employee seats.`
      });
    }

    const hashed = await bcrypt.hash(tempPassword, 10);
    const avatarColors = ["#6366f1", "#ec4899", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6"];
    const avatarColor = avatarColors[Math.floor(Math.random() * avatarColors.length)];

    if (getIsConnected()) {
      const existingUser = await User.findOne({ email: normalizedEmail }).setOptions({ bypassTenant: true });
      const existingEmployee = await Employee.findOne({ email: normalizedEmail }).setOptions({ bypassTenant: true });
      const existingUserInCompany = existingUser && String(existingUser.companyId || "") === String(parsedCompanyId || "");
      const existingEmployeeInCompany = existingEmployee && String(existingEmployee.companyId || "") === String(parsedCompanyId || "");

      if (existingUser && !existingUserInCompany) {
        return res.status(400).json({ success: false, message: "An account with this email address already exists in another company." });
      }

      if (existingEmployee && !existingEmployeeInCompany) {
        return res.status(400).json({ success: false, message: "An employee profile with this email address already exists in another company." });
      }

      if (existingUser && existingEmployee) {
        return res.status(400).json({
          success: false,
          message: "This employee already exists. Open the employee details page and use Resend Credentials to send the login email again."
        });
      }

      if (existingUser && !existingEmployee) {
        existingUser.password = hashed;
        existingUser.name = normalizedName;
        existingUser.role = "Employee";
        existingUser.companyId = parsedCompanyId;
        existingUser.org = org;
        existingUser.phone = formattedPhone;
        existingUser.domain = domain || "";
        existingUser.location = location || "";
        existingUser.status = "Active";
        existingUser.portalSetup = false;
        await existingUser.save();

        const EmployeeModel = getTenantModel(parsedCompanyId, "Employee");
        const repairedProfile = new EmployeeModel({
          authUserId: existingUser._id,
          name: normalizedName,
          email: normalizedEmail,
          companyId: parsedCompanyId,
          companyName: org,
          org,
          role: "Employee",
          phone: formattedPhone,
          domain: domain || "",
          location: location || "",
          avatarColor,
          status: "Active",
          portalSetup: false
        });
        await repairedProfile.save();

        let emailSent = false;
        let emailError = "";
        try {
          const portalUrl = getEmployeePortalUrl(req);
          const emailResult = await sendEmployeeCredentialsEmail(normalizedEmail, normalizedName, org, tempPassword, portalUrl, req.user.email);
          emailSent = emailResult.emailSent;
          emailError = emailResult.error || "";
        } catch (err) {
          emailError = err.message || String(err);
          console.error("Credentials email failed after repairing employee profile:", err);
        }

        await updateCompanyEmployeeCount(parsedCompanyId);

        return res.status(201).json({ success: true, data: repairedProfile.toObject(), emailSent, emailError });
      }

      if (!existingUser && existingEmployee) {
        const systemUser = new User({
          name: normalizedName,
          email: normalizedEmail,
          password: hashed,
          companyId: parsedCompanyId,
          org,
          role: "Employee",
          phone: formattedPhone,
          domain: domain || "",
          location: location || "",
          avatarColor: existingEmployee.avatarColor || avatarColor,
          status: "Active",
          portalSetup: false,
          mustChangePassword: true
        });
        await systemUser.save();

        existingEmployee.authUserId = systemUser._id;
        existingEmployee.name = normalizedName;
        existingEmployee.companyId = parsedCompanyId;
        existingEmployee.companyName = org;
        existingEmployee.org = org;
        existingEmployee.role = "Employee";
        existingEmployee.phone = formattedPhone;
        existingEmployee.domain = domain || "";
        existingEmployee.location = location || "";
        existingEmployee.status = "Active";
        existingEmployee.portalSetup = false;
        await existingEmployee.save();

        let emailSent = false;
        let emailError = "";
        try {
          const portalUrl = getEmployeePortalUrl(req);
          const emailResult = await sendEmployeeCredentialsEmail(normalizedEmail, normalizedName, org, tempPassword, portalUrl, req.user.email);
          emailSent = emailResult.emailSent;
          emailError = emailResult.error || "";
        } catch (err) {
          emailError = err.message || String(err);
          console.error("Credentials email failed after repairing auth user:", err);
        }

        await updateCompanyEmployeeCount(parsedCompanyId);

        return res.status(201).json({ success: true, data: existingEmployee.toObject(), emailSent, emailError });
      }

      const systemUser = new User({
        name: normalizedName,
        email: normalizedEmail,
        password: hashed,
        companyId: parsedCompanyId,
        org,
        role: "Employee",
        phone: formattedPhone,
        domain: domain || "",
        location: location || "",
        avatarColor,
        status: "Active",
        portalSetup: false,
        mustChangePassword: true
      });
      await systemUser.save();

      const EmployeeModel = getTenantModel(parsedCompanyId, "Employee");
      const employeeProfile = new EmployeeModel({
        authUserId: systemUser._id,
        name: normalizedName,
        email: normalizedEmail,
        companyId: parsedCompanyId,
        companyName: org,
        org,
        role: "Employee",
        phone: formattedPhone,
        domain: domain || "",
        location: location || "",
        avatarColor,
        status: "Active",
        portalSetup: false
      });
      await employeeProfile.save();

      const returnData = employeeProfile.toObject();

      let emailSent = false;
      let emailError = "";
      try {
        const portalUrl = getEmployeePortalUrl(req);
        const emailResult = await sendEmployeeCredentialsEmail(normalizedEmail, normalizedName, org, tempPassword, portalUrl, req.user.email);
        emailSent = emailResult.emailSent;
        emailError = emailResult.error || "";
      } catch (err) {
        emailError = err.message || String(err);
        console.error("Credentials email failed:", err);
      }

      await updateCompanyEmployeeCount(parsedCompanyId);

      return res.status(201).json({ success: true, data: returnData, emailSent, emailError });
    }

    const existing = fallbackUsers.find(u => u.email.toLowerCase() === normalizedEmail);
    if (existing) {
      return res.status(400).json({ success: false, message: "An account with this email address already exists." });
    }

    const employee = {
      id: `emp_${Date.now()}`,
      _id: `emp_${Date.now()}`,
      name: normalizedName,
      email: normalizedEmail,
      password: hashed,
      companyId,
      companyName: org,
      org,
      role: "Employee",
      phone: formattedPhone,
      domain: domain || "",
      location: location || "",
      avatarColor,
      status: "Active",
      portalSetup: false,
      mustChangePassword: true,
      date: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    };
    fallbackUsers.push(employee);
    const returnData = { ...employee };
    delete returnData.password;

    let emailSent = false;
    let emailError = "";
    try {
      const portalUrl = getEmployeePortalUrl(req);
      const emailResult = await sendEmployeeCredentialsEmail(normalizedEmail, normalizedName, org, tempPassword, portalUrl, req.user.email);
      emailSent = emailResult.emailSent;
      emailError = emailResult.error || "";
    } catch (err) {
      emailError = err.message || String(err);
      console.error("Credentials email failed in fallback store:", err);
    }

    await updateCompanyEmployeeCount(companyId);

    return res.status(201).json({ success: true, data: returnData, emailSent, emailError });
  } catch (err) {
    console.error("Error creating employee:", err);
    return res.status(500).json({
      success: false,
      message: "Server error during employee creation.",
      error: err.message
    });
  }
}

module.exports = { createEmployee };
