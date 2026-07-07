function stripTrailingSlash(value = '') {
  return String(value || '').trim().replace(/\/+$/, '');
}

function isLocalUrl(value = '') {
  return /localhost|127\.0\.0\.1|\[::1\]/i.test(value);
}

function readOriginFromRequest(req) {
  const origin = req?.headers?.origin;
  if (origin) return stripTrailingSlash(origin);

  const referer = req?.headers?.referer || req?.headers?.referrer;
  if (referer) {
    try {
      const parsed = new URL(referer);
      return stripTrailingSlash(parsed.origin);
    } catch {
      return '';
    }
  }

  return '';
}

function getFrontendBaseUrl(req) {
  const configured = stripTrailingSlash(
    process.env.FRONTEND_URL ||
    process.env.PUBLIC_FRONTEND_URL ||
    process.env.APP_URL ||
    ''
  );

  if (configured && !isLocalUrl(configured)) return configured;

  const requestOrigin = readOriginFromRequest(req);
  if (requestOrigin && !isLocalUrl(requestOrigin)) return requestOrigin;

  return configured || requestOrigin || 'http://localhost:5173';
}

function getEmployeePortalUrl(req) {
  return `${getFrontendBaseUrl(req)}/employee-portal`;
}

function normalizeProvidedPortalUrl(req, providedUrl, role) {
  const provided = stripTrailingSlash(providedUrl || '');
  if (provided && !isLocalUrl(provided)) return provided;

  const baseUrl = getFrontendBaseUrl(req);
  const isLead = role === 'Project Lead' || role === 'project_lead';
  return isLead ? baseUrl : `${baseUrl}/employee-portal`;
}

module.exports = {
  getFrontendBaseUrl,
  getEmployeePortalUrl,
  normalizeProvidedPortalUrl,
};