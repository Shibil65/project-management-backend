const { getIsConnected } = require('../config/db');
const AttendanceSettings = require('../models/attendanceSettings.model');
const { fallbackAttendanceSettings } = require('../utils/fallbackStore');
const asyncHandler = require('../utils/asyncHandler');

// GET /api/attendance/settings
const getSettings = asyncHandler(async (req, res) => {
  const companyId = req.user.companyId;
  const email = req.user.email;

  if (getIsConnected()) {
    let settings = await AttendanceSettings.findOne({ companyId });
    if (!settings) {
      settings = new AttendanceSettings({
        companyId,
        qrAttendanceEnabled: false,
        qrExpiresInMinutes: 30,
        requireAdminPortalHeartbeat: true,
        createdBy: email
      });
      await settings.save();
    } else if (settings.qrExpiresInMinutes < 30) {
      settings.qrExpiresInMinutes = 30;
      await settings.save();
    }
    return res.status(200).json({ success: true, data: settings });
  }

  // Fallback Mode
  let settings = fallbackAttendanceSettings.find(s => s.companyId === companyId);
  if (!settings) {
    settings = {
      companyId,
      qrAttendanceEnabled: false,
      qrExpiresInMinutes: 30,
      requireAdminPortalHeartbeat: true,
      createdBy: email,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    fallbackAttendanceSettings.push(settings);
  } else if (settings.qrExpiresInMinutes < 30) {
    settings.qrExpiresInMinutes = 30;
  }
  return res.status(200).json({ success: true, data: settings });
});

// PATCH /api/attendance/settings
const updateSettings = asyncHandler(async (req, res) => {
  const companyId = req.user.companyId;
  const email = req.user.email;
  const { qrAttendanceEnabled, qrExpiresInMinutes, requireAdminPortalHeartbeat, heartbeatTimeoutSeconds } = req.body;

  if (getIsConnected()) {
    let settings = await AttendanceSettings.findOne({ companyId });
    if (!settings) {
      settings = new AttendanceSettings({ companyId, createdBy: email });
    }
    
    if (qrAttendanceEnabled !== undefined) settings.qrAttendanceEnabled = !!qrAttendanceEnabled;
    if (qrExpiresInMinutes !== undefined) settings.qrExpiresInMinutes = Math.max(30, Number(qrExpiresInMinutes));
    if (requireAdminPortalHeartbeat !== undefined) settings.requireAdminPortalHeartbeat = !!requireAdminPortalHeartbeat;
    if (heartbeatTimeoutSeconds !== undefined) settings.heartbeatTimeoutSeconds = Number(heartbeatTimeoutSeconds);
    settings.updatedBy = email;

    await settings.save();
    return res.status(200).json({ success: true, data: settings });
  }

  // Fallback Mode
  let settings = fallbackAttendanceSettings.find(s => s.companyId === companyId);
  if (!settings) {
    settings = { companyId, createdBy: email, createdAt: new Date() };
    fallbackAttendanceSettings.push(settings);
  }

  if (qrAttendanceEnabled !== undefined) settings.qrAttendanceEnabled = !!qrAttendanceEnabled;
  if (qrExpiresInMinutes !== undefined) settings.qrExpiresInMinutes = Math.max(30, Number(qrExpiresInMinutes));
  if (requireAdminPortalHeartbeat !== undefined) settings.requireAdminPortalHeartbeat = !!requireAdminPortalHeartbeat;
  if (heartbeatTimeoutSeconds !== undefined) settings.heartbeatTimeoutSeconds = Number(heartbeatTimeoutSeconds);
  settings.updatedBy = email;
  settings.updatedAt = new Date();

  return res.status(200).json({ success: true, data: settings });
});

module.exports = {
  getSettings,
  updateSettings
};
