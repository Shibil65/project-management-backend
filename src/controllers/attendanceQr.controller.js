const { getIsConnected } = require('../config/db');
const AttendanceQrSession = require('../models/attendanceQrSession.model');
const AttendanceSettings = require('../models/attendanceSettings.model');
const Company = require('../models/Company');
const getTenantModel = require('../utils/tenantDb');
const { fallbackAttendanceSettings, fallbackAttendanceQrSessions, fallbackAttendance, fallbackCompanies } = require('../utils/fallbackStore');
const generateSecureToken = require('../utils/generateSecureToken');
const hashToken = require('../utils/hashToken');
const asyncHandler = require('../utils/asyncHandler');
const {
  formatAttendanceDate,
  formatAttendanceTime,
  getAttendanceDateCandidates,
  getAttendancePortalStatus
} = require('../utils/attendancePortalWindow');

// Helper to check and resolve settings
async function getCompanySettings(companyId, adminEmail) {
  if (getIsConnected()) {
    let settings = await AttendanceSettings.findOne({ companyId });
    if (!settings) {
      settings = new AttendanceSettings({
        companyId,
        qrAttendanceEnabled: false,
        qrExpiresInMinutes: 5,
        requireAdminPortalHeartbeat: true,
        createdBy: adminEmail
      });
      await settings.save();
    }
    return settings;
  }
  let settings = fallbackAttendanceSettings.find(s => s.companyId === companyId);
  if (!settings) {
    settings = {
      companyId,
      qrAttendanceEnabled: false,
      qrExpiresInMinutes: 5,
      requireAdminPortalHeartbeat: true,
      createdBy: adminEmail
    };
    fallbackAttendanceSettings.push(settings);
  }
  return settings;
}

// 1. POST /api/attendance/qr/session/start (Admin)
const startSession = asyncHandler(async (req, res) => {
  const companyId = req.user.companyId;
  const email = req.user.email;

  // Retrieve/initialize settings
  const settings = await getCompanySettings(companyId, email);
  if (!settings.qrAttendanceEnabled) {
    return res.status(403).json({
      success: false,
      message: 'QR Attendance is not enabled. Please toggle QR Attendance settings first.'
    });
  }

  // Close previous active sessions
  if (getIsConnected()) {
    await AttendanceQrSession.updateMany(
      { companyId, isActive: true },
      { $set: { isActive: false, sessionStatus: 'closed', closedAt: new Date() } }
    );
  } else {
    fallbackAttendanceQrSessions.forEach(s => {
      if (s.companyId === companyId && s.isActive) {
        s.isActive = false;
        s.sessionStatus = 'closed';
        s.closedAt = new Date();
      }
    });
  }

  let companyDoc = null;
  if (getIsConnected()) {
    companyDoc = await Company.findById(companyId);
  } else {
    companyDoc = fallbackCompanies.find(c => (c.id || c._id) === companyId);
  }

  const now = new Date();
  const portalStatus = getAttendancePortalStatus(companyDoc, now);
  if (!portalStatus.isOpen) {
    return res.status(403).json({
      success: false,
      message: `Cannot generate QR session: ${portalStatus.message}`
    });
  }

  // Calculate strict portal close time truncation
  const timezone = companyDoc ? companyDoc.attendancePortalTimezone : 'Asia/Kolkata'; // fallback or standard timezone
  // Get time attributes
  const openTime = companyDoc?.attendancePortalOpenTime || '09:00';
  const closeTime = companyDoc?.attendancePortalCloseTime || '18:00';
  const openMinutes = require('../utils/attendancePortalWindow').parseTimeToMinutes(openTime) || 540;
  const closeMinutes = require('../utils/attendancePortalWindow').parseTimeToMinutes(closeTime) || 1080;
  const currentMinutes = require('../utils/attendancePortalWindow').getCurrentMinutesInTimezone(now);

  let minutesToClose = 0;
  if (openMinutes <= closeMinutes) {
    if (currentMinutes >= openMinutes && currentMinutes <= closeMinutes) {
      minutesToClose = closeMinutes - currentMinutes;
    }
  } else {
    if (currentMinutes >= openMinutes) {
      minutesToClose = (1440 - currentMinutes) + closeMinutes;
    } else if (currentMinutes <= closeMinutes) {
      minutesToClose = closeMinutes - currentMinutes;
    }
  }

  let expiryMinutes = settings.qrExpiresInMinutes || 5;
  if (minutesToClose > 0 && minutesToClose < expiryMinutes) {
    expiryMinutes = minutesToClose;
  }

  // Generate secure token
  const rawToken = generateSecureToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

  let sessionObj;
  if (getIsConnected()) {
    const newSession = new AttendanceQrSession({
      companyId,
      tokenHash,
      sessionStatus: 'active',
      isActive: true,
      expiresAt,
      lastHeartbeatAt: now,
      createdBy: email
    });
    await newSession.save();
    sessionObj = newSession;
  } else {
    sessionObj = {
      id: `fb_qrs_${Date.now()}`,
      _id: `fb_qrs_${Date.now()}`,
      companyId,
      tokenHash,
      sessionStatus: 'active',
      isActive: true,
      expiresAt,
      lastHeartbeatAt: now,
      createdBy: email,
      createdAt: now,
      updatedAt: now
    };
    fallbackAttendanceQrSessions.push(sessionObj);
  }

  const qrPayload = {
    type: 'SYNCRA_ATTENDANCE_QR',
    companyId,
    sessionId: sessionObj._id || sessionObj.id,
    token: rawToken
  };

  res.status(201).json({
    success: true,
    data: {
      rawToken,
      sessionId: sessionObj._id || sessionObj.id,
      companyId,
      expiresAt,
      qrPayload
    }
  });
});

