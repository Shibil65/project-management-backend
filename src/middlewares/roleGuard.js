function leadGuard(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Authentication is required.' });
  }

  const role = req.user.role;
  if (role === 'Project Lead' || role === 'project_lead' || role === 'Company Admin' || role === 'Super Admin') {
    return next();
  }

  return res.status(403).json({ success: false, message: 'Access forbidden: Project Lead, Company Admin, or Super Admin privileges required.' });
}

function adminGuard(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Authentication is required.' });
  }

  const role = req.user.role;
  if (role === 'Company Admin' || role === 'Super Admin') {
    return next();
  }

  return res.status(403).json({ success: false, message: 'Access forbidden: Company Admin or Super Admin privileges required.' });
}

function superAdminGuard(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Authentication is required.' });
  }

  const role = req.user.role;
  if (role === 'Super Admin') {
    return next();
  }

  return res.status(403).json({ success: false, message: 'Access forbidden: Super Admin privileges required.' });
}

module.exports = {
  leadGuard,
  adminGuard,
  superAdminGuard
};
