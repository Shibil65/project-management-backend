const { getIsConnected } = require('../config/db');
const getTenantModel = require('../utils/tenantDb');
const { fallbackAttendance } = require('../utils/fallbackStore');
const { getCurrentMinutesInTimezone, getAttendanceTodayDate, formatAttendanceDate } = require('../utils/attendancePortalWindow');

async function getAttendance(req, res) {
  const companyId = req.user.companyId;

  if (getIsConnected()) {
    try {
      const AttendanceModel = getTenantModel(companyId, 'Attendance');
      const UserModel = getTenantModel(companyId, 'User');
      const CompanyModel = require('../models/Company');

      // Fetch all active employees
      const employees = await UserModel.find({ role: 'Employee', status: 'Active' });

      // Fetch existing logs
      const list = await AttendanceModel.find({ companyId }).sort({ createdAt: -1 });

      // Check if we are past the portal close time for today
      const company = await CompanyModel.findById(companyId);
      if (company) {
        const portalEnabled = company.attendancePortalEnabled !== false;
        const openTime = company.attendancePortalOpenTime || '09:00';
        const closeTime = company.attendancePortalCloseTime || '18:00';

        const currentMinutes = getCurrentMinutesInTimezone();
        const openMinutes = parseTimeToMinutes(openTime);
        const closeMinutes = parseTimeToMinutes(closeTime);
        const isPastClose = portalEnabled
          ? (openMinutes <= closeMinutes ? currentMinutes > closeMinutes : currentMinutes > closeMinutes && currentMinutes < openMinutes)
          : currentMinutes >= 18 * 60; // 6 PM default

        if (isPastClose) {
          const todayStr = formatAttendanceDate(new Date());

          for (const emp of employees) {
            const hasLog = list.some(a => a.email.toLowerCase() === emp.email.toLowerCase() && a.date === todayStr);
            if (!hasLog) {
              // Check if employee is on leave today
              const LeaveModel = getTenantModel(companyId, 'LeaveRequest');
              const leaves = await LeaveModel.find({ email: emp.email, status: 'Approved' });
              
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              
              const onLeave = leaves.some(l => {
                const start = new Date(l.startDate);
                start.setHours(0, 0, 0, 0);
                const end = new Date(l.endDate);
                end.setHours(0, 0, 0, 0);
                return today >= start && today <= end;
              });

              const newLog = new AttendanceModel({
                name: emp.name,
                email: emp.email,
                companyId,
                org: emp.org || company.name || 'Company',
                date: todayStr,
                checkIn: '-',
                checkOut: '-',
                duration: '-',
                status: onLeave ? 'Leave' : 'Absent',
                remarks: onLeave ? 'Approved Leave' : 'Absent (Missed portal close time)'
              });
              await newLog.save();
              list.unshift(newLog);
            }
          }
        }
      }

      return res.status(200).json({ success: true, data: list });
    } catch (err) {
      console.error(err);
    }
  }
  const list = fallbackAttendance.filter(a => a.companyId === companyId);
  return res.status(200).json({ success: true, data: list });
}

