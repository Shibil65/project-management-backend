const OfficeLocation = require('../models/OfficeLocation');
const CompanyAttendanceSettings = require('../models/CompanyAttendanceSettings');
const { getIsConnected } = require('../config/db');
const calculateDistanceMeters = require('../utils/calculateDistanceMeters');

async function getOrCreateCompanySettings(companyId, userEmail = '') {
  if (getIsConnected()) {
    let settings = await CompanyAttendanceSettings.findOne({ companyId });
    if (!settings) {
      settings = new CompanyAttendanceSettings({
        companyId,
        attendanceEnabled: true,
        methods: {
          qr: { enabled: false },
          gps: { enabled: false, maximumAcceptedAccuracy: 50, locationTimeoutSeconds: 12 }
        },
        createdBy: userEmail
      });
      await settings.save();
    }
    return settings;
  }

  return {
    companyId,
    attendanceEnabled: true,
    methods: {
      qr: { enabled: false },
      gps: { enabled: false, maximumAcceptedAccuracy: 50, locationTimeoutSeconds: 12 }
    }
  };
}

async function verifyGpsLocation({
  companyId,
  latitude,
  longitude,
  accuracy,
  capturedAt
}) {
  const settings = await getOrCreateCompanySettings(companyId);

  // 1. Check Global Attendance Enabled
  if (settings.attendanceEnabled === false) {
    const err = new Error('Attendance is currently closed by your company.');
    err.code = 'ATTENDANCE_DISABLED';
    err.statusCode = 400;
    throw err;
  }

  // 2. Check GPS Attendance Enabled
  if (!settings.methods?.gps?.enabled) {
    const err = new Error('GPS Attendance is currently disabled for your company.');
    err.code = 'GPS_ATTENDANCE_DISABLED';
    err.statusCode = 400;
    throw err;
  }

  // 3. Validate Latitude & Longitude Range
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    const err = new Error('Invalid GPS coordinates provided.');
    err.code = 'INVALID_LOCATION';
    err.statusCode = 400;
    throw err;
  }

  // 4. Validate Accuracy
  const acc = Number(accuracy);
  if (isNaN(acc) || acc <= 0) {
    const err = new Error('Invalid GPS accuracy reading.');
    err.code = 'LOW_LOCATION_ACCURACY';
    err.statusCode = 400;
    throw err;
  }

  const maxAcc = settings.methods?.gps?.maximumAcceptedAccuracy || 50;
  if (acc > maxAcc) {
    const err = new Error(`GPS accuracy (${Math.round(acc)}m) exceeds maximum accepted accuracy of ${maxAcc}m.`);
    err.code = 'LOW_LOCATION_ACCURACY';
    err.statusCode = 400;
    err.details = { currentAccuracy: acc, maxAcceptedAccuracy: maxAcc };
    throw err;
  }

  // 5. Validate capturedAt timestamp freshness
  if (capturedAt) {
    const capturedTime = new Date(capturedAt).getTime();
    const nowTime = Date.now();
    if (isNaN(capturedTime)) {
      const err = new Error('Invalid location timestamp.');
      err.code = 'STALE_LOCATION';
      err.statusCode = 400;
      throw err;
    }
    // Older than 30 seconds (30,000ms)
    if (nowTime - capturedTime > 30000) {
      const err = new Error('Location timestamp is too old. Please try again.');
      err.code = 'STALE_LOCATION';
      err.statusCode = 400;
      throw err;
    }
    // More than 5 seconds in future
    if (capturedTime - nowTime > 5000) {
      const err = new Error('Location timestamp is invalid (in the future).');
      err.code = 'STALE_LOCATION';
      err.statusCode = 400;
      throw err;
    }
  }

  // 6. Fetch active office locations for the company
  let activeOffices = [];
  if (getIsConnected()) {
    activeOffices = await OfficeLocation.find({ companyId, isActive: true });
  }

  if (!activeOffices || activeOffices.length === 0) {
    const err = new Error('No active office locations configured for your company.');
    err.code = 'NO_OFFICE_LOCATION';
    err.statusCode = 400;
    throw err;
  }

  // 7. Calculate distance to each active office & find nearest
  let nearestOffice = null;
  let minDistance = Infinity;

  for (const office of activeOffices) {
    // GeoJSON location coordinates are [longitude, latitude]
    const officeLon = office.location.coordinates[0];
    const officeLat = office.location.coordinates[1];

    const dist = calculateDistanceMeters(lat, lon, officeLat, officeLon);
    if (dist < minDistance) {
      minDistance = dist;
      nearestOffice = {
        officeId: office._id,
        name: office.name,
        address: office.address,
        radiusMeters: office.radiusMeters,
        distanceMeters: dist
      };
    }
  }

  if (!nearestOffice || minDistance > nearestOffice.radiusMeters) {
    const err = new Error(`You are outside the office attendance radius.`);
    err.code = 'OUTSIDE_OFFICE_RADIUS';
    err.statusCode = 400;
    err.details = {
      nearestOfficeName: nearestOffice ? nearestOffice.name : 'Office',
      calculatedDistance: minDistance,
      configuredRadius: nearestOffice ? nearestOffice.radiusMeters : 0,
      gpsAccuracy: acc
    };
    throw err;
  }

  return {
    verified: true,
    matchedOffice: nearestOffice,
    latitude: lat,
    longitude: lon,
    accuracyMeters: acc,
    distanceMeters: minDistance
  };
}

module.exports = {
  getOrCreateCompanySettings,
  verifyGpsLocation
};
