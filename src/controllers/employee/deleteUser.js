const bcrypt = require("bcryptjs");
const {
  getIsConnected
} = require("../../config/db");
const User = require("../../models/User");
const Company = require("../../models/Company");
const getTenantModel = require("../../utils/tenantDb");
const {
  fallbackUsers,
  fallbackCompanies
} = require("../../utils/fallbackStore");
const { updateCompanyEmployeeCount } = require("../../utils/companyHelper");

async function deleteUser(req, res) {
  const {
    id
  } = req.params;
  const role = req.user.role;
  if (role !== "Super Admin") {
    return res.status(403).json({
      success: false,
      message: "Forbidden. Only Super Admin can delete users."
    });
  }
  if (getIsConnected()) {
    try {
      const sysUser = await User.findById(id);
      if (!sysUser) {
        return res.status(404).json({
          success: false,
          message: "User not found in system catalog."
        });
      }
      await User.findByIdAndDelete(id);
      if (sysUser.companyId) {
        const UserModel = getTenantModel(sysUser.companyId, "User");
        await UserModel.findOneAndDelete({
          email: sysUser.email
        });
        await updateCompanyEmployeeCount(sysUser.companyId);
      }
      return res.status(200).json({
        success: true,
        message: "User deleted successfully."
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({
        success: false,
        message: "Database error deleting user."
      });
    }
  }
  const index = fallbackUsers.findIndex(u => u.id === id || u._id === id);
  if (index !== -1) {
    const companyId = fallbackUsers[index].companyId;
    fallbackUsers.splice(index, 1);
    await updateCompanyEmployeeCount(companyId);
    return res.status(200).json({
      success: true,
      message: "User deleted successfully from fallback store."
    });
  }
  return res.status(404).json({
    success: false,
    message: "User not found."
  });
}

module.exports = { deleteUser };