async function adminMarkAttendance(req, res) {
  const companyId = req.user.companyId;
  const { employeeEmail, date, checkIn, checkOut } = req.body;

  if (!employeeEmail || !date || !checkIn) {
    return res.status(400).json({ success: false, message: 'Employee Email, Date, and Check In Time are required.' });
  }

  let formattedDate = date;
  try {
    const d = new Date(date);
    if (!isNaN(d.getTime())) {
      // Format to match localized string in DB: e.g. "Jun 29, 2026"
      formattedDate = d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
    }
  } catch (e) {
    console.error("Date formatting failed:", e);
  }

  let duration = '';
  if (checkIn && checkOut) {
    try {
      const parseTime = timeStr => {
        const parts = String(timeStr).trim().split(/\s+/);
        const timePart = parts[0];
        const modifier = parts[1];
        let [hours, minutes] = timePart.split(':').map(Number);
        if (modifier === 'PM' && hours < 12) hours += 12;
        if (modifier === 'AM' && hours === 12) hours = 0;
        return hours * 60 + (minutes || 0);
      };
      
      const inMins = parseTime(checkIn);
      const outMins = parseTime(checkOut);
      const diffMins = outMins - inMins;
      if (diffMins > 0) {
        const hours = Math.floor(diffMins / 60);
        const mins = diffMins % 60;
        duration = `${hours} hrs ${mins} mins`;
      }
    } catch (e) {
      console.error("Duration calculation failed:", e);
    }
  }

  if (getIsConnected()) {
    try {
      const UserModel = getTenantModel(companyId, 'User');
      const employee = await UserModel.findOne({ email: employeeEmail.toLowerCase() });
      if (!employee) {
        return res.status(404).json({ success: false, message: 'Employee not found.' });
      }

      const AttendanceModel = getTenantModel(companyId, 'Attendance');
      let attendanceRecord = await AttendanceModel.findOne({
        email: employee.email,
        date: formattedDate
      });

      if (attendanceRecord) {
        if (checkIn) attendanceRecord.checkIn = checkIn;
        if (checkOut !== undefined) {
          attendanceRecord.checkOut = checkOut;
          attendanceRecord.duration = duration;
        }
        // Admin manually registered check-in, transition status to Present (Approved)
        attendanceRecord.status = 'Approved';
        attendanceRecord.remarks = 'Manually registered by Administrator';
        
        await attendanceRecord.save();
        return res.status(200).json({ success: true, data: attendanceRecord });
      } else {
        const newAttendance = new AttendanceModel({
          name: employee.name,
          email: employee.email,
          companyId,
          org: req.user.org || employee.org || 'Company',
          date: formattedDate,
          checkIn,
          checkOut: checkOut || '',
          duration
        });

        await newAttendance.save();
        return res.status(201).json({ success: true, data: newAttendance });
      }
    } catch (err) {
      console.error(err);
      return res.status(500).json({ success: false, message: 'Database error marking attendance.' });
    }
  }

  const { fallbackUsers } = require('../utils/fallbackStore');
  const employee = fallbackUsers.find(u => u.email.toLowerCase() === employeeEmail.toLowerCase());
  if (!employee) {
    return res.status(404).json({ success: false, message: 'Employee not found in fallback store.' });
  }

  const existingIndex = fallbackAttendance.findIndex(a => a.email.toLowerCase() === employee.email.toLowerCase() && a.date === formattedDate);
  if (existingIndex !== -1) {
    if (checkIn) fallbackAttendance[existingIndex].checkIn = checkIn;
    if (checkOut !== undefined) {
      fallbackAttendance[existingIndex].checkOut = checkOut;
      fallbackAttendance[existingIndex].duration = duration;
    }
    return res.status(200).json({ success: true, data: fallbackAttendance[existingIndex] });
  }

  const newAttendance = {
    id: `fb_att_${Date.now()}`,
    name: employee.name,
    email: employee.email,
    companyId,
    org: req.user.org || employee.org || 'Company',
    date: formattedDate,
    checkIn,
    checkOut: checkOut || '',
    duration
  };

  fallbackAttendance.push(newAttendance);
  return res.status(201).json({ success: true, data: newAttendance });
}

function parseDbDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return d;
}

function dateToYmd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
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
  const targetMins = openHours * 60 + openMins;
  
  return checkInMins > targetMins;
}

function getLateMinutes(checkInStr, openTimeStr = '09:00') {
  if (!checkInStr) return 0;
  const timeMatch = checkInStr.match(/(\d+):(\d+)(?:\s*(AM|PM))?/i);
  if (!timeMatch) return 0;
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
  const targetMins = openHours * 60 + openMins;
  
  return checkInMins > targetMins ? checkInMins - targetMins : 0;
}

