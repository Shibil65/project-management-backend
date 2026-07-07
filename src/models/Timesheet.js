const mongoose = require('mongoose');

const TimesheetSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  projectId: { type: String, required: true },
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true
  },
  hours: { type: Number, required: true },
  billable: { type: Boolean, default: true },
  approvedBy: { type: String, default: '' },
  status: { type: String, enum: ['Pending', 'Approved', 'Rejected'], default: 'Pending' }
}, { timestamps: true });

TimesheetSchema.index({ userId: 1 });
TimesheetSchema.index({ projectId: 1 });

const { tenantPlugin } = require('../utils/tenantPlugin');
TimesheetSchema.plugin(tenantPlugin);

module.exports = mongoose.models.Timesheet || mongoose.model('Timesheet', TimesheetSchema);