// 2. PATCH /api/attendance/qr/session/:sessionId/heartbeat (Admin)
const heartbeat = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  const companyId = req.user.companyId;

  if (getIsConnected()) {
    const session = await AttendanceQrSession.findOne({ _id: sessionId, companyId });
    if (!session || !session.isActive || session.sessionStatus !== 'active') {
      return res.status(404).json({ success: false, message: 'Active QR session not found or already closed.' });
    }
    session.lastHeartbeatAt = new Date();
    await session.save();
    return res.status(200).json({ success: true, data: session });
  }

  const session = fallbackAttendanceQrSessions.find(s => s.id === sessionId && s.companyId === companyId);
  if (!session || !session.isActive || session.sessionStatus !== 'active') {
    return res.status(404).json({ success: false, message: 'Active QR session not found.' });
  }
  session.lastHeartbeatAt = new Date();
  res.status(200).json({ success: true, data: session });
});

// 3. PATCH /api/attendance/qr/session/:sessionId/close (Admin)
const closeSession = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  const companyId = req.user.companyId;
  const now = new Date();

  if (getIsConnected()) {
    const session = await AttendanceQrSession.findOne({ _id: sessionId, companyId });
    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found.' });
    }
    session.isActive = false;
    session.sessionStatus = 'closed';
    session.closedAt = now;
    await session.save();
    return res.status(200).json({ success: true, data: session });
  }

  const session = fallbackAttendanceQrSessions.find(s => s.id === sessionId && s.companyId === companyId);
  if (!session) {
    return res.status(404).json({ success: false, message: 'Session not found.' });
  }
  session.isActive = false;
  session.sessionStatus = 'closed';
  session.closedAt = now;
  res.status(200).json({ success: true, data: session });
});

// 4. GET /api/attendance/qr/session/:sessionId/status (Admin / Employee)
const getSessionStatus = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  const companyId = req.user.companyId;

  let session;
  let settings;

  if (getIsConnected()) {
    session = await AttendanceQrSession.findOne({ _id: sessionId, companyId });
    settings = await AttendanceSettings.findOne({ companyId });
  } else {
    session = fallbackAttendanceQrSessions.find(s => s.id === sessionId && s.companyId === companyId);
    settings = fallbackAttendanceSettings.find(s => s.companyId === companyId);
  }

  if (!session) {
    return res.status(404).json({ success: false, message: 'Session not found.' });
  }

  const now = Date.now();
  let status = session.sessionStatus;
  let isActive = session.isActive;

  // Portal closed check
  let companyDoc = null;
  if (getIsConnected()) {
    companyDoc = await Company.findById(companyId);
  } else {
    companyDoc = fallbackCompanies.find(c => (c.id || c._id) === companyId);
  }
  const portalStatus = getAttendancePortalStatus(companyDoc, new Date());
  if (isActive && status === 'active' && !portalStatus.isOpen) {
    isActive = false;
    status = 'closed';
    if (getIsConnected()) {
      session.isActive = false;
      session.sessionStatus = 'closed';
      session.closedAt = new Date();
      await session.save();
    } else {
      session.isActive = false;
      session.sessionStatus = 'closed';
      session.closedAt = new Date();
    }
  }

  // Heartbeat timeout check (30 seconds)
  const requireHeartbeat = settings ? settings.requireAdminPortalHeartbeat : true;
  const heartbeatDiff = now - new Date(session.lastHeartbeatAt).getTime();
  if (isActive && status === 'active' && requireHeartbeat && heartbeatDiff > 30000) {
    isActive = false;
    status = 'expired';
    
    // Save state back
    if (getIsConnected()) {
      session.isActive = false;
      session.sessionStatus = 'expired';
      await session.save();
    } else {
      session.isActive = false;
      session.sessionStatus = 'expired';
    }
  }

  // General expiry check
  const expiryDiff = new Date(session.expiresAt).getTime() - now;
  if (isActive && status === 'active' && expiryDiff <= 0) {
    isActive = false;
    status = 'expired';

    if (getIsConnected()) {
      session.isActive = false;
      session.sessionStatus = 'expired';
      await session.save();
    } else {
      session.isActive = false;
      session.sessionStatus = 'expired';
    }
  }

  const remainingSeconds = Math.max(0, Math.floor((new Date(session.expiresAt).getTime() - now) / 1000));

  res.status(200).json({
    success: true,
    data: {
      sessionId,
      sessionStatus: status,
      isActive,
      expiresAt: session.expiresAt,
      remainingSeconds,
      serverTime: new Date()
    }
  });
});

