const mongoose = require('mongoose');

const PaymentSchema = new mongoose.Schema({
  clientName: { type: String, required: true },
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true
  },
  org: { type: String, required: true },
  amount: { type: Number, required: true },
  status: { type: String, enum: ['Paid', 'Pending', 'Overdue'], default: 'Pending' },
  paymentId: { type: String, default: '' },
  paymentMethod: { type: String, default: 'Credit Card' },
  date: { type: String, default: () => new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) }
}, { timestamps: true });

const { tenantPlugin } = require('../utils/tenantPlugin');
PaymentSchema.plugin(tenantPlugin);

module.exports = mongoose.models.Payment || mongoose.model('Payment', PaymentSchema);
