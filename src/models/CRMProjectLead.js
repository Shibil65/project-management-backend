const mongoose = require('mongoose');

const CRMProjectLeadSchema = new mongoose.Schema({
  projectName:   { type: String, required: true },
  clientName:    { type: String, default: '' },
  clientEmail:   { type: String, required: true },
  phone:         { type: String, default: '' },
  budget:        { type: Number, default: 0 },
  targetDate:    { type: String, default: '' },
  status:        { type: String, default: 'Prospect' },
  currentPhase:  { type: String, default: 'Client Gave Idea' },
  projectId:     { type: String, default: '' },   // linked auto-created project
  companyId:     {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true
  }
}, { timestamps: true });

const { tenantPlugin } = require('../utils/tenantPlugin');
CRMProjectLeadSchema.plugin(tenantPlugin);

module.exports = mongoose.models.CRMProjectLead || mongoose.model('CRMProjectLead', CRMProjectLeadSchema);
