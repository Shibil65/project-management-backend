const { getIsConnected } = require('../config/db');
const getTenantModel = require('../utils/tenantDb');
const { fallbackLeaves } = require('../utils/fallbackStore');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const STAFFING_THRESHOLD = 0.7; // Minimum proportion of staff that must be present

async function getLeaves(req, res) {
  const companyId = req.user.companyId;

  if (getIsConnected()) {
    try {
      const LeaveRequestModel = getTenantModel(companyId, 'LeaveRequest');
      const list = await LeaveRequestModel.find({ companyId }).sort({ createdAt: -1 });
      return res.status(200).json({ success: true, data: list });
    } catch (err) {
      console.error(err);
    }
  }
  const list = fallbackLeaves.filter(l => l.companyId === companyId);
  return res.status(200).json({ success: true, data: list });
}

// Helper: check if any employee is already absent on the given date
async function hasAbsentEmployees(date, companyId) {
  if (getIsConnected()) {
    try {
      const AttendanceModel = getTenantModel(companyId, 'Attendance');
      const count = await AttendanceModel.countDocuments({ date, status: 'Absent' });
      return count > 0;
    } catch (err) {
      console.error(err);
    }
  }
  // fallback store check
  const fallback = require('../utils/fallbackStore').fallbackAttendance;
  return fallback.some(a => a.companyId === companyId && a.date === date && a.status === 'Absent');
}

// Helper: ensure staffing threshold is maintained on a specific date
async function staffingMeetsThreshold(date, companyId) {
  // total active employees
  let totalEmployees = 0;
  if (getIsConnected()) {
    try {
      const UserModel = getTenantModel(companyId, 'User');
      totalEmployees = await UserModel.countDocuments({ companyId, role: 'Employee', status: { $ne: 'Deleted' } });
    } catch (err) {
      console.error(err);
    }
  } else {
    const fallbackUsers = require('../utils/fallbackStore').fallbackUsers;
    totalEmployees = fallbackUsers.filter(u => u.companyId === companyId && u.role === 'Employee' && u.status !== 'Deleted').length;
  }
  if (totalEmployees === 0) return true; // no staff, allow

  // count absent employees on that date
  let absentCount = 0;
  if (getIsConnected()) {
    try {
      const AttendanceModel = getTenantModel(companyId, 'Attendance');
      absentCount = await AttendanceModel.countDocuments({ date, status: 'Absent' });
    } catch (err) {
      console.error(err);
    }
  } else {
    const fallbackAttendances = require('../utils/fallbackStore').fallbackAttendance;
    absentCount = fallbackAttendances.filter(a => a.companyId === companyId && a.date === date && a.status === 'Absent').length;
  }
  const presentRatio = (totalEmployees - absentCount) / totalEmployees;
  return presentRatio >= STAFFING_THRESHOLD;
}

// Create a new leave request
async function createLeaveRequest(req, res) {
  const { name, email, reason, startDate, endDate } = req.body;
  const companyId = req.user.companyId;
  const org = req.user.org;

  // Basic validation
  if (!name || !email || !startDate || !endDate) {
    return res.status(400).json({ success: false, message: 'Missing required fields.' });
  }
  if (new Date(startDate) > new Date(endDate)) {
    return res.status(400).json({ success: false, message: 'Start date must be before end date.' });
  }

  // Check for existing absent employees on the requested dates
  const absentConflict = await hasAbsentEmployees(startDate, companyId) || await hasAbsentEmployees(endDate, companyId);
  if (absentConflict) {
    return res.status(400).json({ success: false, message: 'Another employee is already absent on the requested date(s).' });
  }

  // Staffing threshold validation
  const staffingOk = await staffingMeetsThreshold(startDate, companyId) && await staffingMeetsThreshold(endDate, companyId);
  if (!staffingOk) {
    return res.status(400).json({ success: false, message: 'Staffing threshold would be violated by this leave.' });
  }

  // Create leave request record
  const leaveData = { name, email, org, reason: reason || '', startDate, endDate, companyId, status: 'Pending' };
  if (getIsConnected()) {
    try {
      const LeaveRequestModel = getTenantModel(companyId, 'LeaveRequest');
      const newLeave = await LeaveRequestModel.create(leaveData);
      return res.status(201).json({ success: true, data: newLeave });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ success: false, message: 'Database error creating leave request.' });
    }
  }
  // fallback store
  const newLeave = { id: `leave_${Date.now()}`, ...leaveData, createdAt: new Date() };
  fallbackLeaves.push(newLeave);
  const responseLeave = { ...newLeave };
  delete responseLeave.companyId; // hide internal id if needed
  return res.status(201).json({ success: true, data: responseLeave });
}

async function approveLeave(req, res) {
  const { id } = req.params;
  const companyId = req.user.companyId;
  const approverId = req.user.id;

  if (getIsConnected()) {
    try {
      const LeaveRequestModel = getTenantModel(companyId, 'LeaveRequest');
      const request = await LeaveRequestModel.findById(id);
      if (request) {
        // Prevent duplicate approvals
        if (request.status === 'Approved') {
          return res.status(400).json({ success: false, message: 'Leave already approved.' });
        }
        request.status = 'Approved';
        request.approvedAt = new Date();
        request.approvedBy = approverId;
        await request.save();
        // Placeholder notification
        console.log(`Notification: Leave ${id} approved for ${request.email}`);
        // Placeholder dashboard update
        console.log(`Dashboard update for employee ${request.email}`);
        return res.status(200).json({ success: true, data: request });
      }
    } catch (err) {
      console.error(err);
    }
  }
  const request = fallbackLeaves.find(l => l.id === id);
  if (request) {
    if (request.status === 'Approved') {
      return res.status(400).json({ success: false, message: 'Leave already approved.' });
    }
    request.status = 'Approved';
    request.approvedAt = new Date();
    request.approvedBy = approverId;
    console.log(`Notification: Leave ${id} approved for ${request.email}`);
    console.log(`Dashboard update for employee ${request.email}`);
    return res.status(200).json({ success: true, data: request });
  }
  return res.status(404).json({ success: false, message: 'Leave request not found.' });
}

async function declineLeave(req, res) {
  const { id } = req.params;
  const { reason } = req.body;
  const companyId = req.user.companyId;
  const declinerId = req.user.id;

  if (getIsConnected()) {
    try {
      const LeaveRequestModel = getTenantModel(companyId, 'LeaveRequest');
      const request = await LeaveRequestModel.findById(id);
      if (request) {
        if (request.status === 'Declined') {
          return res.status(400).json({ success: false, message: 'Leave already declined.' });
        }
        request.status = 'Declined';
        request.declinedAt = new Date();
        request.declineReason = reason || '';
        request.declinedBy = declinerId;
        await request.save();
        console.log(`Notification: Leave ${id} declined for ${request.email}`);
        return res.status(200).json({ success: true, data: request });
      }
    } catch (err) {
      console.error(err);
    }
  }
  const request = fallbackLeaves.find(l => l.id === id);
  if (request) {
    if (request.status === 'Declined') {
      return res.status(400).json({ success: false, message: 'Leave already declined.' });
    }
    request.status = 'Declined';
    request.declinedAt = new Date();
    request.declineReason = reason || '';
    request.declinedBy = declinerId;
    console.log(`Notification: Leave ${id} declined for ${request.email}`);
    return res.status(200).json({ success: true, data: request });
  }
  return res.status(404).json({ success: false, message: 'Leave request not found.' });
}

module.exports = {
  getLeaves,
  createLeaveRequest,
  approveLeave,
  declineLeave
};