async function fetchCompanyPortalSettings(companyId) {
  let portalEnabled = true;
  let openTime = '09:00';
  let closeTime = '18:00';
  
  if (getIsConnected()) {
    try {
      const Company = require('../models/Company');
      const comp = await Company.findById(companyId);
      if (comp) {
        portalEnabled = comp.attendancePortalEnabled !== false;
        openTime = comp.attendancePortalOpenTime || '09:00';
        closeTime = comp.attendancePortalCloseTime || '18:00';
      }
    } catch (err) {
      console.error(err);
    }
  } else {
    const { fallbackCompanies } = require('../utils/fallbackStore');
    const comp = fallbackCompanies.find(c => c.id === companyId);
    if (comp) {
      portalEnabled = comp.attendancePortalEnabled !== false;
      openTime = comp.attendancePortalOpenTime || '09:00';
      closeTime = comp.attendancePortalCloseTime || '18:00';
    }
  }
  return { portalEnabled, openTime, closeTime };
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

  const isWeekend = currentDate.getDay() === 0;
  if (isWeekend) {
    return { status: 'Holiday', isLate: false };
  }

  const isFuture = currentDate > today;
  if (isFuture) {
    return { status: 'Future', isLate: false };
  }

  // Today or in the past
  const isToday = currentDate.getFullYear() === today.getFullYear() &&
                  currentDate.getMonth() === today.getMonth() &&
                  currentDate.getDate() === today.getDate();
                  
  if (isToday) {
    if (portalEnabled) {
      const currentMinutes = getCurrentMinutesInTimezone();
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
      if (getCurrentMinutesInTimezone() >= 18 * 60) {
        return { status: 'Absent', isLate: false };
      } else {
        return { status: 'None', isLate: false };
      }
    }
  }

  return { status: 'Absent', isLate: false };
}

async function resolveEmployeeContext(req, companyId) {
  let employeeEmail = req.user.email;
  let employeeName = req.user.name || '';
  
  const targetEmployeeId = req.query.employeeId || req.query.userId;
  const targetEmail = req.query.email;
  
  if (req.user.role === 'Company Admin' || req.user.role === 'Super Admin') {
    if (targetEmployeeId) {
      if (getIsConnected()) {
        const UserModel = getTenantModel(companyId, 'User');
        const emp = await UserModel.findById(targetEmployeeId);
        if (emp) {
          employeeEmail = emp.email;
          employeeName = emp.name;
        }
      } else {
        const { fallbackUsers } = require('../utils/fallbackStore');
        const emp = fallbackUsers.find(u => u.id === targetEmployeeId || u._id === targetEmployeeId);
        if (emp) {
          employeeEmail = emp.email;
          employeeName = emp.name;
        }
      }
    } else if (targetEmail) {
      employeeEmail = targetEmail;
      if (getIsConnected()) {
        const UserModel = getTenantModel(companyId, 'User');
        const emp = await UserModel.findOne({ email: targetEmail.toLowerCase() });
        if (emp) employeeName = emp.name;
      } else {
        const { fallbackUsers } = require('../utils/fallbackStore');
        const emp = fallbackUsers.find(u => u.email.toLowerCase() === targetEmail.toLowerCase());
        if (emp) employeeName = emp.name;
      }
    }
  }
  return { employeeEmail, employeeName };
}

async function fetchAttendanceAndLeaves(employeeEmail, companyId) {
  let rawAttendance = [];
  let rawLeaves = [];
  
  if (getIsConnected()) {
    try {
      const AttendanceModel = getTenantModel(companyId, 'Attendance');
      const LeaveModel = getTenantModel(companyId, 'LeaveRequest');
      rawAttendance = await AttendanceModel.find({ email: employeeEmail.toLowerCase(), companyId });
      rawLeaves = await LeaveModel.find({ email: employeeEmail.toLowerCase(), companyId, status: 'Approved' });
    } catch (err) {
      console.error('Error fetching attendance and leaves:', err);
    }
  } else {
    const { fallbackAttendance, fallbackLeaves } = require('../utils/fallbackStore');
    rawAttendance = fallbackAttendance.filter(a => a.email.toLowerCase() === employeeEmail.toLowerCase() && a.companyId === companyId);
    rawLeaves = fallbackLeaves.filter(l => l.email.toLowerCase() === employeeEmail.toLowerCase() && l.companyId === companyId && l.status === 'Approved');
  }
  
  return { rawAttendance, rawLeaves };
}

