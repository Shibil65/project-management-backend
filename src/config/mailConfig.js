require('dotenv').config();

const mailConfig = {
  host: process.env.SMTP_HOST || '',
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: process.env.SMTP_SECURE === 'true',
  user: process.env.SMTP_USER || '',
  pass: process.env.SMTP_PASS || '',
  fromName: process.env.SMTP_FROM_NAME || 'Syncra',
  fromEmail: process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || '',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  provider: process.env.EMAIL_PROVIDER || 'smtp'
};

function validateConfig() {
  const missing = [];
  if (!mailConfig.host) missing.push('SMTP_HOST');
  if (!mailConfig.port) missing.push('SMTP_PORT');
  if (!mailConfig.user) missing.push('SMTP_USER');
  if (!mailConfig.pass) missing.push('SMTP_PASS');
  if (!mailConfig.fromEmail) missing.push('SMTP_FROM_EMAIL');

  if (missing.length > 0) {
    console.error('\n=========================================');
    console.error('[MAIL CONFIG ERROR]: Required email environment variables are missing!');
    for (const key of missing) {
      console.error(`  - ${key}`);
    }
    console.error('Please configure these in your backend .env file to ensure email delivery.');
    console.error('=========================================\n');
    return false;
  }
  return true;
}

module.exports = {
  mailConfig,
  validateConfig
};
