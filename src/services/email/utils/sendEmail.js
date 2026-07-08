require('dotenv').config();
const nodemailer = require('nodemailer');
const https = require('https');
const { mailConfig } = require('../../../../config/mailConfig');

function getSmtpConfig(allowInvalidCerts = (process.env.NODE_ENV !== 'production' && process.env.SMTP_ALLOW_INVALID_CERTS === 'true')) {
  const { host, port, secure, user, pass, fromName, fromEmail } = mailConfig.smtp;
  const defaultFrom = fromEmail ? `"${fromName}" <${fromEmail}>` : undefined;
  
  const transport = {
    host,
    port,
    secure,
    auth: {
      user,
      pass
    },
    tls: allowInvalidCerts ? { rejectUnauthorized: false } : undefined
  };

  return {
    host,
    port,
    secure,
    user,
    pass,
    defaultFrom,
    transport
  };
}

function createTransporter() {
  return nodemailer.createTransport(getSmtpConfig().transport);
}

// Global SMTP transporter
const transporter = createTransporter();

// Helper to check if SMTP is fully configured
function isSmtpConfigured() {
  const { host, port, user, pass, fromEmail } = mailConfig.smtp;
  return !!(host && port && user && pass && fromEmail);
}

function assertSmtpConfigured() {
  if (!isSmtpConfigured()) {
    throw new Error('SMTP credentials are incomplete or invalid.');
  }
}

// Verify SMTP connection
async function verifySmtpConnection() {
  assertSmtpConfigured();
  await createTransporter().verify();
  return {
    host: mailConfig.smtp.host,
    port: mailConfig.smtp.port,
    user: mailConfig.smtp.user,
    fromEmail: mailConfig.smtp.fromEmail
  };
}

function getSafeSmtpConfig() {
  return {
    provider: mailConfig.provider,
    smtpHost: mailConfig.smtp.host,
    smtpPort: mailConfig.smtp.port,
    fromEmail: mailConfig.smtp.fromEmail
  };
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
  const selectedProvider = mailConfig.provider;

  if (selectedProvider === 'api') {
    if (!mailConfig.api.key || !mailConfig.api.senderEmail) {
      console.error('[MAIL SYSTEM STATUS] Brevo API is selected but configured incorrectly. Check BREVO_API_KEY and BREVO_SENDER_EMAIL.');
      return { success: false };
    }
    console.log('[MAIL SYSTEM STATUS] Brevo API mode configured successfully.');
    return { success: true };
  }

  // SMTP mode
  if (!isSmtpConfigured()) {
    console.error('[MAIL SYSTEM STATUS] SMTP mode selected but credentials are incomplete.');
    return { success: false };
  }

  try {
    await verifySmtpConnection();
    console.log('[MAIL SYSTEM STATUS] SMTP connection verified successfully.');
    return { success: true };
  } catch (err) {
    console.error('[MAIL SYSTEM STATUS] SMTP verification failed on startup:', getSmtpErrorDetails(err));
    return { success: false, error: getSmtpErrorDetails(err) };
  }
}

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

async function sendViaBrevoApi({ to, subject, html, text }) {
  const apiKey = mailConfig.api.key;
  if (!apiKey) {
    const err = new Error('BREVO_API_KEY is missing/invalid or EMAIL_PROVIDER is wrong.');
    err.statusCode = 401;
    err.code = 'HTTP_401';
    throw err;
  }

  const { senderName, senderEmail } = mailConfig.api;
  if (!senderEmail) {
    throw new Error('SMTP_FROM_EMAIL is missing or not verified.');
  }

  const requestBody = {
    sender: {
      name: senderName,
      email: senderEmail
    },
    to: [
      {
        email: to
      }
    ],
    subject: subject,
    htmlContent: html,
    textContent: text || htmlToText(html)
  };

  const headers = {
    'accept': 'application/json',
    'api-key': apiKey,
    'content-type': 'application/json'
  };

  return await makeHttpsPost('https://api.brevo.com/v3/smtp/email', headers, requestBody);
}

async function sendEmail({ to, subject, html, text, from, replyTo, headers }) {
  const provider = mailConfig.provider;

  if (provider === 'api') {
    return await sendViaBrevoApi({ to, subject, html, text });
  }

  // SMTP Mode
  assertSmtpConfigured();
  const smtpConfig = getSmtpConfig();

  const finalFrom = from || smtpConfig.defaultFrom;
  const finalText = text || htmlToText(html);

  const mailOptions = {
    from: finalFrom,
    to,
    subject,
    text: finalText,
    html,
    replyTo: replyTo || smtpConfig.user,
    headers: {
      'X-Auto-Response-Suppress': 'OOF, AutoReply',
      'X-Entity-Ref-ID': `syncra-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      'Precedence': 'bulk',
      ...headers
    }
  };

  return await transporter.sendMail(mailOptions);
}

module.exports = {
  transporter,
  sendEmail,
  htmlToText,
  isSmtpConfigured,
  getSafeSmtpConfig,
  getSmtpErrorDetails,
  logMailStartupStatus,
  verifySmtpConnection
};