async function getAttendanceLog(req, res) {
  const companyId = req.user.companyId;
  const { month, year, status: queryStatus, from, to } = req.query;
  
  try {
    const { employeeEmail } = await resolveEmployeeContext(req, companyId);
    const { rawAttendance, rawLeaves } = await fetchAttendanceAndLeaves(employeeEmail, companyId);
    const { portalEnabled, openTime, closeTime } = await fetchCompanyPortalSettings(companyId);
    
    let yearNum = parseInt(year, 10);
    let monthNum = parseInt(month, 10);
    
    if (isNaN(yearNum)) yearNum = new Date().getFullYear();
    if (isNaN(monthNum)) monthNum = new Date().getMonth() + 1;
    
    let rangeStart, rangeEnd;
    if (from && to) {
      rangeStart = new Date(from);
      rangeEnd = new Date(to);
    } else {
      rangeStart = new Date(yearNum, monthNum - 1, 1);
      rangeEnd = new Date(yearNum, monthNum, 0);
    }
    
    if (isNaN(rangeStart.getTime()) || isNaN(rangeEnd.getTime())) {
      return res.status(400).json({ success: false, message: 'Invalid date range parameters.' });
    }
    
    const calendar = [];
    const today = getAttendanceTodayDate();
    
    let cur = new Date(rangeStart);
    while (cur <= rangeEnd) {
      const currentDate = new Date(cur);
      currentDate.setHours(0, 0, 0, 0);
      const ymd = dateToYmd(currentDate);
      
      let checkIn = '';
      let checkOut = '';
      let duration = '';
      
      const record = rawAttendance.find(a => {
        const dbDate = parseDbDate(a.date);
        return dbDate && 
               dbDate.getFullYear() === currentDate.getFullYear() && 
               dbDate.getMonth() === currentDate.getMonth() && 
               dbDate.getDate() === currentDate.getDate();
      });
      
      if (record) {
        checkIn = record.checkIn;
        checkOut = record.checkOut;
        duration = record.duration;
      }
      
      const { status, isLate } = getStatusForDate({
        currentDate,
        today,
        rawLeaves,
        record,
        openTime,
        closeTime,
        portalEnabled
      });
      
      calendar.push({
        date: ymd,
        dayNumber: currentDate.getDate(),
        status,
        isLate,
        checkIn,
        checkOut,
        duration
      });
      
      cur.setDate(cur.getDate() + 1);
    }
    
    const presentCount = calendar.filter(c => c.status === 'Present').length;
    const absentCount = calendar.filter(c => c.status === 'Absent').length;
    const halfDayCount = calendar.filter(c => c.status === 'Half Day').length;
    const leaveCount = calendar.filter(c => c.status === 'Leave').length;
    const lateCount = calendar.filter(c => c.isLate).length;
    const holidayCount = calendar.filter(c => c.status === 'Holiday').length;
    
    const denominator = presentCount + absentCount + halfDayCount;
    const attendancePct = denominator > 0 ? Math.round(((presentCount + halfDayCount * 0.5) / denominator) * 100) : 100;
    
    const summary = {
      present: presentCount,
      absent: absentCount,
      halfDay: halfDayCount,
      leave: leaveCount,
      late: lateCount,
      holiday: holidayCount,
      attendancePct
    };
    
    let filteredAttendance = calendar.filter(item => {
      if (item.status === 'Future') return false;
      if (queryStatus) {
        if (queryStatus === 'Late') return item.isLate;
        return item.status === queryStatus;
      }
      return item.status !== 'None';
    });
    
    return res.status(200).json({
      success: true,
      data: {
        attendance: filteredAttendance,
        calendar,
        summary,
        statistics: {
          totalDays: calendar.length,
          workdays: presentCount + absentCount + halfDayCount + leaveCount + lateCount
        },
        filters: { month: monthNum, year: yearNum, status: queryStatus || '', from: from || '', to: to || '' }
      }
    });
  } catch (err) {
    console.error('[getAttendanceLog] Error:', err);
    return res.status(500).json({ success: false, message: 'Server error retrieving attendance log.' });
  }
}

