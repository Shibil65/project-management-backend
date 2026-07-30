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
        qrAttendanceEnabled: true,
        qrExpiresInMinutes: 30,
        requireAdminPortalHeartbeat: true,
        methods: {
          qr: { enabled: true },
          gps: { enabled: false }
        },
        createdBy: email
      });
      await settings.save();
    }
    return res.status(200).json({ success: true, data: settings });
  }

  // Fallback Mode
  let settings = fallbackAttendanceSettings.find(s => s.companyId === companyId || s.companyId === companyId?.toString());
  if (!settings) {
    settings = {
      companyId: companyId ? companyId.toString() : '',
      qrAttendanceEnabled: true,
      qrExpiresInMinutes: 30,
      requireAdminPortalHeartbeat: true,
      methods: {
        qr: { enabled: true },
        gps: { enabled: false }
      },
      createdBy: email,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    fallbackAttendanceSettings.push(settings);
  }
  return res.status(200).json({ success: true, data: settings });
});

// PATCH /api/attendance/settings
const updateSettings = asyncHandler(async (req, res) => {
  const companyId = req.user.companyId;
  const email = req.user.email;
  const {
    attendanceEnabled,
    qrAttendanceEnabled,
    qrExpiresInMinutes,
    requireAdminPortalHeartbeat,
    heartbeatTimeoutSeconds,
    methods
  } = req.body;

  if (getIsConnected()) {
    let settings = await AttendanceSettings.findOne({ companyId });
    if (!settings) {
      settings = new AttendanceSettings({ companyId, createdBy: email });
    }
    
    if (attendanceEnabled !== undefined) settings.attendanceEnabled = !!attendanceEnabled;
    if (qrAttendanceEnabled !== undefined) {
      settings.qrAttendanceEnabled = !!qrAttendanceEnabled;
      if (!settings.methods) settings.methods = { qr: { enabled: true }, gps: { enabled: false } };
      if (!settings.methods.qr) settings.methods.qr = { enabled: true };
      settings.methods.qr.enabled = !!qrAttendanceEnabled;
    }
    if (qrExpiresInMinutes !== undefined) {
      const val = Number(qrExpiresInMinutes);
      settings.qrExpiresInMinutes = (!isNaN(val) && val >= 0.1) ? val : 30;
    }
    if (requireAdminPortalHeartbeat !== undefined) settings.requireAdminPortalHeartbeat = !!requireAdminPortalHeartbeat;
    if (heartbeatTimeoutSeconds !== undefined) settings.heartbeatTimeoutSeconds = Number(heartbeatTimeoutSeconds);

    if (methods) {
      if (!settings.methods) settings.methods = { qr: { enabled: true }, gps: { enabled: false } };
      if (methods.qr) {
        if (!settings.methods.qr) settings.methods.qr = {};
        if (methods.qr.enabled !== undefined) settings.methods.qr.enabled = !!methods.qr.enabled;
      }
      if (methods.gps) {
        if (!settings.methods.gps) settings.methods.gps = {};
        if (methods.gps.enabled !== undefined) settings.methods.gps.enabled = !!methods.gps.enabled;
        if (methods.gps.maximumAcceptedAccuracy !== undefined) settings.methods.gps.maximumAcceptedAccuracy = Number(methods.gps.maximumAcceptedAccuracy);
        if (methods.gps.defaultRadiusMeters !== undefined) settings.methods.gps.defaultRadiusMeters = Number(methods.gps.defaultRadiusMeters);
        if (methods.gps.requireRadarVerification !== undefined) settings.methods.gps.requireRadarVerification = !!methods.gps.requireRadarVerification;
        if (methods.gps.allowLocalFallback !== undefined) settings.methods.gps.allowLocalFallback = !!methods.gps.allowLocalFallback;
      }
    }

    settings.updatedBy = email;
    // Mark modified for nested objects in Mongoose
    settings.markModified('methods');
    await settings.save();
    return res.status(200).json({ success: true, data: settings });
  }

  // Fallback Mode
  let settings = fallbackAttendanceSettings.find(s => s.companyId === companyId || s.companyId === companyId?.toString());
  if (!settings) {
    settings = {
      companyId: companyId ? companyId.toString() : '',
      createdBy: email,
      createdAt: new Date(),
      methods: { qr: { enabled: true }, gps: { enabled: false } }
    };
    fallbackAttendanceSettings.push(settings);
  }

  if (attendanceEnabled !== undefined) settings.attendanceEnabled = !!attendanceEnabled;
  if (qrAttendanceEnabled !== undefined) {
    settings.qrAttendanceEnabled = !!qrAttendanceEnabled;
    if (!settings.methods) settings.methods = { qr: { enabled: true }, gps: { enabled: false } };
    if (!settings.methods.qr) settings.methods.qr = { enabled: true };
    settings.methods.qr.enabled = !!qrAttendanceEnabled;
  }
  if (qrExpiresInMinutes !== undefined) {
    const val = Number(qrExpiresInMinutes);
    settings.qrExpiresInMinutes = (!isNaN(val) && val >= 0.1) ? val : 30;
  }
  if (requireAdminPortalHeartbeat !== undefined) settings.requireAdminPortalHeartbeat = !!requireAdminPortalHeartbeat;
  if (heartbeatTimeoutSeconds !== undefined) settings.heartbeatTimeoutSeconds = Number(heartbeatTimeoutSeconds);

  if (methods) {
    if (!settings.methods) settings.methods = { qr: { enabled: true }, gps: { enabled: false } };
    if (methods.qr) {
      if (!settings.methods.qr) settings.methods.qr = {};
      if (methods.qr.enabled !== undefined) settings.methods.qr.enabled = !!methods.qr.enabled;
    }
    if (methods.gps) {
      if (!settings.methods.gps) settings.methods.gps = {};
      if (methods.gps.enabled !== undefined) settings.methods.gps.enabled = !!methods.gps.enabled;
      if (methods.gps.maximumAcceptedAccuracy !== undefined) settings.methods.gps.maximumAcceptedAccuracy = Number(methods.gps.maximumAcceptedAccuracy);
      if (methods.gps.defaultRadiusMeters !== undefined) settings.methods.gps.defaultRadiusMeters = Number(methods.gps.defaultRadiusMeters);
      if (methods.gps.requireRadarVerification !== undefined) settings.methods.gps.requireRadarVerification = !!methods.gps.requireRadarVerification;
      if (methods.gps.allowLocalFallback !== undefined) settings.methods.gps.allowLocalFallback = !!methods.gps.allowLocalFallback;
    }
  }

  settings.updatedBy = email;
  settings.updatedAt = new Date();

  return res.status(200).json({ success: true, data: settings });
});

module.exports = {
  getSettings,
  updateSettings
};
