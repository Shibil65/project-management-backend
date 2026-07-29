const OfficeLocation = require('../models/OfficeLocation');
const { getIsConnected } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');

// GET /api/company/office-locations
const getOfficeLocations = asyncHandler(async (req, res) => {
  const companyId = req.user.companyId;

  if (getIsConnected()) {
    const locations = await OfficeLocation.find({ companyId }).sort({ createdAt: -1 });
    return res.status(200).json({ success: true, data: locations });
  }

  return res.status(200).json({ success: true, data: [] });
});

// POST /api/company/office-locations
const createOfficeLocation = asyncHandler(async (req, res) => {
  const companyId = req.user.companyId;
  const { name, address, latitude, longitude, radiusMeters, isActive } = req.body;

  if (!name || name.trim() === '') {
    return res.status(400).json({ success: false, message: 'Office name is required.' });
  }

  const lat = Number(latitude);
  const lon = Number(longitude);

  if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return res.status(400).json({ success: false, message: 'Invalid latitude or longitude values.' });
  }

  const radius = Number(radiusMeters) > 0 ? Number(radiusMeters) : 100;

  if (getIsConnected()) {
    const office = new OfficeLocation({
      companyId,
      name: name.trim(),
      address: address ? address.trim() : '',
      location: {
        type: 'Point',
        coordinates: [lon, lat] // [longitude, latitude]
      },
      radiusMeters: radius,
      isActive: isActive !== undefined ? !!isActive : true,
      createdBy: req.user.email
    });

    await office.save();
    return res.status(201).json({ success: true, data: office, message: 'Office location created successfully.' });
  }

  return res.status(201).json({
    success: true,
    data: {
      _id: 'loc_' + Date.now(),
      companyId,
      name: name.trim(),
      address: address || '',
      location: { type: 'Point', coordinates: [lon, lat] },
      radiusMeters: radius,
      isActive: isActive !== undefined ? !!isActive : true
    },
    message: 'Office location created (fallback mode).'
  });
});

// PATCH /api/company/office-locations/:locationId
const updateOfficeLocation = asyncHandler(async (req, res) => {
  const companyId = req.user.companyId;
  const { locationId } = req.params;
  const { name, address, latitude, longitude, radiusMeters, isActive } = req.body;

  if (getIsConnected()) {
    const office = await OfficeLocation.findOne({ _id: locationId, companyId });
    if (!office) {
      return res.status(404).json({ success: false, message: 'Office location not found.' });
    }

    if (name !== undefined) office.name = name.trim();
    if (address !== undefined) office.address = address.trim();
    if (isActive !== undefined) office.isActive = !!isActive;
    if (radiusMeters !== undefined) {
      const radius = Number(radiusMeters);
      if (!isNaN(radius) && radius > 0) office.radiusMeters = radius;
    }

    if (latitude !== undefined && longitude !== undefined) {
      const lat = Number(latitude);
      const lon = Number(longitude);
      if (!isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
        office.location = {
          type: 'Point',
          coordinates: [lon, lat]
        };
      }
    }

    office.updatedBy = req.user.email;
    await office.save();

    return res.status(200).json({ success: true, data: office, message: 'Office location updated successfully.' });
  }

  return res.status(200).json({ success: true, message: 'Office location updated.' });
});

// DELETE /api/company/office-locations/:locationId
const deleteOfficeLocation = asyncHandler(async (req, res) => {
  const companyId = req.user.companyId;
  const { locationId } = req.params;

  if (getIsConnected()) {
    const office = await OfficeLocation.findOneAndDelete({ _id: locationId, companyId });
    if (!office) {
      return res.status(404).json({ success: false, message: 'Office location not found.' });
    }
    return res.status(200).json({ success: true, message: 'Office location deleted successfully.' });
  }

  return res.status(200).json({ success: true, message: 'Office location deleted.' });
});

module.exports = {
  getOfficeLocations,
  createOfficeLocation,
  updateOfficeLocation,
  deleteOfficeLocation
};
