const asyncHandler = require('../utils/asyncHandler');
const { getIsConnected } = require('../config/db');
const OfficeLocation = require('../models/OfficeLocation');
const OfficeLocationSetupSession = require('../models/OfficeLocationSetupSession');
const Company = require('../models/Company');
const radarService = require('../services/radarService');
const generateSecureToken = require('../utils/generateSecureToken');
const hashToken = require('../utils/hashToken');
const { toMongoCoordinates } = require('../utils/geoUtils');
const { fallbackOfficeLocations, fallbackSetupSessions } = require('../utils/fallbackStore');

// Helper to get fallback store array or mongodb model
async function getCompanyDoc(companyId) {
  if (getIsConnected()) {
    return await Company.findById(companyId);
  }
  return null;
}

// 1. GET /api/company/office-locations
const getOfficeLocations = asyncHandler(async (req, res) => {
  const companyId = req.user.companyId;

  if (getIsConnected()) {
    const locations = await OfficeLocation.find({ companyId }).sort({ createdAt: -1 });
    return res.status(200).json({ success: true, data: locations });
  }

  // Fallback
  const list = fallbackOfficeLocations.filter(loc => loc.companyId === companyId.toString());
  return res.status(200).json({ success: true, data: list });
});

// 2. POST /api/company/office-locations
const createOfficeLocation = asyncHandler(async (req, res) => {
  const companyId = req.user.companyId;
  const userEmail = req.user.email;
  const { name, address, latitude, longitude, radiusMeters, maximumAcceptedAccuracy, isActive } = req.body;

  if (!name || latitude === undefined || longitude === undefined) {
    return res.status(400).json({ success: false, message: 'Office name, latitude, and longitude are required.' });
  }

  const mongoCoords = toMongoCoordinates(latitude, longitude);

  let newOffice;
  let companyDoc = null;

  if (getIsConnected()) {
    companyDoc = await Company.findById(companyId);
    newOffice = new OfficeLocation({
      companyId,
      name,
      address: address || '',
      location: {
        type: 'Point',
        coordinates: mongoCoords
      },
      radiusMeters: Number(radiusMeters) || 100,
      maximumAcceptedAccuracy: Number(maximumAcceptedAccuracy) || 60,
      isActive: isActive !== false,
      createdBy: userEmail,
      updatedBy: userEmail
    });

    // Set Radar identity
    newOffice.radarTag = 'company-office';
    newOffice.radarExternalId = newOffice._id.toString();

    // Try Radar Sync
    try {
      const syncResult = await radarService.upsertOfficeGeofence(newOffice, companyDoc?.name || 'Company');
      if (syncResult.success) {
        newOffice.radarGeofenceId = syncResult.geofenceId || '';
        newOffice.radarSyncStatus = 'synced';
        newOffice.radarLastSyncedAt = new Date();
      } else {
        newOffice.radarSyncStatus = 'failed';
      }
    } catch (syncErr) {
      console.warn('[OfficeLocation] Radar sync failed during create:', syncErr.message);
      newOffice.radarSyncStatus = 'failed';
    }

    await newOffice.save();
    return res.status(201).json({ success: true, data: newOffice });
  }

  // Fallback Mode
  newOffice = {
    _id: `fb_loc_${Date.now()}`,
    companyId: companyId.toString(),
    name,
    address: address || '',
    location: { type: 'Point', coordinates: mongoCoords },
    radiusMeters: Number(radiusMeters) || 100,
    maximumAcceptedAccuracy: Number(maximumAcceptedAccuracy) || 60,
    isActive: isActive !== false,
    radarSyncStatus: 'synced',
    radarLastSyncedAt: new Date(),
    createdBy: userEmail,
    createdAt: new Date(),
    updatedAt: new Date()
  };
  fallbackOfficeLocations.push(newOffice);
  return res.status(201).json({ success: true, data: newOffice });
});

