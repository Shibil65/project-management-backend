require('dotenv').config();

const mailConfig = {
  provider: (process.env.EMAIL_PROVIDER || 'smtp').trim().toLowerCase(),
  
  // SMTP Mode Config
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    fromName: process.env.SMTP_FROM_NAME || 'Duskra',
    fromEmail: process.env.SMTP_FROM_EMAIL || ''
  },

  // API Mode Config
  api: {
    key: process.env.BREVO_API_KEY || '',
    senderName: process.env.BREVO_SENDER_NAME || 'Duskra',
    senderEmail: process.env.BREVO_SENDER_EMAIL || ''
  },

  // Security Policy
  allowDevBypass: process.env.ALLOW_DEV_OTP_BYPASS === 'true',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173'
};

function maskSecret(val) {
  if (!val) return 'not_configured';
  if (val.length <= 8) return '********';
  return `${val.slice(0, 4)}...${val.slice(-4)}`;
}

function validateConfig() {
  const missing = [];
  const selectedProvider = mailConfig.provider;

  console.log('=========================================');
  console.log(`[MAIL SYSTEM] Initializing email service...`);
  console.log(`[MAIL SYSTEM] Selected Provider: ${selectedProvider.toUpperCase()}`);

  if (selectedProvider === 'api') {
    if (!mailConfig.api.key) missing.push('BREVO_API_KEY');
    if (!mailConfig.api.senderEmail) missing.push('BREVO_SENDER_EMAIL');

    console.log(`[MAIL SYSTEM] Brevo API Endpoint: https://api.brevo.com/v3/smtp/email`);
    console.log(`[MAIL SYSTEM] Sender Email:      ${mailConfig.api.senderEmail || 'not_configured'}`);
    console.log(`[MAIL SYSTEM] API Key:           ${maskSecret(mailConfig.api.key)}`);
  } else {
    // Default to SMTP
    if (!mailConfig.smtp.host) missing.push('SMTP_HOST');
    if (!mailConfig.smtp.port) missing.push('SMTP_PORT');
    if (!mailConfig.smtp.user) missing.push('SMTP_USER');
    if (!mailConfig.smtp.pass) missing.push('SMTP_PASS');
    if (!mailConfig.smtp.fromEmail) missing.push('SMTP_FROM_EMAIL');

    console.log(`[MAIL SYSTEM] SMTP Host:         ${mailConfig.smtp.host || 'not_configured'}`);
    console.log(`[MAIL SYSTEM] SMTP Port:         ${mailConfig.smtp.port || 'not_configured'}`);
    console.log(`[MAIL SYSTEM] SMTP Secure:       ${mailConfig.smtp.secure}`);
    console.log(`[MAIL SYSTEM] SMTP User:         ${mailConfig.smtp.user || 'not_configured'}`);
    console.log(`[MAIL SYSTEM] SMTP Pass:         ${maskSecret(mailConfig.smtp.pass)}`);
    console.log(`[MAIL SYSTEM] Sender Email:      ${mailConfig.smtp.fromEmail || 'not_configured'}`);
  }

  console.log(`[MAIL SYSTEM] Dev Bypass Active: ${mailConfig.allowDevBypass && process.env.NODE_ENV !== 'production'}`);
  console.log('=========================================');

  if (missing.length > 0) {
    console.error(`\n[MAIL CONFIG ERROR]: Missing environment variables for ${selectedProvider.toUpperCase()} mode:`);
    for (const key of missing) {
      console.error(`  - ${key}`);
    }
    console.error('Please configure these in your .env file to ensure email delivery.\n');
    return false;
  }
  return true;
}

module.exports = {
  mailConfig,
  validateConfig
};
