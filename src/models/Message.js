const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  sender: { type: String, required: true },
  senderName: { type: String, required: true },
  receiver: { type: String, required: true },
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true
  },
  org: { type: String, required: true },
  text: { type: String, default: '' },
  imageUrl: { type: String, default: '' }
}, { timestamps: true });

const { tenantPlugin } = require('../utils/tenantPlugin');
MessageSchema.plugin(tenantPlugin);

module.exports = mongoose.models.Message || mongoose.model('Message', MessageSchema);
