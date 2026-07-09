function validateSubscriptionPackage(req, res, next) {
  const { name, price, limits } = req.body;
  
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ success: false, message: 'Package Title / Name is required.' });
  }
  
  if (price === undefined || typeof price !== 'number' || price < 0) {
    return res.status(400).json({ success: false, message: 'Pricing Rate is required and must be a non-negative number.' });
  }

  if (limits) {
    if (limits.maxProjects !== undefined && (typeof limits.maxProjects !== 'number' || limits.maxProjects < 1)) {
      return res.status(400).json({ success: false, message: 'Max Projects limit must be a positive number.' });
    }
    if (limits.maxEmployees !== undefined && (typeof limits.maxEmployees !== 'number' || limits.maxEmployees < 1)) {
      return res.status(400).json({ success: false, message: 'Max Employee seats limit must be a positive number.' });
    }
  }

  next();
}

module.exports = {
  validateSubscriptionPackage
};
