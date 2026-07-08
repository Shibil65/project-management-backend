require('dotenv').config();
const nodemailer = require('nodemailer');

/**
 * Deliverability DNS Configuration Guidelines:
 * To protect your domain reputation and prevent emails from landing in SPAM:
 * 
 * 1. SPF (Sender Policy Framework):
 *    Add a TXT record for your domain:
 *    - Name: @
 *    - Value: v=spf1 include:_spf.google.com ~all (Adjust if using a custom server like AWS SES or Mailgun)
 * 
 * 2. DKIM (DomainKeys Identified Mail):
 *    Generate a DKIM key pair via your email administrator console (G Suite, Microsoft 365, etc.), 
 *    and add the TXT record:
 *    - Name: google._domainkey (or your provider selector)
 *    - Value: v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BA... (your public key)
 * 
 * 3. DMARC (Domain-based Message Authentication, Reporting, and Conformance):
 *    Add a TXT record to enforce alignment check results:
 *    - Name: _dmarc.yourdomain.com
 *    - Value: v=DMARC1; p=quarantine; pct=100; rua=mailto:dmarc-reports@yourdomain.com
 */

function getEnvValue(names) {
  for (const name of names) {
    const value = process.env[name];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function normalizeHost(host) {
  return host ? String(host).trim().toLowerCase() : undefined;
}

function normalizePassword(password) {
  return password ? String(password).replace(/\s+/g, '') : undefined;
}

function maskEmail(email = '') {
  const [name, domain] = String(email).split('@');
  if (!name || !domain) return email ? 'configured' : '';
  return `${name.slice(0, 2)}***@${domain}`;
}

/**
 * Parse SMTP config from environment variables
 */
function getSmtpConfig(allowInvalidCerts = process.env.SMTP_ALLOW_INVALID_CERTS === 'true') {
  const smtpUser = getEnvValue(['SMTP_USER', 'SMTP_USERNAME', 'EMAIL_USER', 'EMAIL_USERNAME', 'GMAIL_USER', 'MAIL_USER']);
  const rawPass = getEnvValue(['SMTP_PASS', 'SMTP_PASSWORD', 'EMAIL_PASS', 'EMAIL_PASSWORD', 'GMAIL_PASS', 'GMAIL_APP_PASSWORD', 'MAIL_PASS']);
  const smtpPass = normalizePassword(rawPass);
  
  const smtpHost = normalizeHost(
    getEnvValue(['SMTP_HOST', 'EMAIL_HOST', 'MAIL_HOST'])
    || (smtpUser && smtpUser.toLowerCase().endsWith('@gmail.com') ? 'smtp.gmail.com' : undefined)
  );
  
  const smtpPort = parseInt(getEnvValue(['SMTP_PORT', 'EMAIL_PORT', 'MAIL_PORT']) || '587', 10);
  
  // SMTP_SECURE can be "true" or "false". Default to true if port is 465.
  const smtpSecureEnv = getEnvValue(['SMTP_SECURE']);
  const secure = smtpSecureEnv !== undefined ? smtpSecureEnv === 'true' : smtpPort === 465;

  const fromName = getEnvValue(['SMTP_FROM_NAME', 'MAIL_FROM_NAME']) || 'Syncra';
  const fromEmail = getEnvValue(['SMTP_FROM_EMAIL', 'MAIL_FROM']) || smtpUser;
  const defaultFrom = fromEmail ? `"${fromName}" <${fromEmail}>` : undefined;
  
  const timeoutMs = parseInt(getEnvValue(['SMTP_TIMEOUT_MS']) || '10000', 10);

  const transport = {
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
    connectionTimeout: timeoutMs,
    greetingTimeout: timeoutMs,
    socketTimeout: timeoutMs,
  };

  const isGmail = smtpHost === 'smtp.gmail.com' || smtpHost === 'gmail' || (smtpUser && smtpUser.toLowerCase().endsWith('@gmail.com'));

  if (isGmail) {
    transport.service = 'gmail';
    // If corporate proxy certificates are blocked, bypass validation locally
    if (allowInvalidCerts) {
      transport.tls = { rejectUnauthorized: false };
    }
  } else {
    transport.host = smtpHost;
    transport.port = smtpPort;
    transport.secure = secure;
    transport.requireTLS = !secure;
    transport.tls = allowInvalidCerts ? { rejectUnauthorized: false } : undefined;
  }

  return {
    smtpPort,
    smtpUser,
    smtpHost,
    smtpPass,
    secure,
    requireTLS: !secure,
    defaultFrom,
    timeoutMs,
    transport
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

function getMissingSmtpConfig() {
  const config = getSmtpConfig();
  const required = [
    { key: 'SMTP_HOST', value: config.smtpHost },
    { key: 'SMTP_PORT', value: config.smtpPort },
    { key: 'SMTP_USER', value: config.smtpUser },
    { key: 'SMTP_PASS', value: config.smtpPass },
    { key: 'SMTP_FROM_EMAIL', value: process.env.SMTP_FROM_EMAIL || config.smtpUser }
  ];
  return required.filter(r => !r.value).map(r => r.key);
}

function isSmtpConfigured() {
  return getMissingSmtpConfig().length === 0;
}

function assertSmtpConfigured() {
  const missing = getMissingSmtpConfig();
  if (missing.length) {
    throw new Error(`SMTP is not configured. Missing environment variables: ${missing.join(', ')}`);
  }
}

function getSafeSmtpConfig() {
  const config = getSmtpConfig();
  const missing = getMissingSmtpConfig();
  
  return {
    configured: missing.length === 0,
    missing,
    provider: 'SMTP',
    host: config.smtpHost || null,
    port: config.smtpPort || null,
    secure: config.secure,
    requireTLS: config.requireTLS,
    user: maskEmail(config.smtpUser),
    from: config.defaultFrom || null,
    timeoutMs: config.timeoutMs,
  };
}

async function verifySmtpConnection() {
  assertSmtpConfigured();
  await createTransporter().verify();
  return getSafeSmtpConfig();
}

function getSmtpErrorDetails(err) {
  return {
    message: err?.message || 'Unknown email error',
    code: err?.code || null,
    command: err?.command || null,
    response: err?.response || null,
    responseCode: err?.responseCode || err?.statusCode || null,
  };
}

/**
 * Validate configuration and print high-visibility startup diagnostics
 */
async function logMailStartupStatus() {
  const config = getSafeSmtpConfig();
  const missing = getMissingSmtpConfig();
  
  if (missing.length > 0) {
    console.error('\n=========================================');
    console.error('[MAIL CONFIG ERROR]: Required email environment variables are missing! Email sending will fail.');
    for (const m of missing) {
      console.error(`  - ${m}`);
    }
    console.error('Please configure these in your backend .env file (e.g. SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM_EMAIL).');
    console.error('=========================================\n');
    return { success: false, config };
  }

  if (process.env.SMTP_VERIFY_ON_STARTUP === 'false') {
    console.log('[MAIL] SMTP startup verification disabled by SMTP_VERIFY_ON_STARTUP=false.');
    return { success: true, config, skipped: true };
  }

  try {
    const verified = await verifySmtpConnection();
    console.log('[MAIL] SMTP transporter verified successfully:', verified);
    return { success: true, config: verified };
  } catch (err) {
    console.error('[MAIL] SMTP transporter verification failed on startup:', getSmtpErrorDetails(err));
    return { success: false, config, error: getSmtpErrorDetails(err) };
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

function parseEmailString(emailStr) {
  if (!emailStr) return { email: '', name: '' };
  const cleanStr = String(emailStr).trim();
  const angleBracketIndex = cleanStr.indexOf('<');
  if (angleBracketIndex !== -1) {
    const name = cleanStr.substring(0, angleBracketIndex).replace(/"/g, '').trim();
    const email = cleanStr.substring(angleBracketIndex + 1, cleanStr.length - 1).trim();
    return { name, email };
  }
  return { name: '', email: cleanStr };
}

/**
 * Primary interface to send an email. Sets headers to prevent spam blockages.
 */
async function sendEmail({ to, subject, html, text, from, replyTo, headers }) {
  const { smtpUser, defaultFrom } = getSmtpConfig();

  const finalFrom = from || defaultFrom;
  const finalText = text || htmlToText(html);

  const mailOptions = {
    from: finalFrom,
    sender: smtpUser,
    replyTo: replyTo || smtpUser,
    to,
    subject,
    text: finalText,
    html,
    headers: {
      'X-Auto-Response-Suppress': 'OOF, AutoReply',
      'X-Entity-Ref-ID': `syncra-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      'Precedence': 'bulk',
      ...headers
    }
  };
  return await sendWithRetry(mailOptions);
}

module.exports = {
  transporter,
  createTransporter,
  sendEmail,
  htmlToText,
  getSmtpConfig,
  getMissingSmtpConfig,
  getSafeSmtpConfig,
  getSmtpErrorDetails,
  logMailStartupStatus,
  verifySmtpConnection,
  isSmtpConfigured
};