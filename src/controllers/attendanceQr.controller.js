const qrService = require('../services/attendanceQr.service');
const generateSecureToken = require('../utils/generateSecureToken');
const hashToken = require('../utils/hashToken');
const asyncHandler = require('../utils/asyncHandler');
const { getIsConnected } = require('../config/db');
const {
  formatAttendanceDate,
  formatAttendanceTime,
  getAttendanceDateCandidates,
  getAttendancePortalStatus
} = require('../utils/attendancePortalWindow');

// Helper to calculate minutes left until portal close
function calculateMinutesToClose(companyDoc, now) {
  try {
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
    return minutesToClose;
  } catch (err) {
    console.error("calculateMinutesToClose error:", err);
    return 0;
  }
}

// 1. POST /api/attendance/qr/session/start (Admin)
const startSession = asyncHandler(async (req, res) => {
  const companyId = req.user.companyId;
  const email = req.user.email;

  const settings = await qrService.getCompanySettings(companyId, email);
  if (!settings.qrAttendanceEnabled) {
    return res.status(400).json({
      success: false,
      message: 'QR Attendance is disabled. Please enable QR Attendance settings first.'
    });
  }

  const companyDoc = await qrService.getCompanyDoc(companyId);
  const now = new Date();
  const portalStatus = getAttendancePortalStatus(companyDoc, now);
  if (!portalStatus.isOpen) {
    return res.status(400).json({
      success: false,
      message: `Attendance portal is closed. (${portalStatus.message})`
    });
  }

  // Close previous active sessions
  await qrService.closeActiveSessions(companyId);

  const minutesToClose = calculateMinutesToClose(companyDoc, now);
  let expiryMinutes = settings.qrExpiresInMinutes || 5;
  if (minutesToClose > 0 && minutesToClose < expiryMinutes) {
    expiryMinutes = minutesToClose;
  }

  const rawToken = generateSecureToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

  let sessionObj = {
    companyId,
    tokenHash,
    sessionStatus: 'active',
    isActive: true,
    expiresAt,
    lastHeartbeatAt: now,
    createdBy: email
  };

  if (!getIsConnected()) {
    sessionObj.id = `fb_qrs_${Date.now()}`;
    sessionObj._id = `fb_qrs_${Date.now()}`;
    sessionObj.createdAt = now;
    sessionObj.updatedAt = now;
  }

  const saved = await qrService.saveSession(sessionObj, true);
  const sessionIdStr = saved._id ? saved._id.toString() : saved.id;
  const companyIdStr = companyId.toString();

  const qrPayload = {
    type: 'SYNCRA_ATTENDANCE_QR',
    companyId: companyIdStr,
    sessionId: sessionIdStr,
    token: rawToken
  };

  res.status(201).json({
    success: true,
    data: {
      rawToken,
      expiresAt,
      sessionId: sessionIdStr,
      qrPayload
    }
  });
});

// 2. PATCH /api/attendance/qr/session/:sessionId/heartbeat (Admin)
const heartbeat = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  const companyId = req.user.companyId;

  const session = await qrService.getSession(sessionId, companyId);
  if (!session) {
    return res.status(404).json({ success: false, message: 'Active QR session not found.' });
  }

  session.lastHeartbeatAt = new Date();
  await qrService.saveSession(session, false);

  res.status(200).json({ success: true, message: 'Heartbeat registered.' });
});

// 3. PATCH /api/attendance/qr/session/:sessionId/close (Admin)
const closeSession = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  const companyId = req.user.companyId;

  const session = await qrService.getSession(sessionId, companyId);
  if (!session) {
    return res.status(404).json({ success: false, message: 'QR session not found.' });
  }

  session.isActive = false;
  session.sessionStatus = 'closed';
  session.closedAt = new Date();
  
  await qrService.saveSession(session, false);
  res.status(200).json({ success: true, message: 'QR session closed successfully.', data: session });
});

