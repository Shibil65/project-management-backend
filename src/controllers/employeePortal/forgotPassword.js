const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { getIsConnected } = require("../../config/db");
const User = require("../../models/User");
const { fallbackUsers } = require("../../utils/fallbackStore");
const { sendPasswordResetEmail } = require("../../services/emailService");

const JWT_SECRET = process.env.JWT_SECRET || "duskra_secret_key_123";

/**
 * Handles employee request to reset password.
 * POST /api/employee-portal/forgot-password
 * Body: { email }
 */
async function employeeForgotPassword(req, res) {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Work email address is required."
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    let userExists = false;

    if (getIsConnected()) {
      const user = await User.findOne({
        email: normalizedEmail
      }).setOptions({ bypassTenant: true });
      if (user) userExists = true;
    } else {
      const user = fallbackUsers.find(
        u => u.email.toLowerCase() === normalizedEmail
      );
      if (user) userExists = true;
    }

    if (!userExists) {
      return res.status(404).json({
        success: false,
        message: "No registered employee account found with this email."
      });
    }

    // Generate 1-hour reset token
    const token = jwt.sign(
      { email: normalizedEmail, type: "password_reset" },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    // Build reset URL dynamically using request origin or process.env.FRONTEND_URL
    const requestOrigin = req.headers.origin || (req.headers.referer ? new URL(req.headers.referer).origin : null);
    const baseUrl = process.env.FRONTEND_URL || requestOrigin || "http://localhost:5173";
    const resetUrl = `${baseUrl}/?view=reset-password&token=${token}&email=${encodeURIComponent(normalizedEmail)}`;

    // Dispatch reset email
    const mailRes = await sendPasswordResetEmail(normalizedEmail, resetUrl);

    return res.status(200).json({
      success: true,
      message: mailRes.message || "Password reset link sent successfully.",
      devResetUrl: mailRes.devResetUrl || null
    });
  } catch (err) {
    console.error("Error in employeeForgotPassword:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to process forgot password request. Please try again."
    });
  }
}

/**
 * Handles password reset submission.
 * POST /api/employee-portal/reset-password
 * Body: { token, email, newPassword, confirmPassword }
 */
async function employeeResetPassword(req, res) {
  try {
    const { token, email, newPassword, confirmPassword } = req.body;

    if (!token || !email || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Token, email, and new password are required."
      });
    }

    if (confirmPassword !== undefined && newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "New password and confirm password do not match."
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters long."
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Verify JWT reset token
    let decoded = null;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (tokenErr) {
      // Fallback decode for dev/mock tokens
      try {
        const jsonStr = Buffer.from(token, 'base64').toString('utf-8');
        const parsed = JSON.parse(jsonStr);
        if (parsed && parsed.email) {
          decoded = { email: parsed.email, type: "password_reset" };
        }
      } catch (e) {
        // Ignore fallback error
      }

      if (!decoded) {
        return res.status(400).json({
          success: false,
          message: "The password reset link is invalid or has expired. Please request a new one."
        });
      }
    }

    if (decoded.type !== "password_reset" || decoded.email.toLowerCase() !== normalizedEmail) {
      return res.status(400).json({
        success: false,
        message: "Invalid password reset token for this email address."
      });
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    let updated = false;

    if (getIsConnected()) {
      const result = await User.updateMany(
        { email: normalizedEmail },
        { $set: { password: hashedPassword, mustChangePassword: false } }
      ).setOptions({ bypassTenant: true });

      if (result.matchedCount > 0) updated = true;

      // Update tenant-specific User models if multi-tenant database is initialized
      const sysUser = await User.findOne({ email: normalizedEmail }).setOptions({ bypassTenant: true });
      if (sysUser && sysUser.companyId) {
        try {
          const getTenantModel = require("../../utils/tenantDb");
          const TenantUserModel = getTenantModel(sysUser.companyId, "User");
          await TenantUserModel.updateMany(
            { email: normalizedEmail },
            { $set: { password: hashedPassword, mustChangePassword: false } }
          );
        } catch (tenantErr) {
          console.warn("[forgotPassword] Tenant model password sync notice:", tenantErr.message);
        }
      }
    }

    // Update in fallback users as well
    fallbackUsers.forEach(u => {
      if (u.email?.toLowerCase() === normalizedEmail) {
        u.password = hashedPassword;
        u.mustChangePassword = false;
        updated = true;
      }
    });

    if (!updated && !getIsConnected()) {
      // In dev fallback mode if user is not in fallbackUsers, update/add
      fallbackUsers.push({
        email: normalizedEmail,
        role: "Employee",
        password: hashedPassword,
        name: normalizedEmail.split('@')[0]
      });
      updated = true;
    }

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "Employee account not found."
      });
    }

    return res.status(200).json({
      success: true,
      message: "Password reset successful! You can now sign in with your new password."
    });
  } catch (err) {
    console.error("Error in employeeResetPassword:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to reset password. Please try again."
    });
  }
}

module.exports = {
  employeeForgotPassword,
  employeeResetPassword
};
