require('dotenv').config();
const { sendEmail } = require('./src/services/email/utils/sendEmail');

async function testSend() {
  console.log('Testing sendEmail with environment configuration...');
  console.log('Provider:', process.env.EMAIL_PROVIDER);
  console.log('SMTP Host:', process.env.SMTP_HOST);
  console.log('SMTP Port:', process.env.SMTP_PORT);
  console.log('SMTP User:', process.env.SMTP_USER);
  console.log('From Email:', process.env.SMTP_FROM_EMAIL);

  try {
    const result = await sendEmail({
      to: process.env.SMTP_FROM_EMAIL || 'test@example.com',
      subject: 'Test Email from Syncra Backend',
      text: 'This is a test email to check SMTP delivery.',
      html: '<h1>Test Email</h1><p>This is a test email to check SMTP delivery.</p>'
    });
    console.log('SUCCESS! Email sent:', result);
  } catch (err) {
    console.error('FAILED to send email:');
    console.error('Error Message:', err.message);
    console.error('Error Code:', err.code);
    console.error('Error Command:', err.command);
    console.error('Error Response:', err.response);
  }
}

testSend();
