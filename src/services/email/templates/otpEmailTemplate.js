/**
 * Generates the HTML OTP Verification email template.
 * 
 * Deliverability Tip (DNS Records):
 * Ensure your sending domain has SPF, DKIM, and DMARC records configured:
 * 1. SPF: v=spf1 include:sendgrid.net include:_spf.google.com ~all
 * 2. DKIM: Create a TXT record with selector and key provided by your mail provider (e.g. Gmail/SendGrid).
 * 3. DMARC: v=DMARC1; p=quarantine; pct=100; rua=mailto:dmarc-reports@yourdomain.com
 * 
 * @param {string} otpCodeCode - The secure 6-digit OTP code.
 * @param {number} expiryMinutes - Expiry time in minutes.
 * @returns {string} Fully styled HTML template string.
 */
const { getEmailHeader } = require('../utils/emailHeaderHelper');

function otpEmailTemplate(otpCodeCode, expiryMinutes = 10) {
  const year = new Date().getFullYear();
  const headerHtml = getEmailHeader('Duskra Security Portal', 'Verification Code');

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Duskra Verification Code</title>
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
        .title {
          font-size: 18px;
          font-weight: 700;
          color: #0F172A;
          margin-top: 0;
          margin-bottom: 8px;
        }
        .text {
          font-size: 14px;
          line-height: 1.6;
          color: #475569;
          margin-top: 0;
        }
        .otp-box {
          background-color: #F1F5F9;
          border: 1px dashed #CBD5E1;
          border-radius: 12px;
          padding: 24px;
          text-align: center;
          font-size: 36px;
          font-weight: 800;
          color: #4F46E5;
          letter-spacing: 6px;
          margin: 28px 0;
          font-family: Menlo, Monaco, Consolas, "Courier New", monospace;
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
      </style>
    </head>
    <body>
      <div class="container">
        ${headerHtml}
        <div class="content">
          <h2 class="title">Verification Code</h2>
          <p class="text">Use the secure verification code below to authorize your login request on the Duskra Portal.</p>
          
          <div class="otp-box">${otpCodeCode}</div>
          
          <p class="text" style="font-size: 13px; color: #64748B;">
            This passcode will expire in <strong>${expiryMinutes} minutes</strong>. If you did not make this request, you can safely ignore this email.
          </p>
          
          <div class="warning-box">
            <strong>Security Warning:</strong> Do not share this OTP with anyone. Duskra administrators will never ask for your verification passcode.
          </div>
          
          <p class="text" style="margin-bottom: 0; font-size: 13px; margin-top: 24px;">
            Regards,<br>
            <strong>Duskra Security Node</strong>
          </p>
        </div>
        <div class="footer">
          <p>&copy; ${year} Duskra Technologies Inc. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

module.exports = otpEmailTemplate;
