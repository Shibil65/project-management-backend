const { getEmailHeader } = require('../utils/emailHeaderHelper');

/**
 * Generates the HTML password reset link email template.
 * 
 * @param {string} resetLink - Full reset token web URL.
 * @param {string} email - Target employee/user email address.
 * @param {number} expiryMinutes - Token expiration length in minutes.
 * @returns {string} Fully styled HTML template string.
 */
function passwordResetTemplate(resetLink, email, expiryMinutes = 30) {
  const year = new Date().getFullYear();
  const headerHtml = getEmailHeader('Duskra Security Portal', 'Password Reset Request');

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Duskra Password Reset</title>
      <style>
        body {
          margin: 0;
          padding: 0;
          background-color: #F8FAFC;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          color: #334155;
        }
        .container {
          max-width: 500px;
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
        .greeting {
          font-size: 16px;
          font-weight: 700;
          color: #0F172A;
          margin-bottom: 12px;
        }
        .text {
          font-size: 14px;
          line-height: 1.6;
          color: #475569;
          margin-bottom: 24px;
        }
        .btn-container {
          text-align: center;
          margin: 28px 0;
        }
        .btn {
          display: inline-block;
          background-color: #7546E8;
          color: #ffffff !important;
          text-decoration: none;
          padding: 14px 28px;
          border-radius: 8px;
          font-weight: 700;
          font-size: 14px;
          box-shadow: 0 4px 6px -1px rgba(117, 70, 232, 0.25);
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
        .link-box {
          background-color: #F8FAFC;
          border: 1px solid #E2E8F0;
          border-radius: 8px;
          padding: 12px;
          word-break: break-all;
          font-size: 11px;
          color: #64748B;
          font-family: monospace;
          margin-top: 16px;
        }
        .footer {
          background-color: #F8FAFC;
          border-top: 1px solid #E2E8F0;
          padding: 24px;
          text-align: center;
          font-size: 12px;
          color: #94A3B8;
        }
      </style>
    </head>
    <body>
      <div class="container">
        ${headerHtml}
        <div class="content">
          <div class="greeting">Hello,</div>
          <div class="text">
            We received a request to reset your password for your Duskra Employee Workspace account (<strong>${email}</strong>).
          </div>

          <div class="btn-container">
            <a href="${resetLink}" class="btn" target="_blank">Reset Account Password</a>
          </div>

          <div class="text" style="font-size: 13px; color: #64748B;">
            This link is valid for <strong>${expiryMinutes} minutes</strong>. If you did not request a password reset, no action is needed.
          </div>

          <div class="warning-box">
            <strong>Security Notice:</strong> Never forward this reset email to anyone.
          </div>

          <div class="text" style="font-size: 12px; color: #94A3B8; margin-top: 20px;">
            Button not working? Copy and paste this URL into your browser:
            <div class="link-box">${resetLink}</div>
          </div>
        </div>

        <div class="footer">
          <p>&copy; ${year} Duskra Platform. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

module.exports = passwordResetTemplate;