// 3. PATCH /api/company/office-locations/:officeId
const updateOfficeLocation = asyncHandler(async (req, res) => {
  const companyId = req.user.companyId;
  const { officeId } = req.params;
  const userEmail = req.user.email;
  const { name, address, latitude, longitude, radiusMeters, maximumAcceptedAccuracy, isActive } = req.body;

  if (getIsConnected()) {
    const office = await OfficeLocation.findOne({ _id: officeId, companyId });
    if (!office) {
      return res.status(404).json({ success: false, message: 'Office location not found.' });
    }

    if (name) office.name = name;
    if (address !== undefined) office.address = address;
    if (latitude !== undefined && longitude !== undefined) {
      office.location = {
        type: 'Point',
        coordinates: toMongoCoordinates(latitude, longitude)
      };
    }
    if (radiusMeters !== undefined) office.radiusMeters = Number(radiusMeters);
    if (maximumAcceptedAccuracy !== undefined) office.maximumAcceptedAccuracy = Number(maximumAcceptedAccuracy);
    if (isActive !== undefined) office.isActive = Boolean(isActive);

    office.updatedBy = userEmail;

    // Sync with Radar
    try {
      const companyDoc = await Company.findById(companyId);
      const syncResult = await radarService.upsertOfficeGeofence(office, companyDoc?.name || 'Company');
      if (syncResult.success) {
        office.radarGeofenceId = syncResult.geofenceId || office.radarGeofenceId;
        office.radarSyncStatus = 'synced';
        office.radarLastSyncedAt = new Date();
      } else {
        office.radarSyncStatus = 'failed';
      }
    } catch (syncErr) {
      console.warn('[OfficeLocation] Radar sync failed during update:', syncErr.message);
      office.radarSyncStatus = 'failed';
    }

    await office.save();
    return res.status(200).json({ success: true, data: office });
  }

  // Fallback Mode
  const loc = fallbackOfficeLocations.find(l => l._id === officeId && l.companyId === companyId.toString());
  if (!loc) return res.status(404).json({ success: false, message: 'Office location not found.' });

  if (name) loc.name = name;
  if (address !== undefined) loc.address = address;
  if (latitude !== undefined && longitude !== undefined) {
    loc.location.coordinates = toMongoCoordinates(latitude, longitude);
  }
  if (radiusMeters !== undefined) loc.radiusMeters = Number(radiusMeters);
  if (maximumAcceptedAccuracy !== undefined) loc.maximumAcceptedAccuracy = Number(maximumAcceptedAccuracy);
  if (isActive !== undefined) loc.isActive = Boolean(isActive);
  loc.updatedAt = new Date();

  return res.status(200).json({ success: true, data: loc });
});

// 4. DELETE /api/company/office-locations/:officeId
const deleteOfficeLocation = asyncHandler(async (req, res) => {
  const companyId = req.user.companyId;
  const { officeId } = req.params;

  if (getIsConnected()) {
    const office = await OfficeLocation.findOne({ _id: officeId, companyId });
    if (!office) {
      return res.status(404).json({ success: false, message: 'Office location not found.' });
    }

    // Delete Radar Geofence
    try {
      await radarService.deleteOfficeGeofence(officeId);
    } catch (e) {
      console.warn('[OfficeLocation] Delete geofence error:', e.message);
    }

    await OfficeLocation.deleteOne({ _id: officeId });
    return res.status(200).json({ success: true, message: 'Office location deleted successfully.' });
  }

  // Fallback Mode
  const idx = fallbackOfficeLocations.findIndex(l => l._id === officeId && l.companyId === companyId.toString());
  if (idx !== -1) {
    fallbackOfficeLocations.splice(idx, 1);
  }
  return res.status(200).json({ success: true, message: 'Office location deleted successfully.' });
});

// 5. POST /api/company/office-locations/:officeId/retry-radar-sync
const retryRadarSync = asyncHandler(async (req, res) => {
  const companyId = req.user.companyId;
  const { officeId } = req.params;

  if (getIsConnected()) {
    const office = await OfficeLocation.findOne({ _id: officeId, companyId });
    if (!office) return res.status(404).json({ success: false, message: 'Office location not found.' });

    const companyDoc = await Company.findById(companyId);
    try {
      const syncResult = await radarService.upsertOfficeGeofence(office, companyDoc?.name || 'Company');
      if (syncResult.success) {
        office.radarGeofenceId = syncResult.geofenceId || office.radarGeofenceId;
        office.radarSyncStatus = 'synced';
        office.radarLastSyncedAt = new Date();
        await office.save();
        return res.status(200).json({ success: true, data: office, message: 'Radar sync succeeded.' });
      } else {
        office.radarSyncStatus = 'failed';
        await office.save();
        return res.status(400).json({ success: false, code: 'RADAR_SYNC_FAILED', message: 'Radar API error during sync retry.' });
      }
    } catch (err) {
      office.radarSyncStatus = 'failed';
      await office.save();
      return res.status(500).json({ success: false, code: 'RADAR_SYNC_FAILED', message: err.message });
    }
  }

  return res.status(200).json({ success: true, message: 'Radar sync simulated in fallback mode.' });
});

