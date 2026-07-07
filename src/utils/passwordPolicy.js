const PASSWORD_POLICY_MESSAGE = 'Password must be at least 8 characters long.';

function validatePassword(password) {
  const value = String(password || '');
  const checks = {
    length: value.length >= 8,
  };

  return {
    valid: value.length >= 8,
    checks,
    message: PASSWORD_POLICY_MESSAGE,
  };
}

function generateStrongPassword() {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const number = '23456789';
  const symbol = '!@#$%&*?';
  const all = `${upper}${lower}${number}${symbol}`;
  const pick = (chars) => chars[Math.floor(Math.random() * chars.length)];
  const required = [pick(upper), pick(lower), pick(number), pick(symbol)];

  while (required.length < 14) required.push(pick(all));

  return required
    .sort(() => Math.random() - 0.5)
    .join('');
}

module.exports = {
  PASSWORD_POLICY_MESSAGE,
  validatePassword,
  generateStrongPassword,
};