// 5. POST /api/attendance/qr/verify (Employee)
const verifyToken = asyncHandler(async (req, res) => {
  const { token, sessionId, companyId, action } = req.body;
  const employeeUser = req.user; // from authMiddleware

  if (!token || !sessionId || !companyId || !action) {
    return res.status(400).json({ success: false, message: 'Missing token, sessionId, companyId, or action.' });
  }

  if (employeeUser.companyId.toString() !== companyId.toString()) {
    return res.status(403).json({ success: false, message: 'You do not belong to this company.' });
  }

  const settings = await getCompanySettings(companyId, employeeUser.email);
  if (!settings.qrAttendanceEnabled) {
    return res.status(403).json({ success: false, message: 'QR Attendance is disabled for this company.' });
  }

  let session;
  if (getIsConnected()) {
    session = await AttendanceQrSession.findOne({ _id: sessionId, companyId });
  } else {
    session = fallbackAttendanceQrSessions.find(s => s.id === sessionId && s.companyId === companyId);
  }

  if (!session) {
    return res.status(404).json({ success: false, message: 'QR Attendance session not found.' });
  }

  // Token hash comparison
  const calculatedHash = hashToken(token);
  if (session.tokenHash !== calculatedHash) {
    return res.status(400).json({ success: false, message: 'Invalid QR code token. Verification rejected.' });
  }

  const now = Date.now();
  let status = session.sessionStatus;
  let isActive = session.isActive;

  // Portal closed check
  let companyDoc = null;
  if (getIsConnected()) {
    companyDoc = await Company.findById(companyId);
  } else {
    companyDoc = fallbackCompanies.find(c => (c.id || c._id) === companyId);
  }
  const portalStatus = getAttendancePortalStatus(companyDoc, new Date());
  if (isActive && status === 'active' && !portalStatus.isOpen) {
    isActive = false;
    status = 'closed';
    if (getIsConnected()) {
      session.isActive = false;
      session.sessionStatus = 'closed';
      session.closedAt = new Date();
      await session.save();
    } else {
      session.isActive = false;
      session.sessionStatus = 'closed';
      session.closedAt = new Date();
    }
  }

  // Heartbeat timeout check (30 seconds)
  const requireHeartbeat = settings.requireAdminPortalHeartbeat;
  const heartbeatDiff = now - new Date(session.lastHeartbeatAt).getTime();
  if (isActive && status === 'active' && requireHeartbeat && heartbeatDiff > 30000) {
    isActive = false;
    status = 'expired';
    if (getIsConnected()) {
      session.isActive = false;
      session.sessionStatus = 'expired';
      await session.save();
    } else {
      session.isActive = false;
      session.sessionStatus = 'expired';
    }
  }

  // Expiry check
  const expiryDiff = new Date(session.expiresAt).getTime() - now;
  if (isActive && status === 'active' && expiryDiff <= 0) {
    isActive = false;
    status = 'expired';
    if (getIsConnected()) {
      session.isActive = false;
      session.sessionStatus = 'expired';
      await session.save();
    } else {
      session.isActive = false;
      session.sessionStatus = 'expired';
    }
  }

  if (!isActive || status !== 'active') {
    return res.status(400).json({
      success: false,
      message: status === 'closed' ? 'QR session has been closed by admin.' : 'QR session has expired.'
    });
  }

  // Time & date candidates
  const dateNow = new Date();
  const todayDateCandidates = getAttendanceDateCandidates(dateNow);
  const todayDateStr = formatAttendanceDate(dateNow);
  const timeNowStr = formatAttendanceTime(dateNow);

  let attendanceRecord;

  if (getIsConnected()) {
    const AttendanceModel = getTenantModel(companyId, 'Attendance');
    attendanceRecord = await AttendanceModel.findOne({
      email: employeeUser.email,
      date: { $in: todayDateCandidates }
    });

    if (action === 'check_in') {
      if (attendanceRecord) {
        return res.status(400).json({ success: false, message: 'You have already checked in for today.' });
      }

      attendanceRecord = new AttendanceModel({
        name: employeeUser.name,
        email: employeeUser.email,
        companyId,
        org: employeeUser.org,
        date: todayDateStr,
        checkIn: timeNowStr,
        checkOut: '',
        duration: '',
        status: 'Approved',
        remarks: 'QR Scan Verified',
        verificationMethod: 'qr',
        qrSessionId: session._id,
        deviceInfo: req.headers['user-agent'] || 'Browser'
      });
      await attendanceRecord.save();
    } else {
      // Check-out
      if (!attendanceRecord) {
        return res.status(400).json({ success: false, message: 'No check-in record found for today. Please check in first.' });
      }
      if (attendanceRecord.checkOut) {
        return res.status(400).json({ success: false, message: 'You have already checked out for today.' });
      }

      attendanceRecord.checkOut = timeNowStr;
      
      // Calculate duration
      try {
        const parseTime = (tStr) => {
          const parts = String(tStr).replace(/\s+/g, ' ').trim().split(' ');
          const [hours, minutes, seconds] = parts[0].split(':').map(Number);
          let resolvedHour = hours;
          if (parts[1] && parts[1].toUpperCase() === 'PM' && hours < 12) resolvedHour += 12;
          if (parts[1] && parts[1].toUpperCase() === 'AM' && hours === 12) resolvedHour = 0;
          return new Date(2000, 0, 1, resolvedHour, minutes, seconds || 0);
        };
        const inDate = parseTime(attendanceRecord.checkIn);
        const outDate = parseTime(timeNowStr);
        const diffMs = outDate - inDate;
        if (diffMs > 0) {
          const diffMins = Math.floor(diffMs / 1000 / 60);
          attendanceRecord.duration = `${Math.floor(diffMins / 60)}h ${diffMins % 60}m`;
        }
      } catch (err) {
        attendanceRecord.duration = '0h 0m';
      }

      attendanceRecord.verificationMethod = 'qr';
      attendanceRecord.qrSessionId = session._id;
      attendanceRecord.deviceInfo = req.headers['user-agent'] || 'Browser';
      await attendanceRecord.save();
    }
  } else {
    // Fallback mode
    attendanceRecord = fallbackAttendance.find(a => a.email === employeeUser.email && todayDateCandidates.includes(a.date));

    if (action === 'check_in') {
      if (attendanceRecord) {
        return res.status(400).json({ success: false, message: 'You have already checked in for today.' });
      }

      attendanceRecord = {
        id: `fb_att_${Date.now()}`,
        name: employeeUser.name,
        email: employeeUser.email,
        companyId,
        org: employeeUser.org,
        date: todayDateStr,
        checkIn: timeNowStr,
        checkOut: '',
        duration: '',
        status: 'Approved',
        remarks: 'QR Scan Verified',
        verificationMethod: 'qr',
        qrSessionId: session.id,
        deviceInfo: req.headers['user-agent'] || 'Browser'
      };
      fallbackAttendance.push(attendanceRecord);
    } else {
      if (!attendanceRecord) {
        return res.status(400).json({ success: false, message: 'No check-in record found for today. Please check in first.' });
      }
      if (attendanceRecord.checkOut) {
        return res.status(400).json({ success: false, message: 'You have already checked out for today.' });
      }

      attendanceRecord.checkOut = timeNowStr;
      attendanceRecord.verificationMethod = 'qr';
      attendanceRecord.qrSessionId = session.id;
      attendanceRecord.deviceInfo = req.headers['user-agent'] || 'Browser';
    }
  }

  res.status(200).json({
    success: true,
    message: `Attendance ${action === 'check_in' ? 'Check-In' : 'Check-Out'} verified successfully via QR.`,
    data: attendanceRecord
  });
});

module.exports = {
  startSession,
  heartbeat,
  closeSession,
  getSessionStatus,
  verifyToken
};
