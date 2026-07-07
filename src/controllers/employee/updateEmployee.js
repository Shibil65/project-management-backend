const bcrypt = require("bcryptjs");
const { getIsConnected } = require("../../config/db");
const User = require("../../models/User");
const Employee = require("../../models/Employee");
const getTenantModel = require("../../utils/tenantDb");
const { fallbackUsers } = require("../../utils/fallbackStore");

async function updateEmployee(req, res) {
  const companyId = req.user.companyId;
  const employeeId = req.params.id;
  const { name, email, password, phone, domain, location } = req.body;

  if (getIsConnected()) {
    try {
      const EmployeeModel = getTenantModel(companyId, "Employee");
      const UserModel = getTenantModel(companyId, "User");

      let employeeProfile = await EmployeeModel.findById(employeeId);
      let authUser = null;

      if (employeeProfile) {
        authUser = employeeProfile.authUserId
          ? await UserModel.findById(employeeProfile.authUserId)
          : await User.findOne({ email: employeeProfile.email.toLowerCase() }).setOptions({ bypassTenant: true });
      } else {
        authUser = await UserModel.findById(employeeId);
      }

      if (!employeeProfile && !authUser) {
        return res.status(404).json({ success: false, message: "Employee not found." });
      }

      const currentEmail = (employeeProfile?.email || authUser?.email || '').toLowerCase();
      const updateData = {};
      if (name !== undefined) updateData.name = name.trim();

      if (email !== undefined) {
        const normalizedEmail = email.trim().toLowerCase();
        if (normalizedEmail !== currentEmail) {
          const existingUser = await User.findOne({ email: normalizedEmail }).setOptions({ bypassTenant: true });
          if (existingUser) {
            return res.status(400).json({ success: false, message: "An account with this email address already exists." });
          }
          const existingEmployee = await Employee.findOne({ email: normalizedEmail }).setOptions({ bypassTenant: true });
          if (existingEmployee) {
            return res.status(400).json({ success: false, message: "An employee profile with this email address already exists." });
          }
          updateData.email = normalizedEmail;
        }
      }

      if (phone !== undefined) updateData.phone = phone;
      if (domain !== undefined) updateData.domain = domain;
      if (location !== undefined) updateData.location = location;

      const authUpdateData = { ...updateData };
      if (password) authUpdateData.password = await bcrypt.hash(password, 10);

      if (authUser) {
        await User.findByIdAndUpdate(authUser._id, { $set: authUpdateData });
      } else if (currentEmail) {
        await User.findOneAndUpdate({ email: currentEmail }, { $set: authUpdateData }).setOptions({ bypassTenant: true });
      }

      let updatedProfile = null;
      if (employeeProfile) {
        updatedProfile = await EmployeeModel.findByIdAndUpdate(employeeProfile._id, { $set: updateData }, { new: true });
      } else if (authUser) {
        updatedProfile = await EmployeeModel.findOneAndUpdate(
          { email: currentEmail, companyId },
          { $set: { ...updateData, authUserId: authUser._id } },
          { new: true, upsert: true, setDefaultsOnInsert: true }
        );
      }

      return res.status(200).json({ success: true, data: updatedProfile || authUser });
    } catch (err) {
      console.error("[updateEmployee] Error:", err);
      return res.status(500).json({ success: false, message: "Server error during employee update." });
    }
  }

  const index = fallbackUsers.findIndex(u => (u.id === employeeId || u._id === employeeId) && u.companyId === companyId);
  if (index === -1) {
    return res.status(404).json({ success: false, message: "Employee not found in fallback store." });
  }

  const existing = fallbackUsers[index];
  if (email !== undefined) {
    const normalizedEmail = email.trim().toLowerCase();
    if (normalizedEmail !== existing.email.toLowerCase()) {
      const emailExists = fallbackUsers.some(u => u.email.toLowerCase() === normalizedEmail);
      if (emailExists) {
        return res.status(400).json({ success: false, message: "An account with this email address already exists." });
      }
    }
  }

  const hashed = password ? await bcrypt.hash(password, 10) : existing.password;
  fallbackUsers[index] = {
    ...existing,
    name: name !== undefined ? name.trim() : existing.name,
    email: email !== undefined ? email.trim().toLowerCase() : existing.email,
    phone: phone !== undefined ? phone : existing.phone,
    domain: domain !== undefined ? domain : existing.domain,
    location: location !== undefined ? location : existing.location,
    password: hashed
  };

  const returnData = { ...fallbackUsers[index] };
  delete returnData.password;
  return res.status(200).json({ success: true, data: returnData });
}

module.exports = { updateEmployee };
