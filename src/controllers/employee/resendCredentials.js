const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { getIsConnected } = require('../../config/db');
const User = require('../../models/User');
const Employee = require('../../models/Employee');
const { fallbackUsers } = require('../../utils/fallbackStore');
const { sendEmployeeCredentialsEmail } = require('../../services/email/emailService');
const { getEmployeePortalUrl } = require('../../utils/frontendUrl');
const generateTemporaryPassword = require('../../utils/generateTemporaryPassword');

function sameId(left, right) {
  return left && right && String(left) === String(right);
}

function isSameCompany(record, companyId, role) {
  if (role === 'Super Admin') return true;
  return sameId(record?.companyId, companyId);
}

async function resendCredentials(req, res) {
  const { id } = req.params;
  const companyEmail = req.user.email;
  const companyName = req.user.org;
  const companyId = req.user.companyId;

  try {
    let name = '';
    let email = '';
    const tempPassword = generateTemporaryPassword();
    const hashed = await bcrypt.hash(tempPassword, 10);

    if (getIsConnected()) {
      let user = null;
      let employeeProfile = null;

      if (mongoose.Types.ObjectId.isValid(id)) {
        user = await User.findById(id).setOptions({ bypassTenant: true });
        employeeProfile = await Employee.findById(id).setOptions({ bypassTenant: true });
      }

      if (!employeeProfile && user) {
        employeeProfile = await Employee.findOne({
          $or: [
            { authUserId: user._id },
            { email: user.email?.toLowerCase(), companyId: user.companyId }
          ]
        }).setOptions({ bypassTenant: true });
      }

      if (!user && employeeProfile?.authUserId) {
        user = await User.findById(employeeProfile.authUserId).setOptions({ bypassTenant: true });
      }

      if (!user && employeeProfile?.email) {
        user = await User.findOne({ email: employeeProfile.email.toLowerCase() }).setOptions({ bypassTenant: true });
      }

      const source = employeeProfile || user;
      if (!source) {
        return res.status(404).json({ success: false, message: 'Employee not found.' });
      }

      if (!isSameCompany(source, companyId, req.user.role)) {
        return res.status(403).json({ success: false, message: 'You cannot resend credentials for an employee outside your company.' });
      }

      if (!user && employeeProfile) {
        user = new User({
          name: employeeProfile.name,
          email: employeeProfile.email.toLowerCase(),
          password: hashed,
          companyId: employeeProfile.companyId || companyId,
          org: employeeProfile.org || employeeProfile.companyName || companyName,
          role: 'Employee',
          phone: employeeProfile.phone || '',
          domain: employeeProfile.domain || '',
          location: employeeProfile.location || '',
          avatarColor: employeeProfile.avatarColor || '#6366f1',
          status: employeeProfile.status || 'Active',
          portalSetup: false,
          mustChangePassword: true
        });
        await user.save();
        employeeProfile.authUserId = user._id;
        await employeeProfile.save();
      } else if (user) {
        user.password = hashed;
        user.portalSetup = false;
        user.mustChangePassword = true;
        await user.save();
      }

      name = source.name;
      email = source.email;
    } else {
      const user = fallbackUsers.find(u => u.id === id || u._id === id || u.authUserId === id);
      if (!user) {
        return res.status(404).json({ success: false, message: 'Employee not found in fallback store.' });
      }
      if (!isSameCompany(user, companyId, req.user.role)) {
        return res.status(403).json({ success: false, message: 'You cannot resend credentials for an employee outside your company.' });
      }
      name = user.name;
      email = user.email;
      user.password = hashed;
      user.portalSetup = false;
      user.mustChangePassword = true;
    }

    const portalUrl = getEmployeePortalUrl(req);
    const emailResult = await sendEmployeeCredentialsEmail(email, name, companyName, tempPassword, portalUrl, companyEmail);

    if (emailResult.emailSent) {
      return res.status(200).json({
        success: true,
        message: `Credentials resent successfully to ${email}.`,
        emailSent: true
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Employee password was reset, but the credentials email could not be sent. Check SMTP settings.',
      emailSent: false
    });
  } catch (err) {
    console.error('Error resending credentials:', err);
    return res.status(500).json({
      success: false,
      message: 'Server error during credentials reset.',
      error: err.message
    });
  }
}

module.exports = { resendCredentials };