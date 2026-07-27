const { getEmailHeader } = require('../utils/emailHeaderHelper');

function welcomeCompanyTemplate(companyName, adminName, date, planName) {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const headerHtml = getEmailHeader('Flownex Workspace Ready', 'Smarter Project and Team Management');
  
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Welcome to Flownex</title>
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
        .btn-container {
          text-align: center;
          margin: 32px 0;
        }
        .btn {
          display: inline-block;
          background: linear-gradient(135deg, #4F63F5 0%, #20B7C9 100%);
          color: #ffffff !important;
          text-decoration: none;
          padding: 14px 28px;
          border-radius: 8px;
          font-weight: 700;
          font-size: 14px;
          box-shadow: 0 4px 6px -1px rgba(79, 99, 245, 0.25);
        }
        .getting-started {
          margin-top: 32px;
          border-top: 1px solid #F1F5F9;
          padding-top: 24px;
        }
        .getting-started h3 {
          margin: 0 0 16px 0;
          font-size: 16px;
          color: #1E293B;
          font-weight: 700;
        }
        .step {
          margin-bottom: 16px;
          font-size: 14px;
          line-height: 1.5;
        }
        .step-num {
          display: inline-block;
          width: 20px;
          height: 20px;
          line-height: 20px;
          background-color: #EEF2FF;
          color: #4F63F5;
          border-radius: 50%;
          text-align: center;
          font-weight: 700;
          margin-right: 8px;
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
          <p class="welcome-text">Hello <strong>${adminName}</strong>,</p>
          <p class="welcome-text">Welcome to Flownex! Your company workspace has been successfully registered and is ready for use. You can now start managing projects, tracking attendance, and collaborating with your team.</p>
          
          <div class="details-card">
            <h3>Workspace Details</h3>
            <div class="details-row">
              <span class="details-label">Company Name</span>
              <span class="details-value">${companyName}</span>
            </div>
            <div class="details-row">
              <span class="details-label">Administrator</span>
              <span class="details-value">${adminName}</span>
            </div>
            <div class="details-row">
              <span class="details-label">Registration Date</span>
              <span class="details-value">${date}</span>
            </div>
            <div class="details-row">
              <span class="details-label">Active Plan</span>
              <span class="details-value" style="color: #12C6A3;">${planName}</span>
            </div>
          </div>

          <div class="btn-container">
            <a href="${frontendUrl}" class="btn" target="_blank">Access Your Portal</a>
          </div>

          <div class="getting-started">
            <h3>Getting Started</h3>
            <div class="step">
              <span class="step-num">1</span> Log in using your registered admin email via secure OTP.
            </div>
            <div class="step">
              <span class="step-num">2</span> Set up employee profiles under the "Employees" tab.
            </div>
            <div class="step">
              <span class="step-num">3</span> Create projects and assign team members to get work underway.
            </div>
          </div>
          
          <p class="welcome-text" style="margin-top: 32px; font-size: 14px; color: #64748B;">
            Need help? Reach our team at <a href="mailto:support@flownex.com" style="color: #4F63F5; text-decoration: none;">support@flownex.com</a>.
          </p>
          
          <p class="welcome-text" style="margin-bottom: 0;">
            Regards,<br>
            <strong>Flownex Team</strong>
          </p>
        </div>
        <div class="footer">
          <p>
            <a href="${frontendUrl}/privacy">Privacy Policy</a> &bull; 
            <a href="${frontendUrl}/support">Customer Support</a>
          </p>
          <p>&copy; ${new Date().getFullYear()} Flownex. All rights reserved.</p>
          <p style="font-size: 11px; margin-top: 4px;">This is an automated email from Flownex. Please do not reply unless the email specifically supports replies.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

module.exports = welcomeCompanyTemplate;
