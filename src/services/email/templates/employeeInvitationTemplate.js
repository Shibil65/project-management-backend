/**
 * Generates the HTML welcome email template with invitation credentials for new employees.
 * 
 * Deliverability Tip (DNS Records):
 * Ensure your sending domain has SPF, DKIM, and DMARC records configured:
 * 1. SPF: v=spf1 include:sendgrid.net include:_spf.google.com ~all
 * 2. DKIM: Create a TXT record with selector and key provided by your mail provider (e.g. Gmail/SendGrid).
 * 3. DMARC: v=DMARC1; p=quarantine; pct=100; rua=mailto:dmarc-reports@yourdomain.com
 * 
 * @param {string} employeeName - New employee's name.
 * @param {string} companyName - Registering company organization name.
 * @param {string} email - Employee login email identifier.
 * @param {string} tempPassword - Plain text temporary password.
 * @param {string} portalUrl - Custom URL of the employee self-service login.
 * @returns {string} Fully styled HTML template string.
 */
function employeeInvitationTemplate(employeeName, companyName, email, tempPassword, portalUrl) {
  const finalPortalUrl = portalUrl || 'http://localhost:5173/employee/login';
  const year = new Date().getFullYear();

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Welcome to ${companyName}</title>
      <style>
        body {
          margin: 0;
          padding: 0;
          background-color: #F8FAFC;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          color: #334155;
        }
        .container {
          max-width: 600px;
          margin: 40px auto;
          background-color: #ffffff;
          border: 1px solid #E2E8F0;
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05);
        }
        .header {
          background: linear-gradient(135deg, #4F46E5, #4338CA);
          padding: 32px;
          text-align: center;
          color: #ffffff;
        }
        .header h1 {
          margin: 0;
          font-size: 24px;
          font-weight: 800;
          letter-spacing: -0.5px;
        }
        .header p {
          margin: 4px 0 0 0;
          font-size: 14px;
          opacity: 0.9;
        }
        .content {
          padding: 32px;
        }
        .welcome-text {
          font-size: 16px;
          line-height: 1.6;
          margin-top: 0;
        }
        .details-card {
          background-color: #F8FAFC;
          border: 1px solid #E2E8F0;
          border-radius: 12px;
          padding: 20px;
          margin: 24px 0;
        }
        .details-card h3 {
          margin: 0 0 12px 0;
          font-size: 14px;
          font-weight: 700;
          color: #1E293B;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .details-row {
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
          border-bottom: 1px solid #F1F5F9;
          font-size: 14px;
        }
        .details-row:last-child {
          border-bottom: none;
          padding-bottom: 0;
        }
        .details-label {
          color: #64748B;
          font-weight: 500;
        }
        .details-value {
          color: #0F172A;
          font-weight: 700;
        }
        .temp-pw-box {
          background-color: #E2E8F0;
          padding: 4px 8px;
          border-radius: 6px;
          font-family: monospace;
          font-size: 13px;
          color: #1E293B;
        }
        .btn-container {
          text-align: center;
          margin: 32px 0;
        }
        .btn {
          display: inline-block;
          background-color: #4F46E5;
          color: #ffffff !important;
          text-decoration: none;
          padding: 12px 24px;
          border-radius: 8px;
          font-weight: 700;
          font-size: 14px;
          box-shadow: 0 4px 6px -1px rgba(79, 70, 229, 0.2);
          transition: background-color 0.2s;
        }
        .warning-box {
          background-color: #FFFBEB;
          border-left: 4px solid #F59E0B;
          border-radius: 8px;
          padding: 16px;
          margin: 24px 0;
          font-size: 13px;
          line-height: 1.5;
          color: #B45309;
        }
        .footer {
          background-color: #F8FAFC;
          border-top: 1px solid #E2E8F0;
          padding: 24px;
          text-align: center;
          font-size: 12px;
          color: #94A3B8;
        }
        .footer a {
          color: #64748B;
          text-decoration: none;
          margin: 0 8px;
        }
        .footer a:hover {
          text-decoration: underline;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Syncra Invitation Node</h1>
          <p>${companyName} Workspace Access</p>
        </div>
        <div class="content">
          <p class="welcome-text">Hello <strong>${employeeName}</strong>,</p>
          <p class="welcome-text">Your workspace profile has been successfully generated by your company administrator. You can now access the company Employee Portal using the temporary credentials detailed below.</p>
          
          <div class="details-card">
            <h3>Login Credentials</h3>
            <div class="details-row">
              <span class="details-label">Portal URL</span>
              <span class="details-value"><a href="${finalPortalUrl}" style="color: #4F46E5; text-decoration: none;">${finalPortalUrl}</a></span>
            </div>
            <div class="details-row">
              <span class="details-label">Login Username/Email</span>
              <span class="details-value">${email}</span>
            </div>
            <div class="details-row">
              <span class="details-label">Temporary Password</span>
              <span class="details-value"><code class="temp-pw-box">${tempPassword}</code></span>
            </div>
          </div>
 
          <div class="btn-container">
            <a href="${finalPortalUrl}" class="btn" target="_blank">Access Portal & Login</a>
          </div>
 
          <div class="warning-box">
            <strong>Security Notice:</strong> You are required to change your temporary password immediately upon your first login. Do not share your login credentials with anyone.
          </div>
          
          <p class="welcome-text" style="font-size: 13px; color: #64748B; margin-top: 24px;">
            Need help? Contact your company administrator or email Syncra Support at <a href="mailto:support@syncra.com" style="color: #4F46E5; text-decoration: none;">support@syncra.com</a>.
          </p>
          
          <p class="welcome-text" style="margin-bottom: 0; font-size: 13px;">
            Regards,<br>
            <strong>Syncra Workspace Deployer</strong>
          </p>
        </div>
        <div class="footer">
          <p>&copy; ${year} Syncra Technologies Inc. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

module.exports = employeeInvitationTemplate;
