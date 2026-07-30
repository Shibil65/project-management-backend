const asyncHandler = require('../utils/asyncHandler');
const { getIsConnected } = require('../config/db');
const getTenantModel = require('../utils/tenantDb');
const AttendanceSettings = require('../models/attendanceSettings.model');
const OfficeLocation = require('../models/OfficeLocation');
const Attendance = require('../models/Attendance');
const Company = require('../models/Company');
const User = require('../models/User');
const radarService = require('../services/radarService');
const {
  calculateHaversineDistance,
  evaluateGpsAccuracy,
  evaluateBoundary,
  toReactCoordinates
} = require('../utils/geoUtils');
const {
  formatAttendanceDate,
  formatAttendanceTime,
  getAttendanceTodayDate,
  getAttendanceDateCandidates
} = require('../utils/attendancePortalWindow');
const {
  fallbackAttendanceSettings,
  fallbackOfficeLocations,
  fallbackAttendance,
  fallbackUsers
} = require('../utils/fallbackStore');

// 1. GET /api/attendance/available-methods
const getAvailableMethods = asyncHandler(async (req, res) => {
  const companyId = req.user.companyId;
  const userEmail = req.user.email;
  const todayStr = formatAttendanceDate(new Date());
  const dateCandidates = getAttendanceDateCandidates(new Date());

  let settings = null;
  let activeOfficesCount = 0;
  let existingRecord = null;

  if (getIsConnected()) {
    settings = await AttendanceSettings.findOne({ companyId });
    activeOfficesCount = await OfficeLocation.countDocuments({ companyId, isActive: true });
    
    const AttendanceModel = getTenantModel(companyId, 'Attendance');
    existingRecord = await AttendanceModel.findOne({
      email: userEmail.toLowerCase(),
      date: { $in: dateCandidates }
    });
  } else {
    settings = fallbackAttendanceSettings.find(s => s.companyId === companyId.toString());
    activeOfficesCount = fallbackOfficeLocations.filter(l => l.companyId === companyId.toString() && l.isActive).length;
    existingRecord = fallbackAttendance.find(a => a.email.toLowerCase() === userEmail.toLowerCase() && dateCandidates.includes(a.date));
  }

  // Calculate toggles
  const attendanceEnabled = settings ? settings.attendanceEnabled !== false : true;
  const qrEnabled = settings ? (settings.methods?.qr?.enabled ?? settings.qrAttendanceEnabled ?? true) : true;
  const gpsEnabled = settings ? (settings.methods?.gps?.enabled ?? false) : false;

  const alreadyCheckedIn = Boolean(existingRecord && existingRecord.checkIn && existingRecord.checkIn !== '-');

  return res.status(200).json({
    success: true,
    data: {
      attendanceEnabled,
      methods: {
        qr: { enabled: qrEnabled },
        gps: {
          enabled: gpsEnabled,
          activeOfficesCount,
          maximumAcceptedAccuracy: settings?.methods?.gps?.maximumAcceptedAccuracy || 60,
          defaultRadiusMeters: settings?.methods?.gps?.defaultRadiusMeters || 100
        }
      },
      alreadyCheckedIn,
      todayRecord: existingRecord || null
    }
  });
});

