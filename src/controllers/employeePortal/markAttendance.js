const {
  getIsConnected
} = require("../../config/db");
const User = require("../../models/User");
const Company = require("../../models/Company");
const { getDistance } = require("geolib");
const getTenantModel = require("../../utils/tenantDb");
const {
  resolveEmployeeUser
} = require("../../utils/employeeResolver");
const {
  fallbackUsers,
  fallbackCompanies,
  fallbackAttendance
} = require("../../utils/fallbackStore");
const {
  getAttendancePortalStatus,
  formatAttendanceDate,
  formatAttendanceTime,
  getAttendanceDateCandidates
} = require("../../utils/attendancePortalWindow");

function resolveFallbackUser(userId, email) {
  return fallbackUsers.find(u => (u._id || u.id) === userId) || email && fallbackUsers.find(u => u.email?.toLowerCase() === email.toLowerCase()) || null;
}

function calculateDurationHelper(checkInStr, checkOutStr) {
  try {
    const parseTime = timeStr => {
      const parts = String(timeStr).replace(/\s+/g, " ").trim().split(" ");
      const time = parts[0];
      const modifier = parts[1] ? parts[1].toUpperCase() : "";
      let [hours, minutes, seconds] = time.split(":").map(Number);
      if (modifier === "PM" && hours < 12) hours += 12;
      if (modifier === "AM" && hours === 12) hours = 0;
      return new Date(2000, 0, 1, hours, minutes, seconds || 0);
    };
    const inDate = parseTime(checkInStr);
    const outDate = parseTime(checkOutStr);
    const diffMs = outDate - inDate;
    if (diffMs <= 0) return "0h 0m";
    const diffMins = Math.floor(diffMs / 1000 / 60);
    const hrs = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    return `${hrs}h ${mins}m`;
  } catch {
    return "0h 0m";
  }
}

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isValidLatitude(value) {
  return Number.isFinite(value) && value >= -90 && value <= 90;
}

function isValidLongitude(value) {
  return Number.isFinite(value) && value >= -180 && value <= 180;
}

