const DEFAULT_ATTENDANCE_TIMEZONE = "Asia/Kolkata";

function getAttendanceTimezone() {
  const configured = process.env.ATTENDANCE_TIMEZONE || DEFAULT_ATTENDANCE_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: configured }).format(new Date());
    return configured;
  } catch {
    return DEFAULT_ATTENDANCE_TIMEZONE;
  }
}

function parseTimeToMinutes(value) {
  if (typeof value !== "string") return null;
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function formatTimeLabel(value) {
  const mins = parseTimeToMinutes(value);
  if (mins === null) return "Not configured";
  const hours24 = Math.floor(mins / 60);
  const minutes = mins % 60;
  const suffix = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

function formatCloseTime(closeTimeStr) {
  if (!closeTimeStr) return "06:00:00 PM";
  const match = String(closeTimeStr).match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return "06:00:00 PM";
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const suffix = hours >= 12 ? "PM" : "AM";
  const hours12 = hours % 12 || 12;
  return `${String(hours12).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00 ${suffix}`;
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

function getZonedDateParts(date = new Date(), timeZone = getAttendanceTimezone()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);

  const byType = parts.reduce((acc, part) => {
    if (part.type !== "literal") acc[part.type] = Number(part.value);
    return acc;
  }, {});

  return {
    year: byType.year,
    month: byType.month,
    day: byType.day,
    hour: byType.hour,
    minute: byType.minute,
    second: byType.second
  };
}

function getCurrentMinutesInTimezone(date = new Date(), timeZone = getAttendanceTimezone()) {
  const parts = getZonedDateParts(date, timeZone);
  return parts.hour * 60 + parts.minute;
}

function formatAttendanceDate(date = new Date(), timeZone = getAttendanceTimezone()) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(date).replace(/,/g, "");
}

function formatAttendanceTime(date = new Date(), timeZone = getAttendanceTimezone()) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  }).format(date);
}

function getAttendanceDateCandidates(date = new Date(), timeZone = getAttendanceTimezone()) {
  const candidates = new Set([
    formatAttendanceDate(date, timeZone),
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      day: "numeric",
      month: "short",
      year: "numeric"
    }).format(date),
    new Intl.DateTimeFormat("en-IN", {
      timeZone,
      day: "numeric",
      month: "short",
      year: "numeric"
    }).format(date),
    date.toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric"
    })
  ]);

  return [...candidates].filter(Boolean);
}

function getAttendanceTodayDate(date = new Date(), timeZone = getAttendanceTimezone()) {
  const parts = getZonedDateParts(date, timeZone);
  return new Date(parts.year, parts.month - 1, parts.day);
}

function getAttendancePortalStatus(companyDoc, now = new Date()) {
  const timezone = getAttendanceTimezone();
  const enabled = companyDoc?.attendancePortalEnabled !== false;
  const manualCheckInEnabled = companyDoc?.manualCheckInEnabled !== false;
  const openTime = companyDoc?.attendancePortalOpenTime;
  const closeTime = companyDoc?.attendancePortalCloseTime;

  if (!enabled) {
    return {
      enabled: false,
      manualCheckInEnabled,
      isOpen: false,
      openTime: openTime || "",
      closeTime: closeTime || "",
      timezone,
      message: "Attendance portal is disabled by your company admin."
    };
  }

  // If no portal open/close schedule is specified, the portal remains open indefinitely
  if (!openTime || !closeTime) {
    return {
      enabled,
      manualCheckInEnabled,
      isOpen: true,
      openTime: openTime || "",
      closeTime: closeTime || "",
      timezone,
      message: "Attendance portal is open indefinitely (no schedule restrictions set)."
    };
  }

  const openMinutes = parseTimeToMinutes(openTime);
  const closeMinutes = parseTimeToMinutes(closeTime);

  if (openMinutes === null || closeMinutes === null) {
    return {
      enabled,
      manualCheckInEnabled,
      isOpen: true,
      openTime,
      closeTime,
      timezone,
      message: "Attendance portal is open indefinitely (schedule configuration is empty or invalid)."
    };
  }

  const currentMinutes = getCurrentMinutesInTimezone(now, timezone);
  const isOpen = openMinutes <= closeMinutes
    ? currentMinutes >= openMinutes && currentMinutes <= closeMinutes
    : currentMinutes >= openMinutes || currentMinutes <= closeMinutes;

  return {
    enabled,
    manualCheckInEnabled,
    isOpen,
    openTime,
    closeTime,
    timezone,
    message: isOpen
      ? `Attendance portal is open until ${formatTimeLabel(closeTime)}.`
      : `Attendance portal is closed. It opens from ${formatTimeLabel(openTime)} to ${formatTimeLabel(closeTime)}.`
  };
}

