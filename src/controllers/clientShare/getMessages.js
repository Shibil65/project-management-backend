const service = require("../../services/clientShareService");
const {
  getIsConnected
} = require("../../config/db");
const getTenantModel = require("../../utils/tenantDb");
const {
  fallbackMessages,
  fallbackUsers
} = require("../../utils/fallbackStore");

async function getMessages(req, res) {
  const {
    token
  } = req.params;
  try {
    const data = await service.findProjectByAccessKey(token);
    if (!data) return res.status(404).json({
      success: false,
      message: "Project share link not found."
    });
    const {
      project,
      companyId
    } = data;
    const clientEmail = project.clientEmail;
    if (getIsConnected()) {
      const Message = getTenantModel(companyId, "Message");
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
    }
    const list = fallbackMessages.filter(m => m.sender === clientEmail || m.receiver === clientEmail);
    return res.status(200).json({
      success: true,
      data: list
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Server error loading messages."
    });
  }
}

module.exports = { getMessages };

