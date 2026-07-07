const service = require("../../services/clientShareService");
const {
  getIsConnected
} = require("../../config/db");
const getTenantModel = require("../../utils/tenantDb");
const {
  fallbackMessages,
  fallbackUsers
} = require("../../utils/fallbackStore");

async function getDashboard(req, res) {
  const {
    token
  } = req.params;
  try {
    const data = await service.findProjectByAccessKey(token);
    if (!data) return res.status(404).json({
      success: false,
      message: "Project share link not found or expired."
    });
    const {
      project,
      companyId,
      companyAdminEmail,
      org
    } = data;
    const milestones = service.ensureMilestones(project);
    const invoices = service.ensureInvoices(project);
    const documents = service.ensureDocuments(project);
    const totalTasks = project.tasks?.length || 0;
    const completedTasks = project.tasks?.filter(t => t.status === "Done").length || 0;
    const completionPct = totalTasks > 0 ? Math.round(completedTasks / totalTasks * 100) : 0;
    const unpaidInvoices = invoices.filter(i => i.status !== "Paid");
    const totalPaid = invoices.filter(i => i.status === "Paid").reduce((sum, i) => sum + i.amount, 0);
    const pendingReqs = (project.clientRequirements || []).filter(r => r.status === "Pending Review").length;
    const pendingCharges = (project.clientRequirements || []).filter(r => r.status === "Pending Review").reduce((sum, r) => sum + (r.estimatedCost || 0), 0);
    const pendingActions = [];
    unpaidInvoices.forEach(inv => {
      pendingActions.push({
        id: `inv_${inv.invoiceId}`,
        type: "unpaid_invoice",
        title: `Unpaid Invoice ${inv.invoiceId}`,
        desc: `Amount: $${inv.amount.toLocaleString()} - Due by ${inv.dueDate || "TBD"}`
      });
    });
    (project.clientRequirements || []).filter(r => r.status === "Approved").forEach(r => {
      pendingActions.push({
        id: `req_app_${r.id || r._id}`,
        type: "approved_req",
        title: `Scope Approved: ${r.title}`,
        desc: `Estimated extra cost: $${(r.estimatedCost || 0).toLocaleString()}`
      });
    });
    let staffDetails = [];
    if (getIsConnected()) {
      const UserModel = getTenantModel(companyId, "User");
      const staffUsers = await UserModel.find({
        role: { $ne: "Super Admin" },
        email: { $ne: companyAdminEmail }
      }).select("name email role");
      
      staffDetails = staffUsers.map(u => ({
        email: u.email,
        name: u.name,
        role: u.role
      }));
    } else {
      staffDetails = fallbackUsers
        .filter(u => u.role !== "Super Admin" && u.email?.toLowerCase() !== companyAdminEmail?.toLowerCase() && (u.org === org || u.org?.startsWith(org.split(" ")[0])))
        .map(u => ({
          email: u.email,
          name: u.name,
          role: u.role
        }));
    }
    return res.status(200).json({
      success: true,
      data: {
        projectOverview: {
          name: project.name,
          desc: project.desc,
          status: project.status,
          manager: project.manager || "Marcus Vance",
          clientEmail: project.clientEmail,
          clientName: project.clientName || "Client",
          sprint: project.sprint || "Sprint 3 - Core APIs",
          priority: project.priority || "High",
          completionPct,
          companyAdminEmail,
          org,
          assignedStaff: staffDetails,
          deployedUrl: project.deployedUrl || ""
        },
        kpis: {
          completionPct,
          pendingRequirements: pendingReqs,
          pendingInvoices: unpaidInvoices.length,
          totalPaid,
          pendingExtraCharges: pendingCharges,
          sharedFilesCount: documents.length
        },
        pendingActions
      }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Server error loading dashboard."
    });
  }
}

module.exports = { getDashboard };

