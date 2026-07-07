const mongoose = require('mongoose');

const CRMClientLeadSchema = new mongoose.Schema({
  clientName:   { type: String, required: true },
  email:        { type: String, required: true },
  phone:        { type: String, default: '' },
  position:     { type: String, default: '' },
  targetDate:   { type: String, default: '' },
  status:       { type: String, default: 'New' },
  companyId:    {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true
  }
}, { timestamps: true });

const { tenantPlugin } = require('../utils/tenantPlugin');
CRMClientLeadSchema.plugin(tenantPlugin);

module.exports = mongoose.models.CRMClientLead || mongoose.model('CRMClientLead', CRMClientLeadSchema);
