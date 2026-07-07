const { getIsConnected } = require("../../config/db");
const getTenantModel = require("../../utils/tenantDb");
const { fallbackUsers } = require("../../utils/fallbackStore");

async function getEmployees(req, res) {
  const companyId = req.user.companyId;
  if (getIsConnected()) {
    try {
      const EmployeeModel = getTenantModel(companyId, "Employee");
      const list = await EmployeeModel.find({
        companyId,
        status: { $ne: "Deleted" }
      }).sort({ createdAt: -1 });

      return res.status(200).json({ success: true, data: list });
    } catch (err) {
      console.error("[getEmployees] Employee collection lookup failed:", err.message);
      try {
        const UserModel = getTenantModel(companyId, "User");
        const list = await UserModel.find({ companyId, role: "Employee", status: { $ne: "Deleted" } }).sort({ createdAt: -1 });
        return res.status(200).json({ success: true, data: list });
      } catch (fallbackErr) {
        console.error("[getEmployees] User fallback lookup failed:", fallbackErr.message);
      }
    }
  }

  const list = fallbackUsers.filter(u => u.companyId === companyId && u.role === "Employee" && u.status !== "Deleted");
  return res.status(200).json({ success: true, data: list });
}

module.exports = { getEmployees };
