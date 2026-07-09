const mongoose = require('mongoose');
const { getIsConnected } = require('../config/db');
const AttendanceQrSession = require('../models/attendanceQrSession.model');
const AttendanceSettings = require('../models/attendanceSettings.model');
const Company = require('../models/Company');
const getTenantModel = require('../utils/tenantDb');
const { 
  fallbackAttendanceSettings, 
  fallbackAttendanceQrSessions, 
  fallbackAttendance,
  fallbackCompanies 
} = require('../utils/fallbackStore');
const { getAttendancePortalStatus } = require('../utils/attendancePortalWindow');

const attendanceQrService = {
  async getCompanySettings(companyId, adminEmail) {
    if (getIsConnected()) {
      let settings = await AttendanceSettings.findOne({ companyId }).setOptions({ bypassTenant: true });
      if (!settings) {
        settings = new AttendanceSettings({
          companyId,
          qrAttendanceEnabled: true,
          qrExpiresInMinutes: 5,
          requireAdminPortalHeartbeat: true,
          createdBy: adminEmail
        });
        await settings.save();
      }
      return settings;
    } else {
      let settings = fallbackAttendanceSettings.find(s => s.companyId === companyId);
      if (!settings) {
        settings = {
          id: `fb_as_${Date.now()}`,
          companyId,
          qrAttendanceEnabled: true,
          qrExpiresInMinutes: 5,
          requireAdminPortalHeartbeat: true,
          createdBy: adminEmail
        };
        fallbackAttendanceSettings.push(settings);
      }
      return settings;
    }
  },

  async updateSettings(companyId, updates) {
    if (getIsConnected()) {
      return await AttendanceSettings.findOneAndUpdate(
        { companyId },
        { $set: updates },
        { new: true, upsert: true }
      ).setOptions({ bypassTenant: true });
    } else {
      let settings = fallbackAttendanceSettings.find(s => s.companyId === companyId);
      if (!settings) {
        settings = {
          id: `fb_as_${Date.now()}`,
          companyId,
          qrAttendanceEnabled: true,
          qrExpiresInMinutes: 5,
          requireAdminPortalHeartbeat: true
        };
        fallbackAttendanceSettings.push(settings);
      }
      Object.assign(settings, updates);
      return settings;
    }
  },

  async getCompanyDoc(companyId) {
    if (getIsConnected()) {
      return await Company.findById(companyId);
    } else {
      return fallbackCompanies.find(c => (c.id || c._id) === companyId);
    }
  },

  async getSession(sessionId, companyId) {
    if (!mongoose.Types.ObjectId.isValid(sessionId) || !mongoose.Types.ObjectId.isValid(companyId)) {
      return null;
    }
    const session = await AttendanceQrSession.findOne({ _id: sessionId }).setOptions({ bypassTenant: true });
    if (session && session.companyId.toString() !== companyId.toString()) {
      return null;
    }
    return session;
  },

  async closeActiveSessions(companyId) {
    await AttendanceQrSession.updateMany(
      { companyId, isActive: true },
      { $set: { isActive: false, sessionStatus: 'closed', closedAt: new Date() } }
    ).setOptions({ bypassTenant: true });
  },

  async saveSession(sessionObj, isNew = false) {
    if (isNew) {
      const doc = new AttendanceQrSession(sessionObj);
      await doc.save();
      return doc;
    } else {
      await sessionObj.save();
      return sessionObj;
    }
  },

  async getTodayAttendanceRecord(companyId, email, dateCandidates) {
    if (getIsConnected()) {
      const AttendanceModel = getTenantModel(companyId, 'Attendance');
      return await AttendanceModel.findOne({
        email,
        date: { $in: dateCandidates }
      });
    } else {
      return fallbackAttendance.find(a => a.email === email && dateCandidates.includes(a.date));
    }
  },

  async createAttendance(companyId, recordData) {
    if (getIsConnected()) {
      const AttendanceModel = getTenantModel(companyId, 'Attendance');
      const record = new AttendanceModel(recordData);
      await record.save();
      return record;
    } else {
      const record = {
        id: `fb_att_${Date.now()}`,
        ...recordData
      };
      fallbackAttendance.push(record);
      return record;
    }
  }
};

module.exports = attendanceQrService;
