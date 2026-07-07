require('dotenv').config();
const nodemailer = require('nodemailer');

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

function getSmtpConfig(allowInvalidCerts = process.env.SMTP_ALLOW_INVALID_CERTS === 'true') {
  const smtpUser = getEnvValue(['SMTP_USER', 'SMTP_USERNAME', 'EMAIL_USER', 'EMAIL_USERNAME', 'GMAIL_USER', 'MAIL_USER']);
  const rawPass = getEnvValue(['SMTP_PASS', 'SMTP_PASSWORD', 'EMAIL_PASS', 'EMAIL_PASSWORD', 'GMAIL_PASS', 'GMAIL_APP_PASSWORD', 'MAIL_PASS']);
  const smtpPass = normalizePassword(rawPass);
  const smtpHost = normalizeHost(
    getEnvValue(['SMTP_HOST', 'EMAIL_HOST', 'MAIL_HOST'])
    || (smtpUser && smtpUser.toLowerCase().endsWith('@gmail.com') ? 'smtp.gmail.com' : undefined)
  );
  const smtpPort = parseInt(getEnvValue(['SMTP_PORT', 'EMAIL_PORT', 'MAIL_PORT']) || '587', 10);
  const secure = smtpPort === 465;
  const defaultFromName = getEnvValue(['MAIL_FROM_NAME']) || 'Syncra';
  const defaultFrom = getEnvValue(['MAIL_FROM']) || (smtpUser ? `"${defaultFromName}" <${smtpUser}>` : undefined);
  const timeoutMs = parseInt(getEnvValue(['SMTP_TIMEOUT_MS']) || '10000', 10);

  return {
    smtpPort,
    smtpUser,
    smtpHost,
    smtpPass,
    secure,
    requireTLS: !secure,
    defaultFrom,
    timeoutMs,
    transport: {
      host: smtpHost,
      port: smtpPort,
      secure,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
      requireTLS: !secure,
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

function getMissingSmtpConfig() {
  const config = getSmtpConfig();
  return [
    !config.smtpHost ? 'SMTP_HOST' : null,
    !config.smtpPort ? 'SMTP_PORT' : null,
    !config.smtpUser ? 'SMTP_USER' : null,
    !config.smtpPass ? 'SMTP_PASS' : null,
  ].filter(Boolean);
}

function isSmtpConfigured() {
  return getMissingSmtpConfig().length === 0;
}

function assertSmtpConfigured() {
  const missing = getMissingSmtpConfig();
  if (missing.length) {
    throw new Error(`SMTP is not configured. Missing: ${missing.join(', ')}`);
  }
}

function getSafeSmtpConfig() {
  const config = getSmtpConfig();
  const missing = getMissingSmtpConfig();
  return {
    configured: missing.length === 0,
    missing,
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
    message: err?.message || 'Unknown SMTP error',
    code: err?.code || null,
    command: err?.command || null,
    response: err?.response || null,
    responseCode: err?.responseCode || null,
  };
}

async function logMailStartupStatus() {
  const config = getSafeSmtpConfig();
  console.log('[MAIL] SMTP config availability:', config);

  if (!config.configured) {
    console.warn('[MAIL] SMTP verification skipped. Missing: ' + config.missing.join(', '));
    return { success: false, config };
  }

  if (process.env.SMTP_VERIFY_ON_STARTUP === 'false') {
    console.log('[MAIL] SMTP startup verification disabled by SMTP_VERIFY_ON_STARTUP=false.');
    return { success: true, config, skipped: true };
  }

  try {
    const verified = await verifySmtpConnection();
    console.log('[MAIL] SMTP transporter verified:', verified);
    return { success: true, config: verified };
  } catch (err) {
    console.error('[MAIL] SMTP transporter verification failed:', getSmtpErrorDetails(err));
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
  htmlToText,
  getSmtpConfig,
  getMissingSmtpConfig,
  getSafeSmtpConfig,
  getSmtpErrorDetails,
  logMailStartupStatus,
  verifySmtpConnection,
  isSmtpConfigured
};