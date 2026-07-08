const { sendEmail, isSmtpConfigured, getMissingSmtpConfig, getSafeSmtpConfig, getSmtpErrorDetails } = require('./email/utils/sendEmail');
const otpEmailTemplate = require('./email/templates/otpEmailTemplate');
const employeeInvitationTemplate = require('./email/templates/employeeInvitationTemplate');
const welcomeCompanyTemplate = require('./email/templates/welcomeCompanyTemplate');

function getOtpMailFailureMessage(error) {
  const code = String(error?.code || '').toUpperCase();
  const command = String(error?.command || '').toUpperCase();
  const response = String(error?.response || error?.message || '');
  const lowerResponse = response.toLowerCase();

  if (code.startsWith('HTTP_')) {
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
  // Allow console fallback by default on SMTP failures, unless explicitly disabled with OTP_CONSOLE_FALLBACK=false
  return process.env.OTP_CONSOLE_FALLBACK !== 'false';
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
    const html = otpEmailTemplate(otp, 10);

    await sendEmail({
      to: email,
      subject: 'Syncra Verification Code',
      text: `Your Syncra verification code is ${otp}. It expires in 10 minutes. If you did not request this code, ignore this email.`,
      html,
      headers: { 'X-Priority': '1', 'Importance': 'high' }
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
    const dateStr = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    const html = welcomeCompanyTemplate(companyName, adminName, dateStr, 'Free');

    await sendEmail({
      to: adminEmail,
      subject: `Your Syncra workspace is ready: ${companyName}`,
      text: `Hello ${adminName || 'Admin'}, your Syncra workspace for ${companyName || 'your company'} is ready. Open ${process.env.FRONTEND_URL || 'http://localhost:5173'} and request an OTP to sign in.`,
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
    const html = employeeInvitationTemplate(name, companyName, email, tempPassword, portalUrl);

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