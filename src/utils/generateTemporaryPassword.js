const { generateStrongPassword } = require('./passwordPolicy');

/**
 * Generates a strong temporary password.
 * Delegates to the existing secure password policy.
 * 
 * @returns {string} Strong temporary password.
 */
function generateTemporaryPassword() {
  return generateStrongPassword();
}

module.exports = generateTemporaryPassword;