async function markAttendance(req, res) {
  const {
    action,
    latitude,
    longitude,
    accuracy
  } = req.body;
  const {
    userId,
    email,
    companyId
  } = req.user;
  if (!action || !["checkIn", "checkOut"].includes(action)) {
    return res.status(400).json({
      success: false,
      message: "Action must be checkIn or checkOut."
    });
  }
  try {
    let employeeUser = null;
    if (getIsConnected()) {
      const UserModel = getTenantModel(companyId, "User");
      const {
        employeeUser: resolved
      } = await resolveEmployeeUser(companyId, userId, email, UserModel);
      employeeUser = resolved;
    } else {
      employeeUser = resolveFallbackUser(userId, email);
    }
    if (!employeeUser) {
      return res.status(404).json({
        success: false,
        message: "Employee user not found."
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
    if (action === "checkIn" && !portalStatus.isOpen) {
      return res.status(403).json({
        success: false,
        message: portalStatus.message,
        attendancePortal: portalStatus
      });
    }

    const officeLat = toFiniteNumber(companyDoc?.gpsLatitude);
    const officeLon = toFiniteNumber(companyDoc?.gpsLongitude);
    const gpsTrackingEnabled = companyDoc?.gpsTrackingEnabled !== false;
    portalStatus.gpsTrackingEnabled = gpsTrackingEnabled;
    const hasGeofence = gpsTrackingEnabled && (officeLat !== null || officeLon !== null) && req.body.method !== 'manual';

    let computedStatus = 'Approved';
    let remarks = req.body.method === 'manual' ? 'Manual Clock Verified (Bypassed Scan)' : 'IP/Local Verified';
    let employeeLat = null;
    let employeeLon = null;
    let reportedAccuracy = null;
    let distance = null;

    if (hasGeofence) {
      if (!isValidLatitude(officeLat) || !isValidLongitude(officeLon)) {
        return res.status(400).json({
          success: false,
          message: "Company GPS geofence is not configured correctly. Please ask your admin to save valid office coordinates."
        });
      }

      if (latitude === undefined || longitude === undefined) {
        return res.status(400).json({
          success: false,
          message: "Location coordinate verification is required for this workspace. Please enable GPS/location services in your browser."
        });
      }

      employeeLat = toFiniteNumber(latitude);
      employeeLon = toFiniteNumber(longitude);
      if (!isValidLatitude(employeeLat) || !isValidLongitude(employeeLon)) {
        return res.status(400).json({
          success: false,
          message: "Invalid location coordinates provided."
        });
      }

      reportedAccuracy = toFiniteNumber(accuracy);
      if (reportedAccuracy === null || reportedAccuracy <= 0) {
        return res.status(400).json({
          success: false,
          message: "GPS accuracy was not provided by this device. Please enable precise location and try again."
        });
      }

      reportedAccuracy = Math.round(reportedAccuracy);
      const maxAcceptedAccuracy = 1000;
      if (reportedAccuracy > maxAcceptedAccuracy) {
        return res.status(400).json({
          success: false,
          message: `GPS signal is too weak (${reportedAccuracy}m accuracy). Please enable precise location, move near a window/open area, and try again.`
        });
      }
      distance = getDistance(
        { latitude: officeLat, longitude: officeLon },
        { latitude: employeeLat, longitude: employeeLon }
      );

      const configuredRadius = Number(companyDoc.gpsRadius);
      const allowedRadius = Number.isFinite(configuredRadius) && configuredRadius > 0 ? configuredRadius : 200;
      const accuracyTolerance = Math.min(Math.max(reportedAccuracy || 0, 0), 500);
      const pendingRadius = allowedRadius + Math.max(50, accuracyTolerance);
      const roundedDistance = Math.round(distance);

      if (distance <= allowedRadius && reportedAccuracy <= 200) {
        computedStatus = 'Approved';
        remarks = 'GPS Verified (Office)';
      } else if (distance <= pendingRadius) {
        computedStatus = 'Pending Verification';
        remarks = `GPS needs admin review (distance ${roundedDistance}m, accuracy ${reportedAccuracy}m)`;
      } else {
        return res.status(400).json({
          success: false,
          message: `Location Bound Violation: You must be within the designated area to mark attendance. (Current distance: ${roundedDistance}m, maximum allowed radius: ${allowedRadius}m, GPS accuracy: ${reportedAccuracy}m)`,
          details: {
            code: "LOCATION_BOUND_VIOLATION",
            currentDistanceMeters: roundedDistance,
            maxRadiusMeters: allowedRadius,
            gpsAccuracyMeters: reportedAccuracy,
            pendingReviewRadiusMeters: pendingRadius,
            officeCoordinates: { latitude: officeLat, longitude: officeLon },
            receivedCoordinates: { latitude: employeeLat, longitude: employeeLon, accuracy: reportedAccuracy }
          }
        });
      }
    }

    const todayDateStr = formatAttendanceDate(now);
    const todayDateCandidates = getAttendanceDateCandidates(now);
    const nowTimeStr = formatAttendanceTime(now);
    let attendanceRecord = null;

    if (getIsConnected()) {
      const AttendanceModel = getTenantModel(companyId, "Attendance");
      attendanceRecord = await AttendanceModel.findOne({
        email,
        date: { $in: todayDateCandidates }
      });

      if (action === "checkIn") {
        if (attendanceRecord) {
          return res.status(400).json({
            success: false,
            message: "You have already checked in for today."
          });
        }
        attendanceRecord = new AttendanceModel({
          name: employeeUser.name || employeeUser.email || email,
          email,
          companyId,
          org: employeeUser.org || companyDoc?.name || "Workspace",
          date: todayDateStr,
          checkIn: nowTimeStr,
          checkOut: "",
          duration: "",
          status: computedStatus,
          remarks: remarks,
          latitude: employeeLat,
          longitude: employeeLon,
          accuracy: reportedAccuracy,
          distance: distance,
          verificationMethod: req.body.method || 'manual'
        });
        await attendanceRecord.save();
      } else {
        if (!attendanceRecord) {
          return res.status(400).json({
            success: false,
            message: "No check-in record found for today. Please check in first."
          });
        }
        if (attendanceRecord.checkOut) {
          return res.status(400).json({
            success: false,
            message: "You have already checked out for today."
          });
        }
        attendanceRecord.checkOut = nowTimeStr;
        attendanceRecord.duration = calculateDurationHelper(attendanceRecord.checkIn, nowTimeStr);
        
        if (hasGeofence) {
          attendanceRecord.checkOutLatitude = employeeLat;
          attendanceRecord.checkOutLongitude = employeeLon;
          attendanceRecord.checkOutAccuracy = reportedAccuracy;
          attendanceRecord.checkOutDistance = distance;
          attendanceRecord.checkOutStatus = computedStatus;
          
          if (computedStatus === 'Pending Verification') {
            attendanceRecord.status = 'Pending Verification';
            attendanceRecord.remarks = `Check-out outside office radius (${Math.round(distance)}m) (Pending Approval)`;
          }
        }
        await attendanceRecord.save();
      }
    } else {
      attendanceRecord = fallbackAttendance.find(a => a.email === email && todayDateCandidates.includes(a.date));
      if (action === "checkIn") {
        if (attendanceRecord) {
          return res.status(400).json({
            success: false,
            message: "You have already checked in for today."
          });
        }
        attendanceRecord = {
          id: `fb_att_${Date.now()}`,
          name: employeeUser.name || employeeUser.email || email,
          email,
          companyId,
          org: employeeUser.org || companyDoc?.name || "Workspace",
          date: todayDateStr,
          checkIn: nowTimeStr,
          checkOut: "",
          duration: "",
          status: computedStatus,
          remarks: remarks,
          latitude: employeeLat,
          longitude: employeeLon,
          accuracy: reportedAccuracy,
          distance: distance
        };
        fallbackAttendance.push(attendanceRecord);
      } else {
        if (!attendanceRecord) {
          return res.status(400).json({
            success: false,
            message: "No check-in record found for today. Please check in first."
          });
        }
        if (attendanceRecord.checkOut) {
          return res.status(400).json({
            success: false,
            message: "You have already checked out for today."
          });
        }
        attendanceRecord.checkOut = nowTimeStr;
        attendanceRecord.duration = calculateDurationHelper(attendanceRecord.checkIn, nowTimeStr);
        
        if (hasGeofence) {
          attendanceRecord.checkOutLatitude = employeeLat;
          attendanceRecord.checkOutLongitude = employeeLon;
          attendanceRecord.checkOutAccuracy = reportedAccuracy;
          attendanceRecord.checkOutDistance = distance;
          attendanceRecord.checkOutStatus = computedStatus;
          
          if (computedStatus === 'Pending Verification') {
            attendanceRecord.status = 'Pending Verification';
            attendanceRecord.remarks = `Check-out outside office radius (${Math.round(distance)}m) (Pending Approval)`;
          }
        }
      }
    }

    return res.status(200).json({
      success: true,
      message: computedStatus === 'Pending Verification'
        ? `Attendance ${action === "checkIn" ? "Check-In" : "Check-Out"} marked as Pending Verification. Admin approval is required.`
        : `Attendance ${action === "checkIn" ? "Check-In" : "Check-Out"} marked successfully.`,
      data: attendanceRecord,
      attendancePortal: portalStatus
    });
  } catch (err) {
    console.error("[markAttendance] Error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error marking attendance."
    });
  }
}

module.exports = { markAttendance };
