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
const { resolvePlanDetails, getFallbackPlanDetails, normalizePlanName } = require("../../utils/planResolver");

function parseOptionalNumber(value) {
  if (value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function parseCoordinate(value, min, max) {
  const number = parseOptionalNumber(value);
  if (number === null) return null;
  if (number === undefined || number < min || number > max) return undefined;
  return number;
}

function parseRadius(value) {
  const number = parseOptionalNumber(value);
  if (number === null) return 200;
  if (number === undefined) return undefined;
  const rounded = Math.round(number);
  if (rounded < 10 || rounded > 10000) return undefined;
  return rounded;
}

function isValidTime(value) {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function buildAttendanceSettings(reqBody, res) {
  const updates = {};
  const hasLatitudeField = Object.prototype.hasOwnProperty.call(reqBody, "gpsLatitude");
  const hasLongitudeField = Object.prototype.hasOwnProperty.call(reqBody, "gpsLongitude");

  if (hasLatitudeField !== hasLongitudeField) {
    res.status(400).json({
      success: false,
      message: "Office latitude and longitude must be saved together. Clear both fields to disable GPS geofencing."
    });
    return null;
  }

  if (hasLatitudeField) {
    const lat = parseCoordinate(reqBody.gpsLatitude, -90, 90);
    if (lat === undefined) {
      res.status(400).json({ success: false, message: "Office latitude must be a valid number between -90 and 90." });
      return null;
    }
    updates.gpsLatitude = lat;
  }

  if (hasLongitudeField) {
    const lon = parseCoordinate(reqBody.gpsLongitude, -180, 180);
    if (lon === undefined) {
      res.status(400).json({ success: false, message: "Office longitude must be a valid number between -180 and 180." });
      return null;
    }
    updates.gpsLongitude = lon;
  }

  if (hasLatitudeField && hasLongitudeField) {
    const latCleared = updates.gpsLatitude === null;
    const lonCleared = updates.gpsLongitude === null;
    if (latCleared !== lonCleared) {
      res.status(400).json({
        success: false,
        message: "Office latitude and longitude must either both be valid numbers or both be blank."
      });
      return null;
    }
  }

  if (reqBody.gpsRadius !== undefined) {
    const radius = parseRadius(reqBody.gpsRadius);
    if (radius === undefined) {
      res.status(400).json({ success: false, message: "GPS radius must be between 10 and 10000 meters." });
      return null;
    }
    updates.gpsRadius = radius;
  }

  if (reqBody.attendancePortalEnabled !== undefined) updates.attendancePortalEnabled = Boolean(reqBody.attendancePortalEnabled);

  if (reqBody.attendancePortalOpenTime !== undefined) {
    if (!isValidTime(reqBody.attendancePortalOpenTime)) {
      res.status(400).json({ success: false, message: "Portal open time must use HH:mm format." });
      return null;
    }
    updates.attendancePortalOpenTime = reqBody.attendancePortalOpenTime;
  }

  if (reqBody.attendancePortalCloseTime !== undefined) {
    if (!isValidTime(reqBody.attendancePortalCloseTime)) {
      res.status(400).json({ success: false, message: "Portal close time must use HH:mm format." });
      return null;
    }
    updates.attendancePortalCloseTime = reqBody.attendancePortalCloseTime;
  }

  return updates;
}

async function selectPlan(req, res) {
  const {
    id
  } = req.params;
  const {
    plan,
    users,
    billingName,
    billingEmail,
    billingPhone,
    billingAddress,
    logo,
    autopay
  } = req.body;

  const attendanceSettings = buildAttendanceSettings(req.body, res);
  if (!attendanceSettings) return;

  let billing = undefined;
  let enforcedUsers = users !== undefined ? Number(users) : undefined;
  let selectedPlanDetails = null;
  if (plan !== undefined) {
    selectedPlanDetails = getIsConnected()
      ? await resolvePlanDetails(plan)
      : getFallbackPlanDetails(plan);
    billing = Number(selectedPlanDetails?.price) || 0;

    if (normalizePlanName(plan) === "free" && enforcedUsers !== undefined && enforcedUsers > 5) {
      return res.status(400).json({
        success: false,
        message: "Free plan is limited to a maximum of 5 employees."
      });
    }
  }
  if (getIsConnected()) {
    try {
      const company = await Company.findById(id);
      if (!company) {
        return res.status(404).json({
          success: false,
          message: "Company not found."
        });
      }
      if (plan !== undefined) company.plan = plan;
      if (enforcedUsers !== undefined) company.users = enforcedUsers;
      if (billing !== undefined) company.billing = billing;
      if (billingName !== undefined) company.billingName = billingName;
      if (billingEmail !== undefined) company.billingEmail = billingEmail;
      if (billingPhone !== undefined) company.billingPhone = billingPhone;
      if (billingAddress !== undefined) company.billingAddress = billingAddress;
      if (logo !== undefined) company.logo = logo;
      if (autopay !== undefined) company.autopay = autopay;
      Object.assign(company, attendanceSettings);
      await company.save();
      return res.status(200).json({
        success: true,
        message: "Subscription, billing & GPS geofencing updated successfully.",
        data: company
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({
        success: false,
        message: "Database error updating subscription, billing & GPS details."
      });
    }
  }
  const company = fallbackCompanies.find(c => c.id === id);
  if (company) {
    if (plan !== undefined) company.plan = plan;
    if (enforcedUsers !== undefined) company.users = enforcedUsers;
    if (billing !== undefined) company.billing = billing;
    if (billingName !== undefined) company.billingName = billingName;
    if (billingEmail !== undefined) company.billingEmail = billingEmail;
    if (billingPhone !== undefined) company.billingPhone = billingPhone;
    if (billingAddress !== undefined) company.billingAddress = billingAddress;
    if (logo !== undefined) company.logo = logo;
    if (autopay !== undefined) company.autopay = autopay;
    Object.assign(company, attendanceSettings);
    return res.status(200).json({
      success: true,
      message: "Subscription & billing updated in fallback store.",
      data: company
    });
  }
  return res.status(404).json({
    success: false,
    message: "Company not found in datastore."
  });
}

module.exports = { selectPlan };