async function processAutoCheckout(companyId, companyDoc, now = new Date()) {
  if (!companyId) return;
  const portalEnabled = companyDoc?.attendancePortalEnabled !== false;
  if (!portalEnabled) return;

  const closeTime = companyDoc?.attendancePortalCloseTime || '18:00';
  const openTime = companyDoc?.attendancePortalOpenTime || '09:00';
  
  const currentMinutes = getCurrentMinutesInTimezone(now);
  const openMinutes = parseTimeToMinutes(openTime);
  const closeMinutes = parseTimeToMinutes(closeTime);
  
  if (openMinutes === null || closeMinutes === null) return;
  
  const isPastClose = openMinutes <= closeMinutes
    ? currentMinutes > closeMinutes
    : currentMinutes > closeMinutes && currentMinutes < openMinutes;

  if (!isPastClose) return;

  const formattedCloseTime = formatCloseTime(closeTime);
  const todayDateCandidates = getAttendanceDateCandidates(now);

  const { getIsConnected } = require('../config/db');
  const getTenantModel = require('./tenantDb');
  const { fallbackAttendance } = require('./fallbackStore');

  if (getIsConnected()) {
    try {
      const AttendanceModel = getTenantModel(companyId, 'Attendance');
      const recordsToCheckout = await AttendanceModel.find({
        companyId,
        date: { $in: todayDateCandidates },
        checkIn: { $exists: true, $nin: ['', '-'] },
        $or: [
          { checkOut: { $exists: false } },
          { checkOut: '' },
          { checkOut: '-' }
        ]
      });

      for (const rec of recordsToCheckout) {
        rec.checkOut = formattedCloseTime;
        rec.duration = calculateDurationHelper(rec.checkIn, formattedCloseTime);
        rec.remarks = rec.remarks 
          ? `${rec.remarks} (Auto checked out at portal close)` 
          : 'Auto checked out at portal close time';
        await rec.save();
      }
    } catch (err) {
      console.error('[processAutoCheckout] DB Error:', err.message);
    }
  } else {
    const recordsToCheckout = fallbackAttendance.filter(a =>
      String(a.companyId) === String(companyId) &&
      todayDateCandidates.includes(a.date) &&
      a.checkIn && a.checkIn !== '-' &&
      (!a.checkOut || a.checkOut === '' || a.checkOut === '-')
    );

    for (const rec of recordsToCheckout) {
      rec.checkOut = formattedCloseTime;
      rec.duration = calculateDurationHelper(rec.checkIn, formattedCloseTime);
      rec.remarks = rec.remarks 
        ? `${rec.remarks} (Auto checked out at portal close)` 
        : 'Auto checked out at portal close time';
    }
  }
}

async function runAllCompaniesAutoCheckout() {
  const { getIsConnected } = require('../config/db');
  const Company = require('../models/Company');
  const { fallbackCompanies } = require('./fallbackStore');
  const now = new Date();

  if (getIsConnected()) {
    try {
      const companies = await Company.find({ status: 'Active', isDeleted: { $ne: true } });
      for (const comp of companies) {
        await processAutoCheckout(comp._id.toString(), comp, now);
      }
    } catch (err) {
      console.error('[runAllCompaniesAutoCheckout] Error:', err.message);
    }
  } else {
    for (const comp of fallbackCompanies) {
      const cId = comp.id || comp._id;
      if (cId) {
        await processAutoCheckout(cId, comp, now);
      }
    }
  }
}

module.exports = {
  getAttendancePortalStatus,
  processAutoCheckout,
  runAllCompaniesAutoCheckout,
  parseTimeToMinutes,
  formatTimeLabel,
  getAttendanceTimezone,
  getZonedDateParts,
  getCurrentMinutesInTimezone,
  formatAttendanceDate,
  formatAttendanceTime,
  getAttendanceDateCandidates,
  getAttendanceTodayDate
};
