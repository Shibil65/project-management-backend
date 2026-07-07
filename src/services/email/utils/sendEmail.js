require('dotenv').config();
const nodemailer = require('nodemailer');
const https = require('https');

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

function getResendApiKey() {
  return getEnvValue(['RESEND_API_KEY']);
}

function getSendGridApiKey() {
  return getEnvValue(['SENDGRID_API_KEY']);
}

function isEmailApiConfigured() {
  return !!(getResendApiKey() || getSendGridApiKey());
}

function getMissingSmtpConfig() {
  if (isEmailApiConfigured()) {
    return [];
  }
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
  if (missing.length && !isEmailApiConfigured()) {
    throw new Error(`SMTP/API is not configured. Missing: ${missing.join(', ')}`);
  }
}

function getSafeSmtpConfig() {
  const config = getSmtpConfig();
  const missing = getMissingSmtpConfig();
  const hasResend = !!getResendApiKey();
  const hasSendGrid = !!getSendGridApiKey();
  
  return {
    configured: missing.length === 0 || hasResend || hasSendGrid,
    missing,
    provider: hasResend ? 'Resend API' : (hasSendGrid ? 'SendGrid API' : 'SMTP'),
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
  if (isEmailApiConfigured()) {
    return getSafeSmtpConfig();
  }
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

async function logMailStartupStatus() {
  const config = getSafeSmtpConfig();
  console.log('[MAIL] Email service availability:', config);

  if (!config.configured) {
    console.warn('[MAIL] Email service verification skipped. Missing: ' + config.missing.join(', '));
    return { success: false, config };
  }

  if (isEmailApiConfigured()) {
    console.log(`[MAIL] Running with HTTP API provider: ${config.provider}`);
    return { success: true, config };
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

function makeHttpsPost(urlStr, headers, bodyObj) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const bodyString = JSON.stringify(bodyObj);
    
    const options = {
      method: 'POST',
      hostname: url.hostname,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyString),
        ...headers
      }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        let parsed = null;
        try {
          parsed = data ? JSON.parse(data) : {};
        } catch (e) {
          parsed = { rawResponse: data };
        }
        
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ statusCode: res.statusCode, body: parsed });
        } else {
          let errorMsg = '';
          if (parsed && typeof parsed === 'object') {
            if (Array.isArray(parsed.errors) && parsed.errors.length > 0 && parsed.errors[0].message) {
              errorMsg = parsed.errors[0].message;
            } else if (parsed.message) {
              errorMsg = parsed.message;
            } else if (parsed.error) {
              errorMsg = typeof parsed.error === 'object' ? (parsed.error.message || JSON.stringify(parsed.error)) : parsed.error;
            }
          }
          if (!errorMsg) {
            errorMsg = `HTTP error ${res.statusCode}`;
          }
          
          const err = new Error(errorMsg);
          err.statusCode = res.statusCode;
          err.response = parsed;
          err.code = `HTTP_${res.statusCode}`;
          reject(err);
        }
      });
    });
    
    req.on('error', (err) => {
      reject(err);
    });
    
    req.write(bodyString);
    req.end();
  });
}

async function sendViaResend({ to, subject, html, text, from, replyTo }) {
  const apiKey = getResendApiKey();
  const parsedFrom = parseEmailString(from || 'onboarding@resend.dev');

  // Resend free tier/sandbox only allows sending from onboarding@resend.dev
  // if the sender is a free public email (like Gmail).
  const publicDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com', 'live.com', 'icloud.com', 'zoho.com'];
  const domain = parsedFrom.email.split('@')[1]?.toLowerCase();

  let senderEmail = parsedFrom.email;
  if (publicDomains.includes(domain) || !domain) {
    senderEmail = 'onboarding@resend.dev';
  }

  const finalFrom = parsedFrom.name ? `"${parsedFrom.name}" <${senderEmail}>` : senderEmail;

  const payload = {
    from: finalFrom,
    to: typeof to === 'string' ? to.split(',').map(e => e.trim()) : to,
    subject: subject,
    html: html,
    text: text
  };

  if (senderEmail === 'onboarding@resend.dev' && parsedFrom.email && parsedFrom.email !== 'onboarding@resend.dev') {
    payload.replyTo = replyTo || parsedFrom.email;
  } else if (replyTo) {
    payload.replyTo = replyTo;
  }

  try {
    const res = await makeHttpsPost(
      'https://api.resend.com/emails',
      {
        'Authorization': `Bearer ${apiKey}`,
        'User-Agent': 'syncra-backend/1.0'
      },
      payload
    );
    return res.body;
  } catch (err) {
    console.error('[MAIL] Resend API error details:', err.response || err.message);
    throw err;
  }
}

async function sendViaSendGrid({ to, subject, html, text, from, replyTo }) {
  const apiKey = getSendGridApiKey();
  const parsedFrom = parseEmailString(from || 'no-reply@syncra.com');
  const toEmails = typeof to === 'string' ? to.split(',').map(e => e.trim()) : to;
  
  const payload = {
    personalizations: [
      {
        to: toEmails.map(email => ({ email }))
      }
    ],
    from: {
      email: parsedFrom.email,
      ...(parsedFrom.name ? { name: parsedFrom.name } : {})
    },
    subject: subject,
    content: [
      {
        type: 'text/html',
        value: html
      }
    ]
  };

  if (text) {
    payload.content.unshift({
      type: 'text/plain',
      value: text
    });
  }

  if (replyTo) {
    const parsedReplyTo = parseEmailString(replyTo);
    payload.reply_to = {
      email: parsedReplyTo.email,
      ...(parsedReplyTo.name ? { name: parsedReplyTo.name } : {})
    };
  }

  try {
    const res = await makeHttpsPost(
      'https://api.sendgrid.com/v3/mail/send',
      {
        'Authorization': `Bearer ${apiKey}`,
        'User-Agent': 'syncra-backend/1.0'
      },
      payload
    );
    return res.body;
  } catch (err) {
    console.error('[MAIL] SendGrid API error details:', err.response || err.message);
    throw err;
  }
}

async function sendEmail({ to, subject, html, text, from, replyTo, headers }) {
  const resendApiKey = getResendApiKey();
  const sendGridApiKey = getSendGridApiKey();
  const { smtpUser, defaultFrom } = getSmtpConfig();

  const finalFrom = from || defaultFrom;
  const finalText = text || htmlToText(html);

  if (resendApiKey) {
    console.log('[MAIL] Sending email via Resend API to:', to);
    return await sendViaResend({ to, subject, html, text: finalText, from: finalFrom, replyTo });
  }

  if (sendGridApiKey) {
    console.log('[MAIL] Sending email via SendGrid API to:', to);
    return await sendViaSendGrid({ to, subject, html, text: finalText, from: finalFrom, replyTo });
  }

  // Fallback to SMTP
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