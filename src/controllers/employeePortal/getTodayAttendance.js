const {
  getIsConnected
} = require("../../config/db");
const Company = require("../../models/Company");
const getTenantModel = require("../../utils/tenantDb");
const {
  fallbackCompanies,
  fallbackAttendance
} = require("../../utils/fallbackStore");
const {
  getAttendancePortalStatus,
  processAutoCheckout,
  getAttendanceDateCandidates
} = require("../../utils/attendancePortalWindow");

async function getTodayAttendance(req, res) {
  const {
    email,
    companyId
  } = req.user;
  const now = new Date();
  const todayDateCandidates = getAttendanceDateCandidates(now);
  try {
    let record = null;
    let companyDoc = null;

    if (getIsConnected()) {
      companyDoc = await Company.findById(companyId);
      await processAutoCheckout(companyId, companyDoc, now);
      const AttendanceModel = getTenantModel(companyId, "Attendance");
      record = await AttendanceModel.findOne({
        email,
        date: { $in: todayDateCandidates }
      });
    } else {
      companyDoc = fallbackCompanies.find(c => (c.id || c._id) === companyId) || null;
      await processAutoCheckout(companyId, companyDoc, now);
      record = fallbackAttendance.find(a => a.email === email && todayDateCandidates.includes(a.date)) || null;
    }

    const attendancePortal = getAttendancePortalStatus(companyDoc, now);
    attendancePortal.gpsTrackingEnabled = companyDoc?.gpsTrackingEnabled !== false;

    return res.status(200).json({
      success: true,
      data: record,
      attendancePortal
    });
  } catch (err) {
    console.error("[getTodayAttendance] Error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch attendance."
    });
  }
}

module.exports = { getTodayAttendance };