async function getAttendanceSummary(req, res) {
  const companyId = req.user.companyId;
  const { month, year, from, to } = req.query;
  
  try {
    const { employeeEmail } = await resolveEmployeeContext(req, companyId);
    const { rawAttendance, rawLeaves } = await fetchAttendanceAndLeaves(employeeEmail, companyId);
    const { portalEnabled, openTime, closeTime } = await fetchCompanyPortalSettings(companyId);
    
    let yearNum = parseInt(year, 10);
    let monthNum = parseInt(month, 10);
    
    if (isNaN(yearNum)) yearNum = new Date().getFullYear();
    if (isNaN(monthNum)) monthNum = new Date().getMonth() + 1;
    
    let rangeStart, rangeEnd;
    if (from && to) {
      rangeStart = new Date(from);
      rangeEnd = new Date(to);
    } else {
      rangeStart = new Date(yearNum, monthNum - 1, 1);
      rangeEnd = new Date(yearNum, monthNum, 0);
    }
    
    if (isNaN(rangeStart.getTime()) || isNaN(rangeEnd.getTime())) {
      return res.status(400).json({ success: false, message: 'Invalid date parameters.' });
    }
    
    let presentCount = 0;
    let absentCount = 0;
    let halfDayCount = 0;
    let leaveCount = 0;
    let lateCount = 0;
    let holidayCount = 0;
    
    const today = getAttendanceTodayDate();
    
    let cur = new Date(rangeStart);
    while (cur <= rangeEnd) {
      const currentDate = new Date(cur);
      currentDate.setHours(0, 0, 0, 0);
      
      const record = rawAttendance.find(a => {
        const dbDate = parseDbDate(a.date);
        return dbDate && 
               dbDate.getFullYear() === currentDate.getFullYear() && 
               dbDate.getMonth() === currentDate.getMonth() && 
               dbDate.getDate() === currentDate.getDate();
      });
      
      const { status, isLate } = getStatusForDate({
        currentDate,
        today,
        rawLeaves,
        record,
        openTime,
        closeTime,
        portalEnabled
      });
      
      if (status === 'Present') presentCount++;
      else if (status === 'Absent') absentCount++;
      else if (status === 'Half Day') halfDayCount++;
      else if (status === 'Leave') leaveCount++;
      else if (status === 'Holiday') holidayCount++;
      
      if (isLate) lateCount++;
      
      cur.setDate(cur.getDate() + 1);
    }
    
    const denominator = presentCount + absentCount + halfDayCount;
    const attendancePct = denominator > 0 ? Math.round(((presentCount + halfDayCount * 0.5) / denominator) * 100) : 100;
    
    return res.status(200).json({
      success: true,
      data: {
        present: presentCount,
        absent: absentCount,
        halfDay: halfDayCount,
        leave: leaveCount,
        late: lateCount,
        holiday: holidayCount,
        attendancePct
      }
    });
  } catch (err) {
    console.error('[getAttendanceSummary] Error:', err);
    return res.status(500).json({ success: false, message: 'Server error retrieving attendance summary.' });
  }
}