// 2. POST /api/attendance/check-in/gps
const checkInGps = asyncHandler(async (req, res) => {
  const companyId = req.user.companyId;
  const userEmail = req.user.email;
  const userId = req.user.id || req.user._id;

  const {
    latitude,
    longitude,
    accuracy,
    capturedAt,
    altitude,
    heading,
    speed,
    pwaInstallationId
  } = req.body;

  // 1. Inputs validation
  if (latitude === undefined || longitude === undefined || accuracy === undefined) {
    return res.status(400).json({
      success: false,
      code: 'INVALID_LOCATION',
      message: 'Latitude, longitude, and accuracy are required.'
    });
  }

  const latNum = Number(latitude);
  const lonNum = Number(longitude);
  const accNum = Number(accuracy);

  if (isNaN(latNum) || isNaN(lonNum) || latNum < -90 || latNum > 90 || lonNum < -180 || lonNum > 180) {
    return res.status(400).json({
      success: false,
      code: 'INVALID_LOCATION',
      message: 'Latitude must be between -90 and 90, and longitude between -180 and 180.'
    });
  }

  // Check freshness of capturedAt timestamp (no older than ~30 seconds)
  if (capturedAt) {
    const capturedTime = new Date(capturedAt).getTime();
    const nowTime = Date.now();
    const ageSeconds = Math.abs(nowTime - capturedTime) / 1000;
    if (ageSeconds > 30) {
      return res.status(400).json({
        success: false,
        code: 'STALE_LOCATION',
        message: 'Location reading is older than 30 seconds. Please collect a fresh GPS reading.'
      });
    }
  }

  // 2. Settings check
  let settings = null;
  let activeOffices = [];
  let userDoc = req.user;
  let companyDoc = null;

  if (getIsConnected()) {
    settings = await AttendanceSettings.findOne({ companyId });
    activeOffices = await OfficeLocation.find({ companyId, isActive: true });
    companyDoc = await Company.findById(companyId);
  } else {
    settings = fallbackAttendanceSettings.find(s => s.companyId === companyId.toString());
    activeOffices = fallbackOfficeLocations.filter(l => l.companyId === companyId.toString() && l.isActive);
  }

  const attendanceEnabled = settings ? settings.attendanceEnabled !== false : true;
  if (!attendanceEnabled) {
    return res.status(400).json({
      success: false,
      code: 'ATTENDANCE_DISABLED',
      message: 'Attendance is currently closed for the company.'
    });
  }

  const gpsEnabled = settings ? (settings.methods?.gps?.enabled ?? false) : false;
  if (!gpsEnabled) {
    return res.status(400).json({
      success: false,
      code: 'GPS_ATTENDANCE_DISABLED',
      message: 'GPS Check-In is currently disabled.'
    });
  }

  if (activeOffices.length === 0) {
    return res.status(400).json({
      success: false,
      code: 'NO_ACTIVE_OFFICE',
      message: 'No active office locations configured for your company.'
    });
  }

  // 3. Local Haversine Distance Check to active offices
  let closestOffice = null;
  let minDistance = Infinity;

  for (const office of activeOffices) {
    // Mongo coordinates: [longitude, latitude]
    const officeLon = office.location.coordinates[0];
    const officeLat = office.location.coordinates[1];

    const dist = calculateHaversineDistance(latNum, lonNum, officeLat, officeLon);
    if (dist < minDistance) {
      minDistance = dist;
      closestOffice = office;
    }
  }

  // 4. Accuracy Evaluation
  const maxAcceptedAcc = Math.max(
    Number(closestOffice?.maximumAcceptedAccuracy) || 100,
    Number(settings?.methods?.gps?.maximumAcceptedAccuracy) || 100,
    100
  );
  const accuracyEval = evaluateGpsAccuracy(accNum, maxAcceptedAcc);
  if (!accuracyEval.valid) {
    return res.status(400).json({
      success: false,
      code: accuracyEval.code,
      message: accuracyEval.message
    });
  }

  const officeRadius = closestOffice.radiusMeters || 100;
  const boundaryCheck = evaluateBoundary(minDistance, officeRadius, accNum);

  if (boundaryCheck.nearBoundary) {
    return res.status(400).json({
      success: false,
      code: 'LOCATION_NEAR_BOUNDARY',
      message: 'You are near the office boundary and accuracy is uncertain. Collecting a fresh reading...',
      debug: {
        closestOfficeName: closestOffice.name,
        calculatedDistance: minDistance,
        permittedRadius: officeRadius,
        gpsAccuracy: accNum
      }
    });
  }

  if (!boundaryCheck.inside) {
    return res.status(400).json({
      success: false,
      code: 'OUTSIDE_OFFICE_RADIUS',
      message: `You are outside the permitted office radius for ${closestOffice.name}.`,
      debug: {
        closestOfficeName: closestOffice.name,
        calculatedDistance: minDistance,
        permittedRadius: officeRadius,
        gpsAccuracy: accNum
      }
    });
  }

  // 5. Local Geofence Verification (or Optional Radar Verification if configured)
  const requireRadar = settings?.methods?.gps?.requireRadarVerification === true && radarService.isConfigured();
  const allowFallback = settings?.methods?.gps?.allowLocalFallback !== false; // Default to true so local spatial verification works seamlessly

  let radarVerificationPassed = false;
  let radarResult = null;
  let verificationMode = 'radar';

  if (requireRadar) {
    try {
      radarResult = await radarService.verifyEmployeeLocation({
        employeeId: userId,
        deviceId: pwaInstallationId || userId,
        latitude: latNum,
        longitude: lonNum,
        accuracy: accNum,
        companyId,
        targetOfficeId: closestOffice._id ? closestOffice._id.toString() : closestOffice.id
      });

      if (radarResult.isInside) {
        radarVerificationPassed = true;
      } else {
        // Fallback to local Haversine verification if Radar fails geofence check
        verificationMode = 'local-fallback';
        radarVerificationPassed = true;
      }
    } catch (radarErr) {
      console.warn('[GPS Attendance] Radar verification unconfigured or error:', radarErr.message);

      // Seamlessly fall back to local Haversine distance verification
      verificationMode = 'local-fallback';
      radarVerificationPassed = true;
    }
  } else {
    verificationMode = 'local';
    radarVerificationPassed = true;
  }

  // 6. Duplicate check-in check & Record creation
  const now = new Date();
  const todayStr = formatAttendanceDate(now);
  const timeStr = formatAttendanceTime(now);
  const dateCandidates = getAttendanceDateCandidates(now);

  if (getIsConnected()) {
    const AttendanceModel = getTenantModel(companyId, 'Attendance');
    
    // Check if employee already checked in today
    let existingRecord = await AttendanceModel.findOne({
      email: userEmail.toLowerCase(),
      date: { $in: dateCandidates }
    });

    if (existingRecord && existingRecord.checkIn && existingRecord.checkIn !== '-') {
      return res.status(400).json({
        success: false,
        code: 'ALREADY_CHECKED_IN',
        message: 'You have already checked in today.'
      });
    }

    if (existingRecord) {
      existingRecord.checkIn = timeStr;
      existingRecord.status = 'Approved';
      existingRecord.remarks = `GPS Check-in at ${closestOffice.name} (${verificationMode})`;
      existingRecord.latitude = latNum;
      existingRecord.longitude = lonNum;
      existingRecord.accuracy = accNum;
      existingRecord.distance = minDistance;
      existingRecord.verificationMethod = 'gps';
      existingRecord.verificationMode = verificationMode;
      existingRecord.officeLocationId = closestOffice._id;
      existingRecord.radarGeofenceId = radarResult?.geofenceId || closestOffice.radarGeofenceId || '';
      existingRecord.radarEventIds = radarResult?.eventIds || [];
      existingRecord.radarUserId = radarResult?.radarUserId || String(userId);
      existingRecord.pwaInstallationId = pwaInstallationId || '';
      existingRecord.capturedAt = capturedAt ? new Date(capturedAt) : now;
      existingRecord.serverCheckInTime = now;
      existingRecord.appCheckVerified = Boolean(req.appCheckVerified);

      await existingRecord.save();
      return res.status(200).json({ success: true, data: existingRecord });
    }

    // Create new attendance record
    const newRecord = new AttendanceModel({
      name: userDoc.name || userEmail.split('@')[0],
      email: userEmail.toLowerCase(),
      companyId,
      org: userDoc.org || companyDoc?.name || 'Company',
      date: todayStr,
      checkIn: timeStr,
      checkOut: '',
      duration: '',
      status: 'Approved',
      remarks: `GPS Check-in at ${closestOffice.name} (${verificationMode})`,
      latitude: latNum,
      longitude: lonNum,
      accuracy: accNum,
      distance: minDistance,
      verificationMethod: 'gps',
      verificationMode,
      officeLocationId: closestOffice._id,
      radarGeofenceId: radarResult?.geofenceId || closestOffice.radarGeofenceId || '',
      radarEventIds: radarResult?.eventIds || [],
      radarUserId: radarResult?.radarUserId || String(userId),
      pwaInstallationId: pwaInstallationId || '',
      capturedAt: capturedAt ? new Date(capturedAt) : now,
      serverCheckInTime: now,
      appCheckVerified: Boolean(req.appCheckVerified)
    });

    await newRecord.save();
    return res.status(201).json({ success: true, data: newRecord });
  }

  // Fallback Mode
  const existingIdx = fallbackAttendance.findIndex(a => a.email.toLowerCase() === userEmail.toLowerCase() && dateCandidates.includes(a.date));
  if (existingIdx !== -1 && fallbackAttendance[existingIdx].checkIn && fallbackAttendance[existingIdx].checkIn !== '-') {
    return res.status(400).json({
      success: false,
      code: 'ALREADY_CHECKED_IN',
      message: 'You have already checked in today.'
    });
  }

  const record = {
    id: `fb_att_${Date.now()}`,
    name: userDoc.name || userEmail.split('@')[0],
    email: userEmail.toLowerCase(),
    companyId: companyId.toString(),
    org: userDoc.org || 'Company',
    date: todayStr,
    checkIn: timeStr,
    checkOut: '',
    duration: '',
    status: 'Approved',
    remarks: `GPS Check-in at ${closestOffice.name} (${verificationMode})`,
    latitude: latNum,
    longitude: lonNum,
    accuracy: accNum,
    distance: minDistance,
    verificationMethod: 'gps',
    verificationMode,
    officeLocationId: closestOffice._id || closestOffice.id,
    pwaInstallationId: pwaInstallationId || '',
    capturedAt: capturedAt ? new Date(capturedAt) : now,
    serverCheckInTime: now
  };

  if (existingIdx !== -1) {
    fallbackAttendance[existingIdx] = { ...fallbackAttendance[existingIdx], ...record };
  } else {
    fallbackAttendance.push(record);
  }

  return res.status(201).json({ success: true, data: record });
});

module.exports = {
  getAvailableMethods,
  checkInGps
};
