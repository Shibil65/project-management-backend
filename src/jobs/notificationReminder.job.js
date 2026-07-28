/**
 * Scheduled Notification Reminder Job
 * Can be triggered via external cron job, endpoint, or internal server timer.
 * Prevents duplicate reminders using deduplication keys.
 */

const { getIsConnected } = require('../config/db');
const { createAndDispatchNotification } = require('../services/notificationEvent.service');

async function processTaskDeadlineReminders() {
  if (!getIsConnected()) return 0;
  try {
    const Project = require('../models/Project');
    const now = new Date();
    const deadlineWindow = new Date(now.getTime() + 24 * 60 * 60 * 1000); // within 24h

    // Find active projects with pending tasks
    const projects = await Project.find({
      'tasks.dueDate': { $gte: now, $lte: deadlineWindow },
      'tasks.status': { $ne: 'Completed' }
    });

    let count = 0;
    for (const project of projects) {
      if (!project.tasks || !project.tasks.length) continue;

      for (const task of project.tasks) {
        if (!task.dueDate || task.status === 'Completed') continue;
        if (task.dueDate < now || task.dueDate > deadlineWindow) continue;

        // Determine assignee IDs
        const assignees = task.assignedTo || [];
        for (const assigneeId of assignees) {
          if (!assigneeId) continue;
          const windowStr = now.toISOString().slice(0, 10);
          const dedupKey = `task-deadline:${task._id}:${assigneeId}:${windowStr}`;

          const notif = await createAndDispatchNotification({
            companyId: project.companyId,
            recipientId: assigneeId,
            actorId: null,
            type: 'deadlineReminder',
            title: 'Task Deadline Approaching',
            message: `Reminder: Task "${task.title || 'Assigned task'}" is due soon.`,
            route: `/employee/tasks/${task._id}`,
            entityType: 'Task',
            entityId: task._id,
            deduplicationKey: dedupKey
          });

          if (notif) count++;
        }
      }
    }
    return count;
  } catch (err) {
    console.error('[NotificationJob] Error processing task deadline reminders:', err.message);
    return 0;
  }
}

async function processForgottenCheckoutReminders() {
  if (!getIsConnected()) return 0;
  try {
    const Attendance = require('../models/Attendance');
    const todayStr = new Date().toISOString().slice(0, 10);

    // Find attendance records checked in today without check-out
    const records = await Attendance.find({
      date: todayStr,
      checkIn: { $ne: null },
      checkOut: null
    });

    let count = 0;
    for (const record of records) {
      const dedupKey = `attendance-checkout:${record._id}:${todayStr}`;

      const notif = await createAndDispatchNotification({
        companyId: record.companyId,
        recipientId: record.employeeId || record.userId,
        actorId: null,
        type: 'forgotCheckout',
        title: 'Attendance Reminder',
        message: 'Reminder: You have not checked out for today. Please update your status.',
        route: '/employee/attendance',
        entityType: 'Attendance',
        entityId: record._id,
        deduplicationKey: dedupKey
      });

      if (notif) count++;
    }
    return count;
  } catch (err) {
    console.error('[NotificationJob] Error processing forgotten checkout reminders:', err.message);
    return 0;
  }
}

/**
 * Send push notification when attendance portal is closing soon (within 30 mins)
 */
async function processPortalClosingReminders() {
  if (!getIsConnected()) return 0;
  try {
    const Company = require('../models/Company');
    const getTenantModel = require('../utils/tenantDb');
    const {
      getAttendanceTimezone,
      getCurrentMinutesInTimezone,
      parseTimeToMinutes,
      formatTimeLabel,
      getAttendanceDateCandidates
    } = require('../utils/attendancePortalWindow');

    const now = new Date();
    const timezone = getAttendanceTimezone();
    const currentMinutes = getCurrentMinutesInTimezone(now, timezone);
    const todayCandidates = getAttendanceDateCandidates(now, timezone);
    const todayStr = new Date().toISOString().slice(0, 10);

    let count = 0;
    const companies = await Company.find({ status: 'Active', isDeleted: { $ne: true } });

    for (const company of companies) {
      if (company.attendancePortalEnabled === false) continue;
      const closeTime = company.attendancePortalCloseTime || '18:00';
      const closeMinutes = parseTimeToMinutes(closeTime);
      if (closeMinutes === null) continue;

      const minutesRemaining = closeMinutes - currentMinutes;

      // Send reminder 5 minutes before portal closes (e.g., at 5:55 PM for a 6:00 PM closing time)
      if (minutesRemaining > 0 && minutesRemaining <= 5) {
        const TenantAttendance = getTenantModel(company._id.toString(), 'Attendance');

        const checkedInRecords = await TenantAttendance.find({
          companyId: company._id,
          date: { $in: todayCandidates },
          checkIn: { $exists: true, $nin: ['', '-'] },
          $or: [
            { checkOut: { $exists: false } },
            { checkOut: '' },
            { checkOut: '-' }
          ]
        });

        const formattedCloseTime = formatTimeLabel(closeTime);

        for (const rec of checkedInRecords) {
          const recipientId = rec.employeeId || rec.userId;
          if (!recipientId) continue;

          const dedupKey = `portal-closing:${company._id}:${recipientId}:${todayStr}`;

          const notif = await createAndDispatchNotification({
            companyId: company._id,
            recipientId,
            actorId: null,
            type: 'attendanceReminder',
            title: 'Attendance Portal Closing Soon',
            message: `The attendance portal will close in ${minutesRemaining} minute(s) at ${formattedCloseTime}. Please check out before it closes!`,
            route: '/employee/attendance',
            entityType: 'Attendance',
            entityId: rec._id,
            deduplicationKey: dedupKey
          });

          if (notif) count++;
        }
      }
    }
    return count;
  } catch (err) {
    console.error('[NotificationJob] Error processing portal closing reminders:', err.message);
    return 0;
  }
}

async function runReminderJobs() {
  const deadlineCount = await processTaskDeadlineReminders();
  const checkoutCount = await processForgottenCheckoutReminders();
  const closingCount = await processPortalClosingReminders();
  return { deadlineCount, checkoutCount, closingCount };
}

module.exports = {
  processTaskDeadlineReminders,
  processForgottenCheckoutReminders,
  processPortalClosingReminders,
  runReminderJobs
};
