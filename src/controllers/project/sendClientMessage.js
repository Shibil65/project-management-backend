const {
  getIsConnected
} = require("../../config/db");
const Company = require("../../models/Company");
const getTenantModel = require("../../utils/tenantDb");
const {
  fallbackProjects,
  fallbackCompanies
} = require("../../utils/fallbackStore");

async function sendClientMessage(req, res) {
  const {
    key
  } = req.params;
  const {
    receiver,
    text,
    imageUrl
  } = req.body;
  if (!receiver || !text && !imageUrl) {
    return res.status(400).json({
      success: false,
      message: "Receiver and text/image are required."
    });
  }
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
          const Message = require("../../models/Message");
          const newMessage = new Message({
            sender: project.clientEmail,
            senderName: `${project.clientName || "Client"} (${project.name})`,
            receiver,
            text: text || "",
            imageUrl: imageUrl || "",
            companyId: project.companyId
          });
          await newMessage.save();
          return res.status(201).json({
            success: true,
            data: newMessage
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
    const fallbackMessages = require("../../utils/fallbackStore").fallbackMessages || [];
    const newMessage = {
      id: `msg_${Date.now()}`,
      sender: project.clientEmail,
      senderName: `${project.clientName || "Client"} (${project.name})`,
      receiver,
      text: text || "",
      imageUrl: imageUrl || "",
      createdAt: new Date().toISOString()
    };
    fallbackMessages.push(newMessage);
    return res.status(201).json({
      success: true,
      data: newMessage
    });
  }
  return res.status(404).json({
    success: false,
    message: "Project not found."
  });
}

module.exports = { sendClientMessage };