// 6. POST /api/company/office-locations/setup-session (Admin creates phone location capture token)
const createSetupSession = asyncHandler(async (req, res) => {
  const companyId = req.user.companyId;
  const userEmail = req.user.email;
  const { officeLocationId } = req.body;

  const rawToken = generateSecureToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes TTL

  if (getIsConnected()) {
    const session = new OfficeLocationSetupSession({
      companyId,
      createdBy: userEmail,
      tokenHash,
      officeLocationId: officeLocationId || null,
      status: 'pending',
      expiresAt
    });
    await session.save();
  } else {
    fallbackSetupSessions.push({
      token: rawToken,
      tokenHash,
      companyId: companyId.toString(),
      createdBy: userEmail,
      officeLocationId,
      status: 'pending',
      expiresAt
    });
  }

  return res.status(201).json({
    success: true,
    data: {
      token: rawToken,
      expiresAt,
      setupUrl: `/company/location-setup/mobile/${rawToken}`
    }
  });
});

// 7. GET /api/company/office-locations/setup-session/:token
const getSetupSession = asyncHandler(async (req, res) => {
  const { token } = req.params;
  const tokenHash = hashToken(token);

  if (getIsConnected()) {
    const session = await OfficeLocationSetupSession.findOne({ tokenHash });
    if (!session) {
      return res.status(404).json({ success: false, code: 'LOCATION_SETUP_EXPIRED', message: 'Setup session not found or expired.' });
    }
    if (session.expiresAt < new Date()) {
      session.status = 'expired';
      await session.save();
      return res.status(400).json({ success: false, code: 'LOCATION_SETUP_EXPIRED', message: 'Session has expired.' });
    }
    return res.status(200).json({ success: true, data: session });
  }

  // Fallback
  const session = fallbackSetupSessions.find(s => s.token === token || s.tokenHash === tokenHash);
  if (!session || session.expiresAt < new Date()) {
    return res.status(404).json({ success: false, code: 'LOCATION_SETUP_EXPIRED', message: 'Setup session expired.' });
  }
  return res.status(200).json({ success: true, data: session });
});

// 8. POST /api/company/office-locations/setup-session/:token/capture (Phone submits captured location)
const captureMobileLocation = asyncHandler(async (req, res) => {
  const { token } = req.params;
  const { latitude, longitude, accuracy, address } = req.body;
  const tokenHash = hashToken(token);

  // Role validation: Must be Company Admin
  if (req.user.role !== 'Company Admin' && req.user.role !== 'Super Admin') {
    return res.status(403).json({ success: false, code: 'UNAUTHORIZED_LOCATION_SETUP', message: 'Only company admins can capture office location.' });
  }

  if (latitude === undefined || longitude === undefined || accuracy === undefined) {
    return res.status(400).json({ success: false, message: 'Latitude, longitude and accuracy are required.' });
  }

  if (getIsConnected()) {
    const session = await OfficeLocationSetupSession.findOne({ tokenHash });
    if (!session) return res.status(404).json({ success: false, code: 'LOCATION_SETUP_EXPIRED', message: 'Session expired or not found.' });
    if (session.companyId.toString() !== req.user.companyId.toString()) {
      return res.status(403).json({ success: false, code: 'UNAUTHORIZED_LOCATION_SETUP', message: 'Company context mismatch.' });
    }

    session.capturedLocation = {
      latitude: Number(latitude),
      longitude: Number(longitude),
      address: address || ''
    };
    session.accuracyMeters = Number(accuracy);
    session.status = 'captured';

    await session.save();
    return res.status(200).json({ success: true, data: session });
  }

  // Fallback
  const session = fallbackSetupSessions.find(s => s.token === token || s.tokenHash === tokenHash);
  if (!session) return res.status(404).json({ success: false, code: 'LOCATION_SETUP_EXPIRED', message: 'Session expired.' });
  session.capturedLocation = { latitude, longitude, address };
  session.accuracyMeters = accuracy;
  session.status = 'captured';

  return res.status(200).json({ success: true, data: session });
});

// 9. POST /api/company/office-locations/setup-session/:token/confirm
const confirmMobileLocation = asyncHandler(async (req, res) => {
  const { token } = req.params;
  const tokenHash = hashToken(token);

  if (getIsConnected()) {
    const session = await OfficeLocationSetupSession.findOne({ tokenHash });
    if (!session) return res.status(404).json({ success: false, code: 'LOCATION_SETUP_EXPIRED', message: 'Session expired or not found.' });

    session.status = 'confirmed';
    await session.save();
    return res.status(200).json({ success: true, data: session });
  }

  const session = fallbackSetupSessions.find(s => s.token === token || s.tokenHash === tokenHash);
  if (!session) return res.status(404).json({ success: false, code: 'LOCATION_SETUP_EXPIRED', message: 'Session expired.' });
  session.status = 'confirmed';
  return res.status(200).json({ success: true, data: session });
});

module.exports = {
  getOfficeLocations,
  createOfficeLocation,
  updateOfficeLocation,
  deleteOfficeLocation,
  retryRadarSync,
  createSetupSession,
  getSetupSession,
  captureMobileLocation,
  confirmMobileLocation
};
