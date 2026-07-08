const { sendEmail } = require('./utils/sendEmail');
const welcomeCompanyTemplate = require('./templates/welcomeCompanyTemplate');
const employeeInvitationTemplate = require('./templates/employeeInvitationTemplate');

/**
 * Sends a welcome email to the company admin after successful registration.
 *
 * @param {string} to - Admin recipient email address.
 * @param {string} companyName - Name of the registered company.
 * @param {string} adminName - Name of the administrator.
 * @param {string} planName - Selected subscription plan.
 * @returns {Promise<{emailSent: boolean}>}
 */
async function sendWelcomeCompanyEmail(to, companyName, adminName, planName) {
  try {
    const dateStr = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    const html = welcomeCompanyTemplate(companyName, adminName, dateStr, planName);

    await sendEmail({
      to,
      subject: 'Your Syncra workspace is ready',
      text: `Hello ${adminName || 'Admin'}, your Syncra workspace for ${companyName || 'your company'} is ready. Plan: ${planName || 'Selected plan'}.`,
      html
    });

    return { emailSent: true };
  } catch (err) {
    console.error('Welcome Company Email failed:', err.message);
    return { emailSent: false, error: err.message };
  }
}

/**
 * Sends login credentials to the newly created employee.
 *
 * @param {string} to - Employee recipient email address.
 * @param {string} employeeName - Name of the employee.
 * @param {string} companyName - Name of the employee's company.
 * @param {string} tempPassword - Temporary plain text password.
 * @param {string} portalUrl - Direct link to the employee portal.
 * @param {string} [companyEmail] - The company admin's email address (for reply-to).
 * @returns {Promise<{emailSent: boolean}>}
 */
async function sendEmployeeCredentialsEmail(to, employeeName, companyName, tempPassword, portalUrl, companyEmail) {
  try {
    const html = employeeInvitationTemplate(employeeName, companyName, to, tempPassword, portalUrl);

    await sendEmail({
      to,
      subject: 'Syncra employee portal access',
      text: `Hi ${employeeName || 'Team member'}, you have been added to ${companyName || 'your Syncra workspace'}. Portal: ${portalUrl}. Login email: ${to}. Temporary password: ${tempPassword}. Please change your password after logging in.`,
      html,
      replyTo: companyEmail || process.env.SMTP_USER
    });

    return { emailSent: true };
  } catch (err) {
    console.error('Employee credentials email failed:', err.message);
    return { emailSent: false, error: err.message };
  }
}

module.exports = {
  sendWelcomeCompanyEmail,
  sendEmployeeCredentialsEmail
};