const CompanyAttendanceSettings = require('../models/CompanyAttendanceSettings');
const AttendanceSettings = require('../models/attendanceSettings.model');
const { getIsConnected } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');

// GET /api/company/attendance-settings
const getAttendanceSettings = asyncHandler(async (req, res) => {
  const companyId = req.user.companyId;

  if (getIsConnected()) {
    let settings = await CompanyAttendanceSettings.findOne({ companyId });
    if (!settings) {
      // Check if legacy settings existed
      const legacy = await AttendanceSettings.findOne({ companyId });
      const qrEnabled = legacy ? !!legacy.qrAttendanceEnabled : false;

      settings = new CompanyAttendanceSettings({
        companyId,
        attendanceEnabled: true,
        methods: {
          qr: { enabled: qrEnabled },
          gps: { enabled: false, maximumAcceptedAccuracy: 50, locationTimeoutSeconds: 12 }
        },
        createdBy: req.user.email
      });
      await settings.save();
    }
    return res.status(200).json({ success: true, data: settings });
  }

  // Fallback
  return res.status(200).json({
    success: true,
    data: {
      companyId,
      attendanceEnabled: true,
      methods: {
        qr: { enabled: false },
        gps: { enabled: false, maximumAcceptedAccuracy: 50, locationTimeoutSeconds: 12 }
      }
    }
  });
});

// PATCH /api/company/attendance-settings
const updateAttendanceSettings = asyncHandler(async (req, res) => {
  const companyId = req.user.companyId;
  const { attendanceEnabled, methods } = req.body;

  if (getIsConnected()) {
    let settings = await CompanyAttendanceSettings.findOne({ companyId });
    if (!settings) {
      settings = new CompanyAttendanceSettings({ companyId, createdBy: req.user.email });
    }

    if (attendanceEnabled !== undefined) {
      settings.attendanceEnabled = !!attendanceEnabled;
    }

    if (methods) {
      if (methods.qr && methods.qr.enabled !== undefined) {
        settings.methods.qr.enabled = !!methods.qr.enabled;

        // Sync legacy AttendanceSettings model for backward compatibility
        let legacy = await AttendanceSettings.findOne({ companyId });
        if (!legacy) {
          legacy = new AttendanceSettings({ companyId, createdBy: req.user.email });
        }
        legacy.qrAttendanceEnabled = !!methods.qr.enabled;
        await legacy.save();
      }

      if (methods.gps) {
        if (methods.gps.enabled !== undefined) {
          settings.methods.gps.enabled = !!methods.gps.enabled;
        }
        if (methods.gps.maximumAcceptedAccuracy !== undefined) {
          const val = Number(methods.gps.maximumAcceptedAccuracy);
          if (!isNaN(val) && val > 0) {
            settings.methods.gps.maximumAcceptedAccuracy = val;
          }
        }
        if (methods.gps.locationTimeoutSeconds !== undefined) {
          const val = Number(methods.gps.locationTimeoutSeconds);
          if (!isNaN(val) && val > 0) {
            settings.methods.gps.locationTimeoutSeconds = val;
          }
        }
      }
    }

    settings.updatedBy = req.user.email;
    await settings.save();

    return res.status(200).json({ success: true, data: settings, message: 'Attendance settings updated successfully.' });
  }

  return res.status(200).json({
    success: true,
    data: {
      companyId,
      attendanceEnabled: attendanceEnabled !== undefined ? !!attendanceEnabled : true,
      methods: methods || { qr: { enabled: false }, gps: { enabled: false, maximumAcceptedAccuracy: 50, locationTimeoutSeconds: 12 } }
    },
    message: 'Attendance settings updated (fallback mode).'
  });
});

module.exports = {
  getAttendanceSettings,
  updateAttendanceSettings
};
