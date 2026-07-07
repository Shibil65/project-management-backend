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
  const openTime = companyDoc?.attendancePortalOpenTime || "09:00";
  const closeTime = companyDoc?.attendancePortalCloseTime || "18:00";
  const openMinutes = parseTimeToMinutes(openTime);
  const closeMinutes = parseTimeToMinutes(closeTime);

  if (!enabled) {
    return {
      enabled: false,
      isOpen: false,
      openTime,
      closeTime,
      timezone,
      message: "Attendance portal is disabled by your company admin."
    };
  }

  if (openMinutes === null || closeMinutes === null) {
    return {
      enabled,
      isOpen: true,
      openTime,
      closeTime,
      timezone,
      message: "Attendance portal schedule is not configured correctly."
    };
  }

  const currentMinutes = getCurrentMinutesInTimezone(now, timezone);
  const isOpen = openMinutes <= closeMinutes
    ? currentMinutes >= openMinutes && currentMinutes <= closeMinutes
    : currentMinutes >= openMinutes || currentMinutes <= closeMinutes;

  return {
    enabled,
    isOpen,
    openTime,
    closeTime,
    timezone,
    message: isOpen
      ? `Attendance portal is open until ${formatTimeLabel(closeTime)}.`
      : `Attendance portal is closed. It opens from ${formatTimeLabel(openTime)} to ${formatTimeLabel(closeTime)}.`
  };
}

module.exports = {
  getAttendancePortalStatus,
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
