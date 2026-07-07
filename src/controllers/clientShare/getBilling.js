const service = require("../../services/clientShareService");
const {
  getIsConnected
} = require("../../config/db");
const getTenantModel = require("../../utils/tenantDb");
const {
  fallbackMessages,
  fallbackUsers
} = require("../../utils/fallbackStore");

async function getBilling(req, res) {
  const {
    token
  } = req.params;
  try {
    const data = await service.findProjectByAccessKey(token);
    if (!data) return res.status(404).json({
      success: false,
      message: "Project share link not found."
    });
    const invoices = service.ensureInvoices(data.project);
    const approvedExtraCharges = (data.project.clientRequirements || []).filter(r => r.status === "Approved").reduce((sum, r) => sum + (r.estimatedCost || 0), 0);
    const total = data.project.paymentDetails?.total || invoices.reduce((sum, i) => sum + i.amount, 0);
    const paid = data.project.paymentDetails?.paid || invoices.filter(i => i.status === "Paid").reduce((sum, i) => sum + i.amount, 0);
    const outstanding = total - paid;
    return res.status(200).json({
      success: true,
      data: {
        paymentLedger: {
          total,
          paid,
          outstanding,
          approvedExtraCharges,
          invoiceCount: invoices.length
        },
        invoices
      }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Server error loading billing."
    });
  }
}

module.exports = { getBilling };

