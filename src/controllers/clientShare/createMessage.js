const service = require("../../services/clientShareService");
const {
  getIsConnected
} = require("../../config/db");
const getTenantModel = require("../../utils/tenantDb");
const {
  fallbackMessages,
  fallbackUsers
} = require("../../utils/fallbackStore");

async function createMessage(req, res) {
  const {
    token
  } = req.params;
  const {
    receiver,
    text,
    imageUrl
  } = req.body;
  if (!receiver || !text && !imageUrl) {
    return res.status(400).json({
      success: false,
      message: "Receiver and message text/image are required."
    });
  }
  try {
    const data = await service.findProjectByAccessKey(token);
    if (!data) return res.status(404).json({
      success: false,
      message: "Project share link not found."
    });
    const {
      project,
      companyId,
      org
    } = data;
    const clientEmail = project.clientEmail;
    const msgData = {
      sender: clientEmail,
      senderName: `${project.clientName || "Client"} (${project.name})`,
      receiver,
      text: text || "",
      imageUrl: imageUrl || "",
      companyId,
      org: org || ""
    };
    if (getIsConnected()) {
      const Message = getTenantModel(companyId, "Message");
      const newMessage = new Message(msgData);
      await newMessage.save();
      return res.status(201).json({
        success: true,
        data: newMessage
      });
    }
    const newMessage = {
      id: `msg_${Date.now()}`,
      ...msgData,
      createdAt: new Date()
    };
    fallbackMessages.push(newMessage);
    return res.status(201).json({
      success: true,
      data: newMessage
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Server error saving message."
    });
  }
}

module.exports = { createMessage };

