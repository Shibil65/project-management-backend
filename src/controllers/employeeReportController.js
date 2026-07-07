const { getIsConnected } = require('../config/db');
const getTenantModel = require('../utils/tenantDb');
const { fallbackAttendance, fallbackPayments } = require('../utils/fallbackStore');
const { format } = require('date-fns');
const { createFormalReportPdf } = require('../utils/simplePdf');

/** Helper to send a file download response. */
function sendFile(res, filename, content, mimeType) {
  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(content);
}

function sendPdf(res, filename, pdfBuffer) {
  sendFile(res, filename, pdfBuffer, 'application/pdf');
}

function formatDateValue(value) {
  if (!value) return '-';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return format(date, 'yyyy-MM-dd');
}

function parseTimeToMinutes(value) {
  if (typeof value !== "string") return null;
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function parseDurationToHours(durationStr) {
  if (!durationStr) return 0;
  const hoursMatch = durationStr.match(/(\d+)\s*(hrs|h)/i);
  const minsMatch = durationStr.match(/(\d+)\s*(mins|m)/i);
  const hours = hoursMatch ? parseInt(hoursMatch[1], 10) : 0;
  const mins = minsMatch ? parseInt(minsMatch[1], 10) : 0;
  return hours + mins / 60;
}

function isCheckInLate(checkInStr, openTimeStr = '09:00') {
  if (!checkInStr) return false;
  const timeMatch = checkInStr.match(/(\d+):(\d+)(?:\s*(AM|PM))?/i);
  if (!timeMatch) return false;
  let hours = parseInt(timeMatch[1], 10);
  const minutes = parseInt(timeMatch[2], 10);
  const modifier = timeMatch[3];
  if (modifier) {
    if (modifier.toUpperCase() === 'PM' && hours < 12) hours += 12;
    if (modifier.toUpperCase() === 'AM' && hours === 12) hours = 0;
  }
  const checkInMins = hours * 60 + minutes;
  const openParts = openTimeStr.split(':');
  const openHours = parseInt(openParts[0], 10) || 9;
  const openMins = parseInt(openParts[1], 10) || 0;
  return checkInMins > (openHours * 60 + openMins);
}

function getStatusForDate({
  currentDate,
  today,
  rawLeaves,
  record,
  openTime,
  closeTime,
  portalEnabled
}) {
  const onLeave = rawLeaves.some(l => {
    const start = new Date(l.startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(l.endDate);
    end.setHours(0, 0, 0, 0);
    return currentDate >= start && currentDate <= end;
  });

  if (onLeave) {
    return { status: 'Leave', isLate: false };
  }

  if (record) {
    const hours = parseDurationToHours(record.duration);
    const status = (record.checkOut && hours > 0 && hours < 5) ? 'Half Day' : 'Present';
    const isLate = isCheckInLate(record.checkIn, openTime);
    return { status, isLate };
  }

  const isWeekend = currentDate.getDay() === 0 || currentDate.getDay() === 6;
  if (isWeekend) {
    return { status: 'Holiday', isLate: false };
  }

  const isFuture = currentDate > today;
  if (isFuture) {
    return { status: 'Future', isLate: false };
  }

  const isToday = currentDate.getFullYear() === today.getFullYear() &&
                  currentDate.getMonth() === today.getMonth() &&
                  currentDate.getDate() === today.getDate();
                  
  if (isToday) {
    if (portalEnabled) {
      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const openMinutes = parseTimeToMinutes(openTime);
      const closeMinutes = parseTimeToMinutes(closeTime);
      const isPastClose = openMinutes <= closeMinutes
        ? currentMinutes > closeMinutes
        : currentMinutes > closeMinutes && currentMinutes < openMinutes;
      if (isPastClose) {
        return { status: 'Absent', isLate: false };
      } else {
        return { status: 'None', isLate: false };
      }
    } else {
      const now = new Date();
      if (now.getHours() >= 18) {
        return { status: 'Absent', isLate: false };
      } else {
        return { status: 'None', isLate: false };
      }
    }
  }

  return { status: 'Absent', isLate: false };
}

/** Generate attendance report for an employee */
async function getAttendanceReport(req, res) {
  const { employeeId } = req.params;
  const companyId = req.user.companyId;

  // 1. Fetch Employee Profile
  let employee = null;
  if (getIsConnected()) {
    try {
      const User = getTenantModel(companyId, 'User');
      employee = await User.findById(employeeId);
    } catch (e) {
      console.error('Error fetching user report details:', e);
    }
  } else {
    const { fallbackUsers } = require('../utils/fallbackStore');
    employee = fallbackUsers.find(u => u.id === employeeId || u._id === employeeId);
  }

  // 2. Fetch Attendance Records
  let records = [];
  if (getIsConnected()) {
    try {
      const Attendance = getTenantModel(companyId, 'Attendance');
      records = await Attendance.find({ employeeId }).sort({ date: -1 });
    } catch (e) {
      console.error(e);
    }
  } else {
    records = fallbackAttendance.filter(a => a.employeeId === employeeId);
  }

  // 3. Fetch Approved Leaves
  let leaves = [];
  const employeeEmail = employee ? employee.email : (records[0] ? records[0].email : '');
  if (employeeEmail) {
    if (getIsConnected()) {
      try {
        const LeaveModel = getTenantModel(companyId, 'LeaveRequest');
        leaves = await LeaveModel.find({ email: employeeEmail.toLowerCase(), status: 'Approved' });
      } catch (err) {
        console.error(err);
      }
    } else {
      const { fallbackLeaves } = require('../utils/fallbackStore');
      leaves = fallbackLeaves.filter(l => l.email.toLowerCase() === employeeEmail.toLowerCase() && l.status === 'Approved');
    }
  }

  // 4. Fetch Company Settings
  let company = null;
  if (getIsConnected()) {
    try {
      const Company = require('../models/Company');
      company = await Company.findById(companyId);
    } catch (e) {
      console.error(e);
    }
  } else {
    const { fallbackCompanies } = require('../utils/fallbackStore');
    company = fallbackCompanies.find(c => c.id === companyId);
  }
  
  const orgName = company ? company.name : (req.user.org || 'Syncra Organization');
  const openTime = company ? (company.attendancePortalOpenTime || '09:00') : '09:00';
  const closeTime = company ? (company.attendancePortalCloseTime || '18:00') : '18:00';
  const portalEnabled = company ? (company.attendancePortalEnabled !== false) : true;

  // 5. Generate Log calendar for Current Month
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yearNum = today.getFullYear();
  const monthNum = today.getMonth() + 1;
  
  const rangeStart = new Date(yearNum, monthNum - 1, 1);
  const rangeEnd = new Date(yearNum, monthNum, 0);
  
  const calendar = [];
  let cur = new Date(rangeStart);
  while (cur <= rangeEnd) {
    const currentDate = new Date(cur);
    currentDate.setHours(0, 0, 0, 0);
    
    const record = records.find(a => {
      if (!a.date) return false;
      const dbDate = new Date(a.date);
      return dbDate && 
             dbDate.getFullYear() === currentDate.getFullYear() && 
             dbDate.getMonth() === currentDate.getMonth() && 
             dbDate.getDate() === currentDate.getDate();
    });
    
    const { status, isLate } = getStatusForDate({
      currentDate,
      today,
      rawLeaves: leaves,
      record,
      openTime,
      closeTime,
      portalEnabled
    });
    
    calendar.push({
      date: currentDate.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }),
      status,
      isLate,
      checkIn: record ? (record.checkIn || '--') : '--',
      checkOut: record ? (record.checkOut || '--') : '--',
      duration: record ? (record.duration || '--') : '--'
    });
    
    cur.setDate(cur.getDate() + 1);
  }

  // 6. Summary metrics
  const presentCount = calendar.filter(c => c.status === 'Present').length;
  const absentCount = calendar.filter(c => c.status === 'Absent').length;
  const halfDayCount = calendar.filter(c => c.status === 'Half Day').length;
  const leaveCount = calendar.filter(c => c.status === 'Leave').length;
  const lateCount = calendar.filter(c => c.isLate).length;
  const holidayCount = calendar.filter(c => c.status === 'Holiday').length;
  
  const denominator = presentCount + absentCount + halfDayCount;
  const attendancePct = denominator > 0 ? Math.round(((presentCount + halfDayCount * 0.5) / denominator) * 100) : 100;

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const currentMonthLabel = `${monthNames[monthNum - 1]} ${yearNum}`;

  const employeeName = employee ? employee.name : (records.find(r => r.name)?.name || employeeId);
  const employeeDomain = employee ? (employee.domain || 'General Staff') : 'General Staff';
  const employeeRole = employee ? employee.role : 'Employee';

  // 7. Render corporate PDF structure
  const pdf = createFormalReportPdf({
    title: 'COMPANY ATTENDANCE SUMMARY REPORT',
    subtitle: `${orgName.toUpperCase()} - STAFF PERFORMANCE DIVISION`,
    meta: [
      ['ORGANIZATION', orgName],
      ['EMPLOYEE NAME', employeeName],
      ['JOB DESIGNATION', `${employeeRole} (${employeeDomain})`],
      ['EMAIL ADDRESS', employeeEmail || '-'],
      ['REPORT PERIOD', currentMonthLabel],
      ['GENERATED DATE', new Date().toLocaleDateString('en-IN') + ' ' + new Date().toLocaleTimeString('en-IN')]
    ],
    sections: [
      {
        heading: 'MONTHLY ATTENDANCE SCORECARD',
        type: 'table',
        headers: ['Metric Parameter', 'Roster Performance Score'],
        widths: [280, 210],
        rows: [
          ['Attendance Success Rate', `${attendancePct}%`],
          ['Days Marked Present', `${presentCount} workdays`],
          ['Half-Day Sessions Worked', `${halfDayCount} shifts`],
          ['Approved Sick/Vacation Leaves', `${leaveCount} leaves`],
          ['Unexcused Days Absent', `${absentCount} absences`],
          ['Late check-in Violations', `${lateCount} instances`],
          ['Company Holidays & Weekends', `${holidayCount} days`]
        ]
      },
      {
        heading: 'DAILY ATTENDANCE LOG SHEETS',
        type: 'table',
        headers: ['Date', 'Status', 'Check-In', 'Check-Out', 'Duration', 'Remark'],
        widths: [85, 75, 70, 70, 75, 105],
        emptyText: 'No logging events registered for this reporting window.',
        rows: calendar.map(c => [
          c.date,
          c.status,
          c.checkIn,
          c.checkOut,
          c.duration,
          c.isLate ? 'Late Check-in' : '--'
        ])
      }
    ]
  });

  sendPdf(res, `attendance_report_${employeeName.toLowerCase().replace(/\s+/g, '_')}_${currentMonthLabel.toLowerCase().replace(/\s+/g, '_')}.pdf`, pdf);
}

