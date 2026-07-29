const Attendance = require('../models/Attendance');
const { getIsConnected } = require('../config/db');
const { fallbackAttendance } = require('../utils/fallbackStore');
const { getAttendanceDateKey, formatReadableDate, formatReadableTime } = require('../utils/attendanceDateKey');
const { getAttendanceDateCandidates } = require('../utils/attendancePortalWindow');

async function startCheckIn({
  companyId,
  employeeId,
  email,
  name,
  org,
  method, // 'qr' | 'gps'
  verification = {}
}) {
  const now = new Date();
  const dateKey = getAttendanceDateKey(now);
  const todayDateStr = formatReadableDate(now);
  const timeNowStr = formatReadableTime(now);

  const attendanceData = {
    name: name || email,
    email,
    employeeId: employeeId || null,
    companyId,
    org: org || '',
    date: todayDateStr,
    dateKey,
    checkIn: timeNowStr,
    checkOut: '',
    duration: '',
    status: 'Approved',
    remarks: method === 'qr' ? 'QR Scan Verified' : 'GPS Location Verified',
    verificationMethod: method,
    qrSessionId: verification.qrSessionId || null,
    officeLocationId: verification.officeLocationId || null,
    latitude: verification.latitude ?? null,
    longitude: verification.longitude ?? null,
    accuracy: verification.accuracyMeters ?? null,
    distance: verification.distanceMeters ?? null,
    deviceInfo: verification.deviceInfo || ''
  };

  if (getIsConnected()) {
    const todayCandidates = getAttendanceDateCandidates(now);
    const existing = await Attendance.findOne({
      companyId,
      $or: [
        { employeeId: employeeId || null, dateKey },
        { email, dateKey },
        { email, date: { $in: todayCandidates } }
      ]
    });

    if (existing) {
      if (existing.checkIn && existing.checkIn !== '-') {
        const err = new Error('You are already checked in today.');
        err.code = 'ALREADY_CHECKED_IN';
        err.statusCode = 400;
        throw err;
      }

      // Update existing placeholder or Absent record with actual check-in data
      existing.name = attendanceData.name;
      existing.employeeId = attendanceData.employeeId;
      existing.org = attendanceData.org || existing.org;
      existing.dateKey = dateKey;
      existing.checkIn = timeNowStr;
      existing.checkOut = '';
      existing.duration = '';
      existing.status = 'Approved';
      existing.remarks = attendanceData.remarks;
      existing.verificationMethod = method;
      existing.qrSessionId = verification.qrSessionId || null;
      existing.officeLocationId = verification.officeLocationId || null;
      existing.latitude = verification.latitude ?? null;
      existing.longitude = verification.longitude ?? null;
      existing.accuracy = verification.accuracyMeters ?? null;
      existing.distance = verification.distanceMeters ?? null;
      existing.deviceInfo = verification.deviceInfo || '';

      const saved = await existing.save();
      return saved;
    }

    try {
      const attendance = new Attendance(attendanceData);
      const saved = await attendance.save();
      return saved;
    } catch (err) {
      if (err.code === 11000) {
        const dupErr = new Error('You are already checked in today.');
        dupErr.code = 'ALREADY_CHECKED_IN';
        dupErr.statusCode = 400;
        throw dupErr;
      }
      throw err;
    }
  } else {
    // Fallback store handling
    const existingIndex = fallbackAttendance.findIndex(
      a => String(a.companyId) === String(companyId) && a.email === email && (a.dateKey === dateKey || getAttendanceDateCandidates(now).includes(a.date))
    );

    if (existingIndex >= 0) {
      const existing = fallbackAttendance[existingIndex];
      if (existing.checkIn && existing.checkIn !== '-') {
        const err = new Error('You are already checked in today.');
        err.code = 'ALREADY_CHECKED_IN';
        err.statusCode = 400;
        throw err;
      }
      fallbackAttendance[existingIndex] = {
        ...existing,
        ...attendanceData,
        updatedAt: now
      };
      return fallbackAttendance[existingIndex];
    }

    const fallbackRecord = {
      _id: 'att_' + Date.now(),
      ...attendanceData,
      createdAt: now,
      updatedAt: now
    };
    fallbackAttendance.push(fallbackRecord);
    return fallbackRecord;
  }
}

async function getTodayAttendanceRecord(companyId, email, employeeId) {
  const now = new Date();
  const dateKey = getAttendanceDateKey(now);
  const todayCandidates = getAttendanceDateCandidates(now);

  if (getIsConnected()) {
    return await Attendance.findOne({
      companyId,
      $or: [
        { employeeId: employeeId || null, dateKey },
        { email, dateKey },
        { email, date: { $in: todayCandidates } }
      ]
    });
  }

  return fallbackAttendance.find(
    a => String(a.companyId) === String(companyId) && a.email === email && (a.dateKey === dateKey || todayCandidates.includes(a.date))
  ) || null;
}

module.exports = {
  startCheckIn,
  getTodayAttendanceRecord
};
