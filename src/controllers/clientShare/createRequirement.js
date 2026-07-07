const service = require("../../services/clientShareService");
const {
  getIsConnected
} = require("../../config/db");
const getTenantModel = require("../../utils/tenantDb");
const {
  fallbackMessages,
  fallbackUsers
} = require("../../utils/fallbackStore");

async function createRequirement(req, res) {
  const {
    token
  } = req.params;
  const {
    title,
    description,
    priority,
    category,
    estimatedCost,
    timelineImpact,
    businessImpact
  } = req.body;
  if (!title) {
    return res.status(400).json({
      success: false,
      message: "Requirement title is required."
    });
  }
  try {
    const data = await service.findProjectByAccessKey(token);
    if (!data) return res.status(404).json({
      success: false,
      message: "Project share link not found."
    });
    const {
      project
    } = data;
    const newReq = {
      title,
      description: description || "",
      priority: priority || "Medium",
      category: category || "Feature",
      estimatedCost: Number(estimatedCost) || 0,
      timelineImpact: timelineImpact || "TBD",
      impact: businessImpact || "",
      status: "Pending Review",
      createdBy: "Client",
      createdAt: new Date()
    };
    if (!project.clientRequirements) project.clientRequirements = [];
    project.clientRequirements.push(newReq);
    if (getIsConnected()) {
      await project.save();
    }
    return res.status(201).json({
      success: true,
      message: "Requirement proposed.",
      data: newReq
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Server error saving requirement."
    });
  }
}

module.exports = { createRequirement };

