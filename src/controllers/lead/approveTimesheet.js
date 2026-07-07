const {
  getIsConnected
} = require("../../config/db");
const getTenantModel = require("../../utils/tenantDb");
const {
  fallbackProjects,
  fallbackUsers,
  fallbackClients,
  fallbackTimesheets
} = require("../../utils/fallbackStore");

function getEffectiveUser(req) {
  const user = {
    ...req.user
  };
  const overrideEmail = req.query.leadEmail || req.headers["x-lead-email"];
  if (overrideEmail && req.user.role === "Company Admin") {
    user.email = overrideEmail;
    user.role = "Project Lead";
  }
  return user;
}

function isProjectLead(project, user) {
  if (user.role === "Company Admin") return true;
  const email = user.email.toLowerCase();
  const userId = user.userId || "";
  const leadId = (project.leadId || "").toLowerCase();
  return leadId === email || leadId === userId || project.clientEmail && project.clientEmail.toLowerCase() === email;
}

async function approveTimesheet(req, res) {
  const {
    id
  } = req.params;
  const {
    status
  } = req.body;
  const companyId = req.user.companyId;
  const user = getEffectiveUser(req);
  if (!status || !["Approved", "Rejected"].includes(status)) {
    return res.status(400).json({
      success: false,
      message: "Status must be Approved or Rejected."
    });
  }
  try {
    if (getIsConnected()) {
      const TimesheetModel = getTenantModel(companyId, "Timesheet");
      const timesheet = await TimesheetModel.findById(id);
      if (!timesheet) {
        return res.status(404).json({
          success: false,
          message: "Timesheet not found."
        });
      }
      timesheet.status = status;
      timesheet.approvedBy = user.email;
      await timesheet.save();
      return res.status(200).json({
        success: true,
        data: timesheet
      });
    } else {
      const timesheet = fallbackTimesheets.find(t => t.id === id);
      if (!timesheet) {
        return res.status(404).json({
          success: false,
          message: "Timesheet not found."
        });
      }
      timesheet.status = status;
      timesheet.approvedBy = user.email;
      return res.status(200).json({
        success: true,
        data: timesheet
      });
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Server error approving timesheet."
    });
  }
}

module.exports = { approveTimesheet };

