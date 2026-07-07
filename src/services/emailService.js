const { sendEmail, isSmtpConfigured, getMissingSmtpConfig, getSafeSmtpConfig, getSmtpErrorDetails } = require('./email/utils/sendEmail');


function getOtpMailFailureMessage(error) {
  const code = String(error?.code || '').toUpperCase();
  const command = String(error?.command || '').toUpperCase();
  const response = String(error?.response || error?.message || '');
  const lowerResponse = response.toLowerCase();

  if (code.startsWith('HTTP_')) {
    if (code === 'HTTP_401') {
      return 'Email API authorization failed. Check your API key (RESEND_API_KEY or SENDGRID_API_KEY).';
    }
    if (code === 'HTTP_403') {
      return 'Email API access forbidden. Ensure your sender domain is verified in your provider settings.';
    }
    if (code === 'HTTP_422' || lowerResponse.includes('verify') || lowerResponse.includes('unverified') || lowerResponse.includes('domain')) {
      return 'Sender domain is not verified. If using Resend sandbox, the sender must be onboarding@resend.dev and the recipient must be the account creator.';
    }
    return `Email API call failed (${code}): ${error.message}`;
  }

  if (code === 'EAUTH' || lowerResponse.includes('invalid login') || lowerResponse.includes('username and password not accepted')) {
    return 'Email login failed. Check SMTP_USER and SMTP_PASS. For Gmail, use a Google App Password.';
  }

  if (code === 'ECONNECTION' || code === 'ETIMEDOUT' || lowerResponse.includes('timeout')) {
    return 'Email server connection timed out. Check SMTP_HOST, SMTP_PORT, and Render outbound mail access.';
  }

  if (command === 'CONN' || lowerResponse.includes('connect')) {
    return 'Could not connect to the email server. Check SMTP_HOST and SMTP_PORT.';
  }

  if (lowerResponse.includes('self-signed') || lowerResponse.includes('certificate')) {
    return 'Email TLS certificate check failed. Set SMTP_ALLOW_INVALID_CERTS=true only if your SMTP provider requires it.';
  }

  return 'Could not send OTP email right now. Please try again shortly.';
}
function canUseOtpConsoleFallback() {
  return process.env.NODE_ENV !== 'production' || process.env.OTP_CONSOLE_FALLBACK === 'true';
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function sendEmailOtp(email, otp) {
  console.log('[MAIL] OTP send requested:', { to: email, smtp: getSafeSmtpConfig() });

  if (!isSmtpConfigured()) {
    const missing = getMissingSmtpConfig();
    console.error('[MAIL] OTP email cannot be sent. Missing SMTP config: ' + missing.join(', '));
    if (canUseOtpConsoleFallback()) {
      return { success: true, message: 'SMTP not configured. OTP logged to server console.', debugMockOtp: otp };
    }

    return { success: false, message: 'Email service is not configured. Please contact support.' };
  }

  try {
    const safeOtp = escapeHtml(otp);
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
        <div style="background: #4f46e5; padding: 22px; text-align: center; color: white;">
          <h1 style="margin: 0; font-size: 22px; font-weight: bold;">Syncra</h1>
        </div>
        <div style="padding: 24px; color: #334155; line-height: 1.6;">
          <h2 style="margin-top: 0; color: #0f172a; font-size: 18px;">Verification code</h2>
          <p>Use this code to continue signing in to Syncra.</p>
          <div style="background-color: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 6px; padding: 16px; text-align: center; font-size: 32px; font-weight: bold; color: #4f46e5; letter-spacing: 4px; margin: 24px 0;">
            ${safeOtp}
          </div>
          <p style="font-size: 12px; color: #64748b; margin-bottom: 0;">This code expires in 5 minutes. If you did not request it, you can ignore this email.</p>
        </div>
        <div style="background-color: #f1f5f9; padding: 12px; text-align: center; font-size: 11px; color: #64748b;">
          Syncra account security
        </div>
      </div>
    `;

    await sendEmail({
      to: email,
      subject: 'Syncra verification code',
      text: `Your Syncra verification code is ${otp}. It expires in 5 minutes. If you did not request this code, ignore this email.`,
      html,
      headers: { 'X-Priority': '3' }
    });

    return { success: true, message: 'OTP has been dispatched to your email address.', debugMockOtp: null };
  } catch (mailError) {
    const details = getSmtpErrorDetails(mailError);
    console.error('[MAIL] OTP send failed:', details);
    if (canUseOtpConsoleFallback()) {
      return {
        success: true,
        message: 'Mail server issue. Developer fallback: OTP printed to server console.',
        debugMockOtp: otp
      };
    }

    return {
      success: false,
      message: process.env.NODE_ENV === 'production' ? 'OTP email service is temporarily unavailable. Please contact support.' : getOtpMailFailureMessage(mailError),
      error: process.env.NODE_ENV === 'production' ? undefined : details
    };
  }
}

async function sendWelcomeEmail(adminEmail, adminName, companyName) {
  if (!isSmtpConfigured()) {
    const missing = getMissingSmtpConfig();
    console.warn('[MAIL] Welcome email not sent. Missing SMTP config: ' + missing.join(', '));
    console.log('\n--- [WELCOME EMAIL] ---');
    console.log(`To: ${adminEmail}`);
    console.log(`Company: ${companyName}`);
    console.log(`Admin: ${adminName}`);
    console.log('--- [END WELCOME EMAIL] ---\n');
    return { success: true };
  }

  try {
    const safeAdminName = escapeHtml(adminName || 'Admin');
    const safeCompanyName = escapeHtml(companyName || 'your company');
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
        <div style="background: #4f46e5; padding: 28px; text-align: center; color: white;">
          <h1 style="margin: 0; font-size: 24px; font-weight: 800;">Syncra Workspace</h1>
          <p style="margin: 8px 0 0; font-size: 13px; opacity: 0.9;">Project Management Platform</p>
        </div>
        <div style="padding: 30px; color: #334155; line-height: 1.7;">
          <h2 style="margin-top: 0; color: #0f172a; font-size: 20px;">Welcome, ${safeAdminName}</h2>
          <p>Your company workspace has been created on Syncra.</p>
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #4f46e5; border-radius: 8px; padding: 16px; margin: 20px 0;">
            <p style="margin: 0; font-size: 18px; font-weight: 800; color: #0f172a;">${safeCompanyName}</p>
            <p style="margin: 4px 0 0; font-size: 12px; color: #64748b;">Company Admin: ${escapeHtml(adminEmail)}</p>
          </div>
          <p>To access your dashboard, open the login page and request an OTP for your email address.</p>
          <p style="text-align: center; margin: 28px 0;">
            <a href="${escapeHtml(frontendUrl)}" style="display: inline-block; background: #4f46e5; color: white; text-decoration: none; padding: 14px 28px; border-radius: 10px; font-weight: 700; font-size: 14px;">Go to Dashboard Login</a>
          </p>
          <p style="font-size: 12px; color: #64748b; margin-bottom: 0;">If you did not create this account, ignore this email or contact support.</p>
        </div>
      </div>
    `;

    await sendEmail({
      to: adminEmail,
      subject: `Your Syncra workspace is ready: ${companyName}`,
      text: `Hello ${adminName || 'Admin'}, your Syncra workspace for ${companyName || 'your company'} is ready. Open ${frontendUrl} and request an OTP to sign in.`,
      html
    });

    return { success: true };
  } catch (err) {
    console.error('Welcome email failed (non-critical):', err.message);
    return { success: false };
  }
}

async function sendEmployeeInviteEmail(email, name, role, portalUrl, tempPassword, companyEmail, companyName) {
  if (!isSmtpConfigured()) {
    const missing = getMissingSmtpConfig();
    console.warn('[MAIL] Invite email not sent. Missing SMTP config: ' + missing.join(', '));
    console.log('\n--- [EMPLOYEE INVITE EMAIL LOG] ---');
    console.log(`From Company: ${companyName} <${companyEmail}>`);
    console.log(`To: ${email}`);
    console.log(`Name: ${name}`);
    console.log(`Role: ${role}`);
    console.log(`Portal: ${portalUrl}`);
    console.log(`Temp Password: ${tempPassword}`);
    console.log('-----------------------------------\n');
    return { success: true, message: 'SMTP not configured. Invite logged to console.' };
  }

  try {
    const safeName = escapeHtml(name || 'Team member');
    const safeRole = escapeHtml(role || 'Employee');
    const safePortalUrl = escapeHtml(portalUrl || '');
    const safeCompanyName = escapeHtml(companyName || 'your workspace');
    const safePassword = escapeHtml(tempPassword || '');
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
        <div style="background: #4f46e5; padding: 24px; text-align: center; color: white;">
          <h1 style="margin: 0; font-size: 24px; font-weight: bold;">Syncra Workspace</h1>
        </div>
        <div style="padding: 24px; color: #334155; line-height: 1.6;">
          <h2 style="margin-top: 0; color: #0f172a; font-size: 18px;">Workspace invitation</h2>
          <p>Hi <strong>${safeName}</strong>,</p>
          <p>You have been added to <strong>${safeCompanyName}</strong> as <strong>${safeRole}</strong>.</p>
          <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 16px; margin: 20px 0;">
            <p style="margin: 4px 0;"><strong>Portal URL:</strong> <a href="${safePortalUrl}">${safePortalUrl}</a></p>
            <p style="margin: 4px 0;"><strong>Login Email:</strong> ${escapeHtml(email)}</p>
            <p style="margin: 4px 0;"><strong>Temporary Password:</strong> <code style="background-color: #e2e8f0; padding: 2px 6px; border-radius: 4px;">${safePassword}</code></p>
          </div>
          <p style="font-size: 12px; color: #64748b;">Please change your password after logging in.</p>
        </div>
      </div>
    `;

    await sendEmail({
      to: email,
      subject: 'Syncra workspace invitation',
      text: `Hi ${name || 'Team member'}, you have been added to ${companyName || 'your Syncra workspace'} as ${role || 'Employee'}. Portal: ${portalUrl}. Login email: ${email}. Temporary password: ${tempPassword}. Please change your password after logging in.`,
      html,
      replyTo: companyEmail
    });

    return { success: true, message: 'Invite email sent successfully.' };
  } catch (err) {
    console.error('Failed to send invite email:', err.message);
    return { success: false, message: `Mail server issue: ${err.message}` };
  }
}

module.exports = {
  sendEmailOtp,
  sendWelcomeEmail,
  sendEmployeeInviteEmail
};