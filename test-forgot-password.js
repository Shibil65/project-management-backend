const bcrypt = require('bcryptjs');
const { employeeForgotPassword, employeeResetPassword } = require('./src/controllers/employeePortal/forgotPassword');
const employeeLoginModule = require('./src/controllers/employeePortal/employeeLogin');

async function testFullResetAndLogin() {
  console.log('--- Testing Password Reset & Login Workflow ---');
  
  const testEmail = 'employee@testcompany.com';
  const newPwd = 'MySuperNewPassword123!';

  // 1. Forgot Password Request
  let forgotResData = null;
  await employeeForgotPassword(
    { body: { email: testEmail } },
    {
      status(code) { this.statusCode = code; return this; },
      json(data) { forgotResData = data; return data; }
    }
  );
  console.log('1. Forgot Password Response:', forgotResData);

  const urlObj = new URL(forgotResData.devResetUrl);
  const token = urlObj.searchParams.get('token');
  const email = urlObj.searchParams.get('email');

  // 2. Reset Password Submission
  let resetResData = null;
  await employeeResetPassword(
    { body: { token, email, newPassword: newPwd, confirmPassword: newPwd } },
    {
      status(code) { this.statusCode = code; return this; },
      json(data) { resetResData = data; return data; }
    }
  );
  console.log('2. Reset Password Response:', resetResData);

  // 3. Attempt Login with NEW Password
  let loginResData = null;
  let loginStatus = 0;
  await employeeLoginModule.employeeLogin(
    { body: { email: testEmail, password: newPwd } },
    {
      status(code) { loginStatus = code; this.statusCode = code; return this; },
      json(data) { loginResData = data; return data; }
    }
  );
  console.log('3. Login with New Password Status:', loginStatus, loginResData);

  if (loginStatus === 200 && loginResData.success) {
    console.log('\n✅ VERIFIED: Password reset & login with new password WORKS PERFECTLY!');
  } else {
    console.error('\n❌ FAILED: Login failed after password reset.');
  }
}

testFullResetAndLogin().catch(console.error);
