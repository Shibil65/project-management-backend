const mongoose = require('mongoose');

const ProjectSchema = new mongoose.Schema({
  name: { type: String, required: true },
  desc: { type: String, default: '' },
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true
  },
  org: { type: String, required: true },
  clientEmail: { type: String, required: true },
  status: { type: String, enum: ['Active', 'On Hold', 'Completed', 'Pending', 'In Progress', 'Cancelled', 'Planning', 'Dev', 'QA', 'Quality Assurance'], default: 'Active' },
  currentPhase: { type: String, default: 'Client Gave Idea' },
  clientAccessKey: { type: String, required: true },
  isDeleted: { type: Boolean, default: false },
  leadId: { type: String, default: '' },
  clientId: { type: String, default: '' },
  budget: { type: Number, default: 0 },
  startDate: { type: String, default: '' },
  endDate: { type: String, default: '' },
  requirements: [{ type: String }],
  documents: [{
    name: { type: String, required: true },
    url: { type: String, default: '' },
    category: { type: String, default: 'General' },
    uploadedBy: { type: String, default: 'PM' },
    uploadedAt: { type: Date, default: Date.now },
    size: { type: String, default: '1.2 MB' }
  }],
  assignedStaff: [{ type: String }], // emails or IDs of assigned staff
  tasks: [{
    id: { type: String, default: () => `task_${Math.random().toString(36).substring(2, 9)}` },
    title: { type: String, required: true },
    assigneeEmail: { type: String, default: '' },
    assigneeName: { type: String, default: '' },
    assignees: [{
      email: { type: String, default: '' },
      name: { type: String, default: '' }
    }],
    status: { type: String, enum: ['Planning', 'In Progress', 'Dev', 'QA', 'Review', 'Done'], default: 'Planning' },
    priority: { type: String, enum: ['High', 'Medium', 'Low'], default: 'Medium' },
    note: { type: String, default: '' },
    deadline: { type: String, default: '' }
  }],
  paymentDetails: {
    total: { type: Number, default: 0 },
    paid: { type: Number, default: 0 },
    outstanding: { type: Number, default: 0 }
  },
  clientRequirements: [{
    id: { type: String, default: () => `req_${Math.random().toString(36).substring(2, 9)}` },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    category: { type: String, default: 'Feature' },
    createdBy: { type: String, default: 'Client' },
    status: { type: String, enum: ['Pending Review', 'Approved', 'Rejected', 'In Progress', 'Delivered'], default: 'Pending Review' },
    estimatedCost: { type: Number, default: 0 },
    timelineImpact: { type: String, default: 'TBD' },
    adminNotes: { type: String, default: '' },
    priority: { type: String, default: 'Medium' },
    impact: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now }
  }],
  invoices: [{
    invoiceId: { type: String, required: true },
    date: { type: String, required: true },
    desc: { type: String, default: '' },
    amount: { type: Number, required: true },
    status: { type: String, enum: ['Paid', 'Pending', 'Overdue'], default: 'Pending' },
    dueDate: { type: String, default: '' },
    paidDate: { type: String, default: '' }
  }],
  milestones: [{
    id: { type: String, default: () => `ms_${Math.random().toString(36).substring(2, 9)}` },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    dueDate: { type: String, default: '' },
    status: { type: String, enum: ['Not Started', 'In Progress', 'Waiting Approval', 'Completed', 'Delayed'], default: 'Not Started' },
    completionDate: { type: String, default: '' }
  }],
  deployedUrl: { type: String, default: '' },
  comments: [{
    id: { type: String, default: () => `c_${Math.random().toString(36).substring(2, 9)}` },
    user: { type: String, required: true },
    userName: { type: String, required: true },
    content: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

ProjectSchema.index({ leadId: 1 });
ProjectSchema.index({ clientId: 1 });

const { tenantPlugin } = require('../utils/tenantPlugin');
ProjectSchema.plugin(tenantPlugin);

module.exports = mongoose.models.Project || mongoose.model('Project', ProjectSchema);



