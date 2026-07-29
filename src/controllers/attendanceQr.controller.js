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
    const openTime = companyDoc?.attendancePortalOpenTime;
    const closeTime = companyDoc?.attendancePortalCloseTime;
    if (!openTime || !closeTime) return 0;
    
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
  // Allow admin to generate session regardless of portal schedule for testing/kiosk preparation

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

  const saved = await qrService.saveSession(sessionObj, true);
  const sessionIdStr = saved._id ? saved._id.toString() : saved.id;
  const companyIdStr = companyId.toString();

  console.log(`[QR Session] Created session ID ${sessionIdStr} for company ${companyIdStr} by ${email}`);

  const qrPayload = {
    type: 'FLOWNEX_ATTENDANCE_QR',
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
    console.warn(`[QR Session] Heartbeat lookup failed. Session not found: ${sessionId} for company: ${companyId}`);
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
    console.warn(`[QR Session] Close lookup failed. Session not found: ${sessionId} for company: ${companyId}`);
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
    console.warn(`[QR Session] Status lookup failed. Session not found: ${sessionId} for company: ${companyId}`);
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

  // Heartbeat timeout check (90s tolerance)
  const requireHeartbeat = settings ? settings.requireAdminPortalHeartbeat !== false : true;
  const heartbeatDiff = now - new Date(session.lastHeartbeatAt).getTime();
  const configuredTimeoutSecs = settings ? settings.heartbeatTimeoutSeconds : 90;
  const timeoutMs = Math.max((configuredTimeoutSecs || 90) * 1000, 90000);

  if (isActive && status === 'active' && requireHeartbeat && heartbeatDiff > timeoutMs) {
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

  // Check global & QR settings
  const { getOrCreateCompanySettings } = require('../services/gpsVerificationService');
  const attendanceService = require('../services/attendanceService');
  const companySettings = await getOrCreateCompanySettings(companyId, employeeUser.email);

  if (companySettings.attendanceEnabled === false) {
    return res.status(403).json({ success: false, code: 'ATTENDANCE_DISABLED', message: 'Attendance is currently closed by your company.' });
  }

  const settings = await qrService.getCompanySettings(companyId, employeeUser.email);
  if (!settings.qrAttendanceEnabled && companySettings.methods?.qr?.enabled !== true) {
    return res.status(403).json({ success: false, code: 'QR_ATTENDANCE_DISABLED', message: 'QR Attendance is currently disabled for this company.' });
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

  const requireHeartbeat = settings ? settings.requireAdminPortalHeartbeat !== false : true;
  const heartbeatDiff = now - new Date(session.lastHeartbeatAt).getTime();
  const configuredTimeoutSecs = settings ? settings.heartbeatTimeoutSeconds : 90;
  const timeoutMs = Math.max((configuredTimeoutSecs || 90) * 1000, 90000);

  if (isActive && status === 'active' && requireHeartbeat && heartbeatDiff > timeoutMs) {
    isActive = false;
    status = 'expired';
    session.isActive = false;
    session.sessionStatus = 'expired';
    await qrService.saveSession(session, false);
  }

  const expiryDiff = new Date(session.expiresAt).getTime() - now;
  // 120s grace period for dynamic 15-second QR rotation
  const isWithinGracePeriod = Math.abs(expiryDiff) <= 120000;

  if (isActive && status === 'active' && expiryDiff <= 0 && !isWithinGracePeriod) {
    isActive = false;
    status = 'expired';
    session.isActive = false;
    session.sessionStatus = 'expired';
    await qrService.saveSession(session, false);
  }

  if ((!isActive || status !== 'active') && !isWithinGracePeriod) {
    return res.status(400).json({
      success: false,
      message: status === 'closed' ? 'Attendance QR portal is closed.' : 'QR expired. Please scan the latest QR.'
    });
  }

  if (action === 'check_in') {
    try {
      const attendanceRecord = await attendanceService.startCheckIn({
        companyId,
        employeeId: employeeUser.id,
        email: employeeUser.email,
        name: employeeUser.name,
        org: employeeUser.org,
        method: 'qr',
        verification: {
          qrSessionId: session._id || session.id,
          deviceInfo: req.headers['user-agent'] || 'Mobile Browser'
        }
      });

      return res.status(200).json({
        success: true,
        message: 'Attendance Check-In verified successfully via QR.',
        data: attendanceRecord
      });
    } catch (err) {
      if (err.code === 'ALREADY_CHECKED_IN') {
        return res.status(400).json({ success: false, code: 'ALREADY_CHECKED_IN', message: 'You are already checked in today.' });
      }
      throw err;
    }
  } else {
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
