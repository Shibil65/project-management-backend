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
  if (value === "" || value === null || value === undefined) return true;
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function normalizeIpEntry(value) {
  return String(value || '').trim();
}

function isValidIpv4(value) {
  const parts = String(value || '').split('.');
  return parts.length === 4 && parts.every(part => {
    if (!/^\d+$/.test(part)) return false;
    const number = Number(part);
    return number >= 0 && number <= 255 && String(number) === String(Number(part));
  });
}

function isValidIpv4OrCidr(value) {
  const entry = normalizeIpEntry(value);
  if (!entry) return false;
  if (!entry.includes('/')) return isValidIpv4(entry);
  const [ip, prefix] = entry.split('/');
  const prefixNumber = Number(prefix);
  return isValidIpv4(ip) && Number.isInteger(prefixNumber) && prefixNumber >= 0 && prefixNumber <= 32;
}

function parsePublicIpList(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeIpEntry).filter(Boolean);
  }
  return String(value || '')
    .split(/[\n,]/)
    .map(normalizeIpEntry)
    .filter(Boolean);
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

  if (reqBody.gpsTrackingEnabled !== undefined) updates.gpsTrackingEnabled = Boolean(reqBody.gpsTrackingEnabled);

  if (reqBody.attendancePortalEnabled !== undefined) updates.attendancePortalEnabled = Boolean(reqBody.attendancePortalEnabled);

  if (reqBody.manualCheckInEnabled !== undefined) updates.manualCheckInEnabled = Boolean(reqBody.manualCheckInEnabled);

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

  const updateFields = {};
  if (plan !== undefined) updateFields.plan = plan;
  if (enforcedUsers !== undefined) updateFields.users = enforcedUsers;
  if (billing !== undefined) updateFields.billing = billing;
  if (billingName !== undefined) updateFields.billingName = billingName;
  if (billingEmail !== undefined) updateFields.billingEmail = billingEmail;
  if (billingPhone !== undefined) updateFields.billingPhone = billingPhone;
  if (billingAddress !== undefined) updateFields.billingAddress = billingAddress;
  if (logo !== undefined) updateFields.logo = logo;
  if (autopay !== undefined) updateFields.autopay = autopay;
  Object.assign(updateFields, attendanceSettings);

  if (getIsConnected()) {
    try {
      const company = await Company.findByIdAndUpdate(
        id,
        { $set: updateFields },
        { new: true, runValidators: true }
      );
      if (!company) {
        return res.status(404).json({
          success: false,
          message: "Company not found."
        });
      }
      return res.status(200).json({
        success: true,
        message: "Subscription, billing & attendance settings updated successfully.",
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
  const company = fallbackCompanies.find(c => String(c.id || c._id) === String(id));
  if (company) {
    Object.assign(company, updateFields);
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
