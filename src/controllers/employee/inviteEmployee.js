const { sendEmployeeInviteEmail } = require('../../services/emailService');
const { normalizeProvidedPortalUrl } = require('../../utils/frontendUrl');

async function inviteEmployee(req, res) {
  const { email, name, role, portalUrl, tempPassword } = req.body;
  if (!email || !name || !role || !portalUrl || !tempPassword) {
    return res.status(400).json({
      success: false,
      message: "Required parameters missing: email, name, role, portalUrl, tempPassword."
    });
  }

  try {
    const companyEmail = req.user ? req.user.email : '';
    const companyName = req.user ? req.user.org : '';
    const resolvedPortalUrl = normalizeProvidedPortalUrl(req, portalUrl, role);
    const result = await sendEmployeeInviteEmail(email, name, role, resolvedPortalUrl, tempPassword, companyEmail, companyName);
    if (result.success) {
      return res.status(200).json({
        success: true,
        message: result.message
      });
    } else {
      return res.status(500).json({
        success: false,
        message: result.message
      });
    }
  } catch (err) {
    console.error("Invite employee error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error sending invitation."
    });
  }
}

module.exports = { inviteEmployee };
