const { getOrCreateCompanySettings, verifyGpsLocation } = require('../services/gpsVerificationService');
const attendanceService = require('../services/attendanceService');
const asyncHandler = require('../utils/asyncHandler');

// GET /api/attendance/available-methods
const getAvailableMethods = asyncHandler(async (req, res) => {
  const companyId = req.user.companyId;
  const email = req.user.email;
  const employeeId = req.user.id;

  const settings = await getOrCreateCompanySettings(companyId, email);
  const todayRecord = await attendanceService.getTodayAttendanceRecord(companyId, email, employeeId);

  const hasCheckedIn = Boolean(todayRecord && todayRecord.checkIn && todayRecord.checkIn !== '-');
  const hasCheckedOut = Boolean(todayRecord && todayRecord.checkOut && todayRecord.checkOut !== '-');

  res.status(200).json({
    success: true,
    data: {
      attendanceEnabled: settings.attendanceEnabled !== false,
      methods: {
        qr: { enabled: settings.attendanceEnabled !== false && settings.methods?.qr?.enabled === true },
        gps: {
          enabled: settings.attendanceEnabled !== false && settings.methods?.gps?.enabled === true,
          maximumAcceptedAccuracy: settings.methods?.gps?.maximumAcceptedAccuracy || 50,
          locationTimeoutSeconds: settings.methods?.gps?.locationTimeoutSeconds || 12
        }
      },
      hasCheckedIn,
      hasCheckedOut,
      todayRecord
    }
  });
});

// POST /api/attendance/check-in/gps
const checkInGps = asyncHandler(async (req, res) => {
  const { latitude, longitude, accuracy, capturedAt } = req.body;
  const companyId = req.user.companyId;
  const email = req.user.email;
  const employeeId = req.user.id;
  const name = req.user.name;
  const org = req.user.org;

  try {
    // 1. Verify GPS location & office radius
    const verification = await verifyGpsLocation({
      companyId,
      latitude,
      longitude,
      accuracy,
      capturedAt
    });

    // 2. Perform check-in using common service
    const attendanceRecord = await attendanceService.startCheckIn({
      companyId,
      employeeId,
      email,
      name,
      org,
      method: 'gps',
      verification: {
        officeLocationId: verification.matchedOffice.officeId,
        latitude: verification.latitude,
        longitude: verification.longitude,
        accuracyMeters: verification.accuracyMeters,
        distanceMeters: verification.distanceMeters,
        deviceInfo: req.headers['user-agent'] || 'Mobile Browser'
      }
    });

    return res.status(200).json({
      success: true,
      message: 'Attendance Check-In verified successfully via GPS location.',
      data: attendanceRecord
    });
  } catch (err) {
    if (err.code) {
      return res.status(err.statusCode || 400).json({
        success: false,
        code: err.code,
        message: err.message,
        details: err.details || null
      });
    }
    throw err;
  }
});

module.exports = {
  getAvailableMethods,
  checkInGps
};
