const service = require("../../services/clientShareService");
const {
  getIsConnected
} = require("../../config/db");
const getTenantModel = require("../../utils/tenantDb");
const {
  fallbackMessages,
  fallbackUsers
} = require("../../utils/fallbackStore");

async function getFiles(req, res) {
  const {
    token
  } = req.params;
  try {
    const data = await service.findProjectByAccessKey(token);
    if (!data) return res.status(404).json({
      success: false,
      message: "Project share link not found."
    });
    const documents = service.ensureDocuments(data.project);
    return res.status(200).json({
      success: true,
      data: documents
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Server error loading files."
    });
  }
}

module.exports = { getFiles };