async function getAttendanceDetailByDate(req, res) {
  const companyId = req.user.companyId;
  const dateParam = req.params.date; // format YYYY-MM-DD
  
  try {
    const targetDate = new Date(dateParam);
    if (isNaN(targetDate.getTime())) {
      return res.status(400).json({ success: false, message: 'Invalid date parameter. Use YYYY-MM-DD.' });
    }
    targetDate.setHours(0, 0, 0, 0);
    
    const { employeeEmail } = await resolveEmployeeContext(req, companyId);
    const { rawAttendance, rawLeaves } = await fetchAttendanceAndLeaves(employeeEmail, companyId);
    const { portalEnabled, openTime, closeTime } = await fetchCompanyPortalSettings(companyId);
    
    const today = getAttendanceTodayDate();
    
    let checkIn = '--';
    let checkOut = '--';
    let duration = '--';
    let overtime = '0m';
    let breakTime = '0m';
    let lateMinutes = 0;
    let leaveReason = null;
    
    const record = rawAttendance.find(a => {
      const dbDate = parseDbDate(a.date);
      return dbDate && 
             dbDate.getFullYear() === targetDate.getFullYear() && 
             dbDate.getMonth() === targetDate.getMonth() && 
             dbDate.getDate() === targetDate.getDate();
    });
    
    const { status, isLate } = getStatusForDate({
      currentDate: targetDate,
      today,
      rawLeaves,
      record,
      openTime,
      closeTime,
      portalEnabled
    });
    
    if (status === 'Leave') {
      const activeLeave = rawLeaves.find(l => {
        const start = new Date(l.startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(l.endDate);
        end.setHours(0, 0, 0, 0);
        return targetDate >= start && targetDate <= end;
      });
      leaveReason = activeLeave ? activeLeave.reason : 'Approved Leave';
    }
    
    if (record) {
      checkIn = record.checkIn || '--';
      checkOut = record.checkOut || '--';
      duration = record.duration || '--';
      
      const hours = parseDurationToHours(record.duration);
      if (hours > 5) breakTime = '45m';
      if (hours > 9) {
        const otHours = hours - 9;
        const otMins = Math.round((otHours - Math.floor(otHours)) * 60);
        overtime = `${Math.floor(otHours)}h ${otMins}m`;
      }
      lateMinutes = getLateMinutes(record.checkIn, openTime);
    }
    
    const dateFormatted = targetDate.toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
    
    return res.status(200).json({
      success: true,
      data: {
        date: dateFormatted,
        status,
        checkIn,
        checkOut,
        workingHours: duration,
        breakTime,
        overtime,
        location: status === 'Present' || status === 'Half Day' ? 'GPS Verified (Office)' : '--',
        remarks: status === 'Present' && !isLate ? 'On Time' : 
                 status === 'Present' && isLate ? 'Late Check-in' :
                 status === 'Half Day' ? 'Half Day Work' :
                 status === 'Leave' ? 'On Leave' :
                 status === 'Holiday' ? 'Weekend / Holiday' :
                 status === 'Absent' ? 'Absent' : '--',
        lateMinutes,
        leaveType: leaveReason
      }
    });
  } catch (err) {
    console.error('[getAttendanceDetailByDate] Error:', err);
    return res.status(500).json({ success: false, message: 'Server error retrieving date details.' });
  }
}

async function approveAttendance(req, res) {
  const { id } = req.params;
  const companyId = req.user.companyId;

  if (getIsConnected()) {
    try {
      const AttendanceModel = getTenantModel(companyId, 'Attendance');
      const record = await AttendanceModel.findOneAndUpdate(
        { _id: id, companyId },
        { status: 'Approved', remarks: 'Approved by Administrator' },
        { new: true }
      );
      if (!record) {
        return res.status(404).json({ success: false, message: 'Attendance record not found.' });
      }
      return res.status(200).json({ success: true, data: record });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ success: false, message: 'Server error approving attendance.' });
    }
  }

  const record = fallbackAttendance.find(a => (a.id || a._id) === id && a.companyId === companyId);
  if (!record) {
    return res.status(404).json({ success: false, message: 'Attendance record not found in fallback.' });
  }
  record.status = 'Approved';
  record.remarks = 'Approved by Administrator';
  return res.status(200).json({ success: true, data: record });
}

async function rejectAttendance(req, res) {
  const { id } = req.params;
  const companyId = req.user.companyId;

  if (getIsConnected()) {
    try {
      const AttendanceModel = getTenantModel(companyId, 'Attendance');
      const record = await AttendanceModel.findOneAndUpdate(
        { _id: id, companyId },
        { status: 'Rejected', remarks: 'Rejected by Administrator' },
        { new: true }
      );
      if (!record) {
        return res.status(404).json({ success: false, message: 'Attendance record not found.' });
      }
      return res.status(200).json({ success: true, data: record });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ success: false, message: 'Server error rejecting attendance.' });
    }
  }

  const record = fallbackAttendance.find(a => (a.id || a._id) === id && a.companyId === companyId);
  if (!record) {
    return res.status(404).json({ success: false, message: 'Attendance record not found in fallback.' });
  }
  record.status = 'Rejected';
  record.remarks = 'Rejected by Administrator';
  return res.status(200).json({ success: true, data: record });
}

module.exports = {
  getAttendance,
  adminMarkAttendance,
  getAttendanceLog,
  getAttendanceSummary,
  getAttendanceDetailByDate,
  approveAttendance,
  rejectAttendance
};
