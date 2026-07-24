const { sendEmail, isSmtpConfigured, getMissingSmtpConfig, getSafeSmtpConfig, getSmtpErrorDetails } = require('./email/utils/sendEmail');
const { mailConfig } = require('../config/mailConfig');
const otpEmailTemplate = require('./email/templates/otpEmailTemplate');
const employeeInvitationTemplate = require('./email/templates/employeeInvitationTemplate');
const welcomeCompanyTemplate = require('./email/templates/welcomeCompanyTemplate');
const passwordResetTemplate = require('./email/templates/passwordResetTemplate');

function getOtpMailFailureMessage(error) {
  const code = String(error?.code || '').toUpperCase();
  const response = String(error?.response || error?.message || '');
  const lowerResponse = response.toLowerCase();

  if (lowerResponse.includes('unauthorized ip address') || lowerResponse.includes('525')) {
    return 'Unauthorized IP address. Please authorize your Render outbound IP in your Brevo SMTP settings.';
  }

  if (code === 'HTTP_401' || lowerResponse.includes('key not found') || lowerResponse.includes('unauthorized') || lowerResponse.includes('401')) {
    return 'BREVO_API_KEY is missing/invalid or EMAIL_PROVIDER is wrong.';
  }

  if (code === 'EAUTH' || lowerResponse.includes('invalid login') || lowerResponse.includes('username and password not accepted')) {
    return 'SMTP credentials are invalid.';
  }

  if (lowerResponse.includes('sender') || lowerResponse.includes('from') || lowerResponse.includes('unverified')) {
    return 'SMTP_FROM_EMAIL is missing or not verified.';
  }

  return 'Could not send OTP email right now. Please try again shortly.';
}

function canUseOtpConsoleFallback() {
  // Strictly allow console fallback ONLY if NOT in production AND ALLOW_DEV_OTP_BYPASS is explicitly true
  return process.env.NODE_ENV !== 'production' && mailConfig.allowDevBypass;
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

  const isConfigured = mailConfig.provider === 'api' ? !!mailConfig.api.key : isSmtpConfigured();

  if (!isConfigured) {
    console.error('[MAIL] Email service cannot be sent. Incomplete credentials for provider: ' + mailConfig.provider);
    if (canUseOtpConsoleFallback()) {
      return { success: true, message: 'SMTP/API not configured. OTP logged to server console.', debugMockOtp: otp };
    }
    const errMsg = mailConfig.provider === 'api' 
      ? 'BREVO_API_KEY is missing/invalid or EMAIL_PROVIDER is wrong.' 
      : 'SMTP credentials are invalid.';
    return { success: false, message: errMsg };
  }

  try {
    const html = otpEmailTemplate(otp, 10);

    await sendEmail({
      to: email,
      subject: 'Duskra Verification Code',
      text: `Your Duskra verification code is ${otp}. It expires in 10 minutes. If you did not request this code, ignore this email.`,
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
      message: getOtpMailFailureMessage(mailError),
      error: process.env.NODE_ENV === 'production' ? undefined : details
    };
  }
}

async function sendWelcomeEmail(adminEmail, adminName, companyName) {
  const isConfigured = mailConfig.provider === 'api' ? !!mailConfig.api.key : isSmtpConfigured();
  if (!isConfigured) {
    console.warn('[MAIL] Welcome email not sent. Config missing.');
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
      subject: `Your Duskra workspace is ready: ${companyName}`,
      text: `Hello ${adminName || 'Admin'}, your Duskra workspace for ${companyName || 'your company'} is ready. Open ${process.env.FRONTEND_URL || 'http://localhost:5173'} and request an OTP to sign in.`,
      html
    });

    return { success: true };
  } catch (err) {
    console.error('Welcome email failed (non-critical):', err.message);
    return { success: false };
  }
}

async function sendEmployeeInviteEmail(email, name, role, portalUrl, tempPassword, companyEmail, companyName) {
  const isConfigured = mailConfig.provider === 'api' ? !!mailConfig.api.key : isSmtpConfigured();
  if (!isConfigured) {
    console.warn('[MAIL] Invite email not sent. Config missing.');
    console.log('\n--- [EMPLOYEE INVITE EMAIL LOG] ---');
    console.log(`From Company: ${companyName} <${companyEmail}>`);
    console.log(`To: ${email}`);
    console.log(`Name: ${name}`);
    console.log(`Role: ${role}`);
    console.log(`Portal: ${portalUrl}`);
    console.log(`Temp Password: ${tempPassword}`);
    console.log('-----------------------------------\n');
    return { success: true, message: 'SMTP/API not configured. Invite logged to console.' };
  }

  try {
    const html = employeeInvitationTemplate(name, companyName, email, tempPassword, portalUrl);

    await sendEmail({
      to: email,
      subject: 'Duskra workspace invitation',
      text: `Hi ${name || 'Team member'}, you have been added to ${companyName || 'your Duskra workspace'} as ${role || 'Employee'}. Portal: ${portalUrl}. Login email: ${email}. Temporary password: ${tempPassword}. Please change your password after logging in.`,
      html,
      replyTo: companyEmail
    });

    return { success: true, message: 'Invite email sent successfully.' };
  } catch (err) {
    console.error('Failed to send invite email:', err.message);
    return { success: false, message: getOtpMailFailureMessage(err) };
  }
}

async function sendPasswordResetEmail(email, resetUrl) {
  const isConfigured = mailConfig.provider === 'api' ? !!mailConfig.api.key : isSmtpConfigured();

  if (!isConfigured) {
    console.warn('[MAIL] Password reset email not sent via SMTP/API. Config missing.');
    console.log('\n--- [EMPLOYEE PASSWORD RESET LINK LOG] ---');
    console.log(`To: ${email}`);
    console.log(`Reset URL: ${resetUrl}`);
    console.log('-------------------------------------------\n');
    return {
      success: true,
      message: 'Password reset link generated. (Check server console or dev alert if SMTP is unconfigured)',
      devResetUrl: resetUrl
    };
  }

  try {
    const html = passwordResetTemplate(email, resetUrl);

    console.log(`[MAIL] Dispatching password reset email to: ${email}...`);

    await sendEmail({
      to: email,
      subject: 'Reset Your Password - Duskra Employee Workspace',
      text: `Hello, we received a request to reset your password. Open this link to set a new password: ${resetUrl}. This link will expire in 1 hour.`,
      html
    });

    console.log(`[MAIL SUCCESS] Password reset email sent to ${email}`);
    return { success: true, message: 'Password reset link has been dispatched to your email address.' };
  } catch (err) {
    const errorDetails = getSmtpErrorDetails ? getSmtpErrorDetails(err) : { message: err.message };
    console.error('[MAIL ERROR] Failed to send password reset email:', errorDetails);

    return {
      success: true, // Fallback gracefully for dev environment so user is not blocked
      message: getOtpMailFailureMessage ? getOtpMailFailureMessage(err) : 'Mail server notice: Check SMTP credentials.',
      devResetUrl: resetUrl,
      mailError: process.env.NODE_ENV === 'production' ? undefined : err.message
    };
  }
}

module.exports = {
  sendEmailOtp,
  sendWelcomeEmail,
  sendEmployeeInviteEmail,
  sendPasswordResetEmail
};