// 4. GET /api/attendance/qr/session/:sessionId/status (Admin / Employee)
const getSessionStatus = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  const companyId = req.user.companyId;

  const session = await qrService.getSession(sessionId, companyId);
  if (!session) {
    return res.status(404).json({ success: false, message: 'Session not found.' });
  }

  const settings = await qrService.getCompanySettings(companyId, req.user.email);
  const companyDoc = await qrService.getCompanyDoc(companyId);

  const now = Date.now();
  let status = session.sessionStatus;
  let isActive = session.isActive;

  const portalStatus = getAttendancePortalStatus(companyDoc, new Date());
  if (isActive && status === 'active' && !portalStatus.isOpen) {
    isActive = false;
    status = 'closed';
    session.isActive = false;
    session.sessionStatus = 'closed';
    session.closedAt = new Date();
    await qrService.saveSession(session, false);
  }

  // Heartbeat timeout check (30 seconds)
  const requireHeartbeat = settings ? settings.requireAdminPortalHeartbeat : true;
  const heartbeatDiff = now - new Date(session.lastHeartbeatAt).getTime();
  if (isActive && status === 'active' && requireHeartbeat && heartbeatDiff > 30000) {
    isActive = false;
    status = 'expired';
    session.isActive = false;
    session.sessionStatus = 'expired';
    await qrService.saveSession(session, false);
  }

  // General expiry check
  const expiryDiff = new Date(session.expiresAt).getTime() - now;
  if (isActive && status === 'active' && expiryDiff <= 0) {
    isActive = false;
    status = 'expired';
    session.isActive = false;
    session.sessionStatus = 'expired';
    await qrService.saveSession(session, false);
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

// 5. POST /api/attendance/qr/verify (Employee check-in)
const verifyToken = asyncHandler(async (req, res) => {
  const { token, sessionId, companyId, action } = req.body;
  const employeeUser = req.user;

  if (!token || !sessionId || !companyId || !action) {
    return res.status(400).json({ success: false, message: 'Missing token, sessionId, companyId, or action parameters.' });
  }

  if (employeeUser.companyId.toString() !== companyId.toString()) {
    return res.status(403).json({ success: false, message: 'You do not belong to this company.' });
  }

  const settings = await qrService.getCompanySettings(companyId, employeeUser.email);
  if (!settings.qrAttendanceEnabled) {
    return res.status(400).json({ success: false, message: 'QR Attendance is disabled for this company.' });
  }

  const companyDoc = await qrService.getCompanyDoc(companyId);
  const portalStatus = getAttendancePortalStatus(companyDoc, new Date());
  if (!portalStatus.isOpen) {
    return res.status(400).json({ success: false, message: 'Attendance portal is closed.' });
  }

  const session = await qrService.getSession(sessionId, companyId);
  if (!session) {
    return res.status(404).json({ success: false, message: 'QR Attendance session not found.' });
  }

  // Token verification
  const calculatedHash = hashToken(token);
  if (session.tokenHash !== calculatedHash) {
    return res.status(400).json({ success: false, message: 'Invalid QR code token. Verification rejected.' });
  }

  const now = Date.now();
  let status = session.sessionStatus;
  let isActive = session.isActive;

  if (isActive && status === 'active' && !portalStatus.isOpen) {
    isActive = false;
    status = 'closed';
    session.isActive = false;
    session.sessionStatus = 'closed';
    session.closedAt = new Date();
    await qrService.saveSession(session, false);
  }

  const requireHeartbeat = settings.requireAdminPortalHeartbeat;
  const heartbeatDiff = now - new Date(session.lastHeartbeatAt).getTime();
  if (isActive && status === 'active' && requireHeartbeat && heartbeatDiff > 30000) {
    isActive = false;
    status = 'expired';
    session.isActive = false;
    session.sessionStatus = 'expired';
    await qrService.saveSession(session, false);
  }

  const expiryDiff = new Date(session.expiresAt).getTime() - now;
  if (isActive && status === 'active' && expiryDiff <= 0) {
    isActive = false;
    status = 'expired';
    session.isActive = false;
    session.sessionStatus = 'expired';
    await qrService.saveSession(session, false);
  }

  if (!isActive || status !== 'active') {
    return res.status(400).json({
      success: false,
      message: status === 'closed' ? 'Attendance QR portal is closed.' : 'QR expired. Please scan the latest QR.'
    });
  }

  const dateNow = new Date();
  const todayDateCandidates = getAttendanceDateCandidates(dateNow);
  const todayDateStr = formatAttendanceDate(dateNow);
  const timeNowStr = formatAttendanceTime(dateNow);

  const existingRecord = await qrService.getTodayAttendanceRecord(companyId, employeeUser.email, todayDateCandidates);

  if (action === 'check_in') {
    if (existingRecord) {
      return res.status(400).json({ success: false, message: 'You are already checked in today.' });
    }

    const attendanceRecord = await qrService.createAttendance(companyId, {
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
      qrSessionId: session._id || session.id,
      deviceInfo: req.headers['user-agent'] || 'Mobile Browser'
    });

    return res.status(200).json({
      success: true,
      message: 'Attendance Check-In verified successfully via QR.',
      data: attendanceRecord
    });
  } else {
    // If somehow triggered check_out via verify
    return res.status(400).json({ success: false, message: 'QR verify is restricted to shift check-ins only.' });
  }
});

module.exports = {
  startSession,
  heartbeat,
  closeSession,
  getSessionStatus,
  verifyToken
};
