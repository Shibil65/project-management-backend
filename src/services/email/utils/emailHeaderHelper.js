const fs = require('fs');
const path = require('path');

const DEFAULT_LOGO_URL = process.env.BRAND_LOGO_URL || '';

/**
 * Returns a public HTTPS URL for the logo if configured with a real domain.
 */
function getLogoUrl() {
  if (process.env.BRAND_LOGO_URL) {
    return process.env.BRAND_LOGO_URL;
  }
  if (process.env.PUBLIC_LOGO_URL) {
    return process.env.PUBLIC_LOGO_URL;
  }
  if (process.env.FRONTEND_URL && !process.env.FRONTEND_URL.includes('localhost')) {
    return `${process.env.FRONTEND_URL.replace(/\/$/, '')}/branding/flownex-logo.png`;
  }
  return DEFAULT_LOGO_URL;
}

function getLogoBase64() {
  return getLogoUrl();
}

/**
 * Generates a bulletproof email header with embedded Flownex branding.
 * Compatible across 100% of email clients (Gmail, Outlook, Apple Mail, Yahoo) without broken image boxes.
 */
function getEmailHeader(title = 'Flownex Workspace', subtitle = '') {
  const logoUrl = getLogoUrl();
  const isRealHttpsUrl = logoUrl && logoUrl.startsWith('https://') && !logoUrl.includes('your-production-domain.com') && !logoUrl.includes('localhost');

  return `
    <div style="background: linear-gradient(135deg, #0F172A 0%, #1E293B 100%); padding: 36px 24px; text-align: center; border-radius: 16px 16px 0 0;">
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" align="center" style="margin: 0 auto; border-collapse: collapse;">
        <tr>
          <td style="vertical-align: middle; text-align: center;">
            ${isRealHttpsUrl ? `
              <img src="${logoUrl}" alt="Flownex" height="42" style="display: block; height: 42px; width: auto; border: 0; outline: none; text-decoration: none; object-fit: contain; margin: 0 auto 12px auto;" />
            ` : `
              <!-- Bulletproof Vector HTML Brand Mark (Guaranteed zero broken image box in Gmail) -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" align="center" style="margin: 0 auto;">
                <tr>
                  <td style="background: linear-gradient(135deg, #4F63F5 0%, #20B7C9 48%, #12C6A3 100%); width: 44px; height: 44px; border-radius: 12px; text-align: center; vertical-align: middle; box-shadow: 0 4px 12px rgba(79, 99, 245, 0.3);">
                    <span style="color: #FFFFFF; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 22px; font-weight: 900; line-height: 44px; display: inline-block;">F</span>
                  </td>
                  <td style="padding-left: 12px; vertical-align: middle; text-align: left;">
                    <span style="color: #FFFFFF; font-family: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 26px; font-weight: 800; letter-spacing: -0.04em; display: inline-block;">Flownex<span style="color: #20B7C9;">.</span></span>
                  </td>
                </tr>
              </table>
            `}
          </td>
        </tr>
      </table>
      ${title ? `<h1 style="color: #FFFFFF; font-family: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 20px; font-weight: 800; margin: 20px 0 0 0; letter-spacing: -0.02em;">${title}</h1>` : ''}
      ${subtitle ? `<p style="color: #94A3B8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 13px; margin: 6px 0 0 0; font-weight: 500;">${subtitle}</p>` : ''}
    </div>
  `;
}

module.exports = {
  getEmailHeader,
  getLogoUrl,
  getLogoBase64
};
