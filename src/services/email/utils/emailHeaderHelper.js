const fs = require('fs');
const path = require('path');

const DEFAULT_LOGO_URL = 'https://duskra-lime.vercel.app/duskra-icon.png';

/**
 * Returns a public HTTPS URL for the logo.
 * Note: Base64 data URIs (data:image/png;base64,...) are BLOCKED by Gmail and major webmail providers.
 * Using a public HTTPS URL ensures the logo renders across 100% of email clients.
 */
function getLogoUrl() {
  if (process.env.PUBLIC_LOGO_URL) {
    return process.env.PUBLIC_LOGO_URL;
  }
  if (process.env.FRONTEND_URL) {
    return `${process.env.FRONTEND_URL.replace(/\/$/, '')}/duskra-icon.png`;
  }
  return DEFAULT_LOGO_URL;
}

// Backwards compatibility alias
function getLogoBase64() {
  return getLogoUrl();
}

/**
 * Generates an email header with embedded Duskra logo & HTML brand wordmark.
 * Works seamlessly across 100% of email clients (Gmail, Outlook, Apple Mail, Mobile).
 */
function getEmailHeader(title = 'Duskra Security Portal', subtitle = '') {
  const logoSrc = getLogoUrl();

  return `
    <div style="background: linear-gradient(135deg, #0F172A 0%, #1E293B 100%); padding: 32px 24px; text-align: center; border-radius: 16px 16px 0 0;">
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" align="center" style="margin: 0 auto; border-collapse: collapse;">
        <tr>
          <td style="vertical-align: middle; padding-right: 14px;">
            <img src="${logoSrc}" alt="Duskra Logo" width="46" height="46" style="display: block; width: 46px; height: 46px; max-width: 46px; border: 0; outline: none; text-decoration: none; object-fit: contain;" />
          </td>
          <td style="vertical-align: middle; text-align: left;">
            <div style="font-family: 'Michroma', 'Segoe UI', Helvetica, Arial, sans-serif; font-size: 26px; font-weight: 700; color: #FFFFFF; letter-spacing: 1px; line-height: 1; text-transform: lowercase;">
              duskr<span style="color: #7546E8;">a</span>
            </div>
            <div style="font-family: 'Inter', 'Segoe UI', Helvetica, Arial, sans-serif; font-size: 9px; font-weight: 600; color: #94A3B8; letter-spacing: 2.5px; text-transform: uppercase; margin-top: 5px;">
              Plan. Collaborate. Deliver.
            </div>
          </td>
        </tr>
      </table>
      ${title ? `<h1 style="color: #FFFFFF; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 20px; font-weight: 800; margin: 20px 0 0 0; letter-spacing: -0.4px;">${title}</h1>` : ''}
      ${subtitle ? `<p style="color: #94A3B8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 13px; margin: 4px 0 0 0; font-weight: 600;">${subtitle}</p>` : ''}
    </div>
  `;
}

module.exports = {
  getEmailHeader,
  getLogoUrl,
  getLogoBase64
};
