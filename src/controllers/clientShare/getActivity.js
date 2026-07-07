const service = require("../../services/clientShareService");
const {
  getIsConnected
} = require("../../config/db");
const getTenantModel = require("../../utils/tenantDb");
const {
  fallbackMessages,
  fallbackUsers
} = require("../../utils/fallbackStore");

async function getActivity(req, res) {
  const {
    token
  } = req.params;
  try {
    const data = await service.findProjectByAccessKey(token);
    if (!data) return res.status(404).json({
      success: false,
      message: "Project share link not found."
    });
    const {
      project
    } = data;
    const activities = [];
    (project.clientRequirements || []).forEach(r => {
      activities.push({
        id: `act_${r.id || r._id}`,
        user: r.createdBy === "Client" ? "Client Portal" : "PM Lead",
        action: `proposed project scope update`,
        target: r.title,
        time: "recently"
      });
    });
    return res.status(200).json({
      success: true,
      data: activities
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Server error loading activity timeline."
    });
  }
}

module.exports = { getActivity };

