const { getIsConnected } = require("../../config/db");
const User = require("../../models/User");
const getTenantModel = require("../../utils/tenantDb");
const { fallbackUsers } = require("../../utils/fallbackStore");
const { updateCompanyEmployeeCount } = require("../../utils/companyHelper");

async function deleteEmployee(req, res) {
  const companyId = req.user.companyId;
  const employeeId = req.params.id;

  if (getIsConnected()) {
    try {
      const EmployeeModel = getTenantModel(companyId, "Employee");
      const UserModel = getTenantModel(companyId, "User");

      const employeeProfile = await EmployeeModel.findById(employeeId);
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

      if (employeeProfile) await EmployeeModel.findByIdAndDelete(employeeProfile._id);
      if (authUser) await User.findByIdAndDelete(authUser._id);
      if (!authUser && employeeProfile?.email) {
        await User.findOneAndDelete({ email: employeeProfile.email.toLowerCase() }).setOptions({ bypassTenant: true });
      }
      if (!employeeProfile && authUser?.email) {
        await EmployeeModel.findOneAndDelete({ email: authUser.email.toLowerCase(), companyId });
      }

      await updateCompanyEmployeeCount(companyId);

      return res.status(200).json({ success: true, message: "Employee deleted successfully." });
    } catch (err) {
      console.error("[deleteEmployee] Error:", err);
      return res.status(500).json({ success: false, message: "Database error deleting employee." });
    }
  }

  const index = fallbackUsers.findIndex(u => (u.id === employeeId || u._id === employeeId) && u.companyId === companyId);
  if (index === -1) {
    return res.status(404).json({ success: false, message: "Employee not found in fallback store." });
  }

  fallbackUsers.splice(index, 1);
  await updateCompanyEmployeeCount(companyId);
  return res.status(200).json({ success: true, message: "Employee deleted successfully from fallback store." });
}

module.exports = { deleteEmployee };
