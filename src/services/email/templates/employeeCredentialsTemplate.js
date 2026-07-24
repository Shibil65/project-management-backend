/**
 * Generates the HTML welcome email template with credentials for new employees.
 * 
 * @param {string} employeeName - New employee's name.
 * @param {string} companyName - Registering company organization name.
 * @param {string} email - Employee login email identifier.
 * @param {string} tempPassword - Plain text temporary password.
 * @param {string} portalUrl - Custom URL of the employee self-service login.
 * @returns {string} Fully styled HTML template string.
 */
const { getEmailHeader } = require('../utils/emailHeaderHelper');

function employeeCredentialsTemplate(employeeName, companyName, email, tempPassword, portalUrl) {
  const finalPortalUrl = portalUrl || 'http://localhost:5173/employee-portal';
  const year = new Date().getFullYear();
  const headerHtml = getEmailHeader(`Welcome to ${companyName}`, 'Duskra Platform Access');

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Your Employee Portal Credentials</title>
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
          background-color: #2563EB;
          color: #ffffff !important;
          text-decoration: none;
          padding: 12px 24px;
          border-radius: 8px;
          font-weight: 700;
          font-size: 14px;
          box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.2);
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
        ${headerHtml}
        <div class="content">
          <p class="welcome-text">Hello <strong>${employeeName}</strong>,</p>
          <p class="welcome-text">Your employee account has been created successfully. You can now access the company Employee Portal using the temporary credentials detailed below.</p>
          
          <div class="details-card">
            <h3>Login Credentials</h3>
            <div class="details-row">
              <span class="details-label">Portal URL</span>
              <span class="details-value"><a href="${finalPortalUrl}" style="color: #2563EB; text-decoration: none;">${finalPortalUrl}</a></span>
            </div>
            <div class="details-row">
              <span class="details-label">Login Email</span>
              <span class="details-value">${email}</span>
            </div>
            <div class="details-row">
              <span class="details-label">Temporary Password</span>
              <span class="details-value"><code class="temp-pw-box">${tempPassword}</code></span>
            </div>
          </div>

          <div class="btn-container">
            <a href="${finalPortalUrl}" class="btn" target="_blank">Login Now</a>
          </div>

          <div class="warning-box">
            <strong>Security Notice:</strong> For security reasons, please change your temporary password immediately upon your first login. Do not share your login details with anyone.
          </div>
          
          <p class="welcome-text" style="font-size: 14px; color: #64748B;">
            If you need assistance setting up your workspace, contact support at <a href="mailto:support@duskra.com" style="color: #2563EB; text-decoration: none;">support@duskra.com</a>.
          </p>
          
          <p class="welcome-text" style="margin-bottom: 0;">
            Regards,<br>
            <strong>Duskra Team</strong>
          </p>
        </div>
        <div class="footer">
          <p>
            <a href="${finalPortalUrl}/privacy">Privacy Policy</a> &bull; 
            <a href="${finalPortalUrl}/support">Customer Support</a>
          </p>
          <p>&copy; ${new Date().getFullYear()} Duskra Technologies Inc. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

module.exports = employeeCredentialsTemplate;
