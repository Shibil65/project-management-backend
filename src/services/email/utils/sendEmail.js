require('dotenv').config();
const nodemailer = require('nodemailer');

function getSmtpConfig(allowInvalidCerts = process.env.SMTP_ALLOW_INVALID_CERTS === 'true') {
  const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
  const smtpUser = process.env.SMTP_USER;
  const defaultFromName = process.env.MAIL_FROM_NAME || 'Syncra';
  const defaultFrom = process.env.MAIL_FROM || (smtpUser ? `"${defaultFromName}" <${smtpUser}>` : undefined);
  const timeoutMs = parseInt(process.env.SMTP_TIMEOUT_MS || '8000', 10);

  return {
    smtpPort,
    smtpUser,
    defaultFrom,
    transport: {
      host: process.env.SMTP_HOST,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: smtpUser,
        pass: process.env.SMTP_PASS ? process.env.SMTP_PASS.replace(/\s+/g, '') : undefined,
      },
      requireTLS: smtpPort !== 465,
      tls: allowInvalidCerts ? { rejectUnauthorized: false } : undefined,
      connectionTimeout: timeoutMs,
      greetingTimeout: timeoutMs,
      socketTimeout: timeoutMs,
    }
  };
}

function createTransporter(allowInvalidCerts) {
  return nodemailer.createTransport(getSmtpConfig(allowInvalidCerts).transport);
}

const transporter = createTransporter();

function htmlToText(html = '') {
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function isCertificateChainError(err) {
  const message = String(err?.message || '').toLowerCase();
  return message.includes('self-signed certificate') || message.includes('certificate chain');
}

function assertSmtpConfigured() {
  const missing = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'].filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`SMTP is not configured. Missing: ${missing.join(', ')}`);
  }
}

async function sendWithRetry(mailOptions) {
  assertSmtpConfigured();
  try {
    return await createTransporter().sendMail(mailOptions);
  } catch (err) {
    if (isCertificateChainError(err)) {
      console.warn('[MAIL] TLS certificate chain issue detected. Retrying with SMTP_ALLOW_INVALID_CERTS behavior for this send.');
      return await createTransporter(true).sendMail(mailOptions);
    }
    throw err;
  }
}

/**
 * Sends a generic email using the shared transporter configuration.
 *
 * @param {Object} options - Mail options.
 * @param {string} options.to - Recipient email.
 * @param {string} options.subject - Email subject.
 * @param {string} options.html - HTML content.
 * @param {string} [options.text] - Plain text fallback content.
 * @param {string} [options.from] - Custom from display header.
 * @param {string} [options.replyTo] - Custom reply-to header.
 * @param {Object} [options.headers] - Additional mail headers.
 */
async function sendEmail({ to, subject, html, text, from, replyTo, headers }) {
  const { smtpUser, defaultFrom } = getSmtpConfig();
  const mailOptions = {
    from: from || defaultFrom,
    sender: smtpUser,
    replyTo: replyTo || smtpUser,
    to,
    subject,
    text: text || htmlToText(html),
    html,
    headers: {
      'X-Auto-Response-Suppress': 'OOF, AutoReply',
      'X-Entity-Ref-ID': `syncra-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      ...headers
    }
  };
  return await sendWithRetry(mailOptions);
}

module.exports = {
  transporter,
  createTransporter,
  sendEmail,
  htmlToText
};