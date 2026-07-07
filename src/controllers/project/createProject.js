const {
  getIsConnected
} = require("../../config/db");
const Company = require("../../models/Company");
const getTenantModel = require("../../utils/tenantDb");
const {
  fallbackProjects,
  fallbackCompanies
} = require("../../utils/fallbackStore");

async function createProject(req, res) {
  const {
    name,
    desc,
    clientEmail,
    status,
    leadId
  } = req.body;
  const companyId = req.user.companyId;
  const org = req.user.org;
  if (!name || !clientEmail) {
    return res.status(400).json({
      success: false,
      message: "Name and clientEmail are required."
    });
  }
  let maxProjects = 3;
  let plan = "Free";
  if (getIsConnected()) {
    try {
      const company = await Company.findById(companyId);
      if (company) {
        plan = company.plan;
        const Plan = require("../../models/Plan");
        const planDetails = await Plan.findOne({
          name: plan
        });
        if (planDetails) {
          maxProjects = planDetails.maxProjects;
        } else {
          if (plan === "Starter Package" || plan === "Starter") maxProjects = 10;
          else if (plan === "Scale Package Tier" || plan === "Scale") maxProjects = 30;
          else maxProjects = 3;
        }
      }
    } catch (err) {
      console.error("Plan limits fetch failed:", err);
    }
  } else {
    const company = fallbackCompanies.find(c => c.id === companyId);
    if (company) {
      plan = company.plan;
      const fallbackPlans = require("../../utils/fallbackStore").fallbackPlans;
      const planDetails = fallbackPlans.find(p => p.name === plan);
      if (planDetails) maxProjects = planDetails.maxProjects;
    }
  }
  let activeProjectsCount = 0;
  const ProjectModel = getTenantModel(companyId, "Project");
  if (getIsConnected()) {
    try {
      activeProjectsCount = await ProjectModel.countDocuments({
        companyId,
        isDeleted: {
          $ne: true
        }
      });
    } catch (err) {
      console.error(err);
    }
  } else {
    activeProjectsCount = fallbackProjects.filter(p => p.companyId === companyId && !p.isDeleted).length;
  }
  if (activeProjectsCount >= maxProjects) {
    return res.status(400).json({
      success: false,
      message: `Your current plan limit restricts you to a maximum of ${maxProjects} projects. Please upgrade your subscription to add more projects.`
    });
  }
  const clientAccessKey = `access_${Math.random().toString(36).substring(2, 10)}`;
  if (getIsConnected()) {
    try {
      const project = new ProjectModel({
        name,
        desc: desc || "",
        companyId,
        org,
        clientEmail,
        status: status || "Active",
        clientAccessKey,
        isDeleted: false,
        leadId: leadId || ""
      });
      await project.save();
      return res.status(201).json({
        success: true,
        data: project
      });
    } catch (err) {
      console.error(err);
    }
  }
  const project = {
    id: `p_${Date.now()}`,
    name,
    desc: desc || "",
    companyId,
    org,
    clientEmail,
    status: status || "Active",
    clientAccessKey,
    isDeleted: false,
    leadId: leadId || ""
  };
  fallbackProjects.push(project);
  return res.status(201).json({
    success: true,
    data: project
  });
}

module.exports = { createProject };