/** Generate payment report for an employee */
async function getPaymentReport(req, res) {
  const { employeeId } = req.params;
  const companyId = req.user.companyId;

  let records = [];
  if (getIsConnected()) {
    try {
      const Payment = getTenantModel(companyId, 'Payment');
      records = await Payment.find({ employeeId }).sort({ createdAt: -1 });
    } catch (e) {
      console.error(e);
    }
  } else {
    records = fallbackPayments.filter(p => p.employeeId === employeeId);
  }

  const employeeName = records.find(p => p.employeeName || p.name)?.employeeName || records.find(p => p.employeeName || p.name)?.name || employeeId;
  const totalPaid = records
    .filter(p => String(p.status || '').toLowerCase() === 'paid')
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  const pdf = createFormalReportPdf({
    title: 'Employee Payment Report',
    subtitle: 'Formal payment ledger exported from Syncra SaaS',
    meta: [
      ['Employee', employeeName],
      ['Employee ID', employeeId],
      ['Company ID', companyId],
      ['Paid Total', `INR ${totalPaid.toLocaleString('en-IN')}`],
      ['Generated At', new Date().toLocaleString('en-IN')]
    ],
    sections: [
      {
        heading: 'Payment Ledger',
        type: 'table',
        headers: ['Date', 'Amount', 'Status', 'Transaction Reference'],
        widths: [100, 110, 80, 200],
        emptyText: 'No payment records are available for this employee.',
        rows: records.map(p => [
          formatDateValue(p.createdAt || p.date),
          `INR ${(Number(p.amount) || 0).toLocaleString('en-IN')}`,
          p.status || '-',
          p.reference || p.paymentId || p.id || '-'
        ])
      }
    ]
  });

  sendPdf(res, `payment_report_${employeeId}.pdf`, pdf);
}

module.exports = { getAttendanceReport, getPaymentReport };
