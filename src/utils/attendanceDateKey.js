/**
 * Generate attendance dateKey (YYYY-MM-DD) based on server time or timezone.
 * @param {Date} [date]
 * @returns {string} Date key in YYYY-MM-DD format
 */
function getAttendanceDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Generate human-readable date (e.g. "29 Jul 2026")
 * @param {Date} [date]
 * @returns {string}
 */
function formatReadableDate(date = new Date()) {
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Generate human-readable time (e.g. "09:30 AM")
 * @param {Date} [date]
 * @returns {string}
 */
function formatReadableTime(date = new Date()) {
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
}

module.exports = {
  getAttendanceDateKey,
  formatReadableDate,
  formatReadableTime
};
