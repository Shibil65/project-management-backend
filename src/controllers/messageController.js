const { getIsConnected } = require('../config/db');
const getTenantModel = require('../utils/tenantDb');
const { fallbackMessages } = require('../utils/fallbackStore');

async function getMessages(req, res) {
  const companyId = req.user.companyId;

  if (getIsConnected()) {
    try {
      const MessageModel = getTenantModel(companyId, 'Message');
      const list = await MessageModel.find({ companyId }).sort({ createdAt: 1 });
      return res.status(200).json({ success: true, data: list });
    } catch (err) {
      console.error(err);
    }
  }
  const list = fallbackMessages.filter(m => m.companyId === companyId);
  return res.status(200).json({ success: true, data: list });
}

async function createMessage(req, res) {
  const { sender, senderName, receiver, text, imageUrl } = req.body;
  const companyId = req.user.companyId;
  const org = req.user.org;

  if (!sender || !senderName) {
    return res.status(400).json({ success: false, message: 'Sender and senderName are required.' });
  }

  const MessageModel = getTenantModel(companyId, 'Message');
  if (getIsConnected()) {
    try {
      const msg = new MessageModel({ sender, senderName, receiver: receiver || 'all', companyId, org, text: text || '', imageUrl: imageUrl || '' });
      await msg.save();
      return res.status(201).json({ success: true, data: msg });
    } catch (err) {
      console.error(err);
    }
  }

  const msg = { id: `m_${Date.now()}`, sender, senderName, receiver: receiver || 'all', companyId, org, text: text || '', imageUrl: imageUrl || '', createdAt: new Date() };
  fallbackMessages.push(msg);
  return res.status(201).json({ success: true, data: msg });
}

module.exports = {
  getMessages,
  createMessage
};
