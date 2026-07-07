const {
  getIsConnected
} = require("../../config/db");
const Company = require("../../models/Company");
const getTenantModel = require("../../utils/tenantDb");
const {
  fallbackProjects,
  fallbackCompanies
} = require("../../utils/fallbackStore");

async function getClientMessages(req, res) {
  const {
    key
  } = req.params;
  if (getIsConnected()) {
    try {
      const Project = require("../../models/Project");
      const project = await Project.findOne({
        clientAccessKey: key,
        isDeleted: {
          $ne: true
        }
      }).setOptions({ bypassTenant: true });
      if (project) {
        const { tenantStorage } = require("../../utils/tenantPlugin");
        return tenantStorage.run(project.companyId, async () => {
          const clientEmail = project.clientEmail;
          const Message = require("../../models/Message");
          const list = await Message.find({
            $or: [{
              sender: clientEmail
            }, {
              receiver: clientEmail
            }]
          }).sort({
            createdAt: 1
          });
          return res.status(200).json({
            success: true,
            data: list
          });
        });
      }
    } catch (err) {
      console.error(err);
      return res.status(500).json({
        success: false,
        message: "Internal server error."
      });
    }
  }
  const project = fallbackProjects.find(p => p.clientAccessKey === key && !p.isDeleted);
  if (project) {
    const clientEmail = project.clientEmail;
    const fallbackMessages = require("../../utils/fallbackStore").fallbackMessages || [];
    const list = fallbackMessages.filter(m => m.sender === clientEmail || m.receiver === clientEmail);
    return res.status(200).json({
      success: true,
      data: list
    });
  }
  return res.status(404).json({
    success: false,
    message: "Project not found."
  });
}

module.exports = { getClientMessages };

