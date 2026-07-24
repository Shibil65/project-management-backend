function validateSubscriptionPackage(req, res, next) {
  let { name, price, limits } = req.body;
  
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ success: false, message: 'Package Title / Name is required.' });
  }
  
  const numPrice = Number(price);
  if (price === undefined || price === null || isNaN(numPrice) || numPrice < 0) {
    return res.status(400).json({ success: false, message: 'Pricing Rate is required and must be a non-negative number.' });
  }
  req.body.price = numPrice;

  if (limits && typeof limits === 'object') {
    if (limits.maxProjects !== undefined && limits.maxProjects !== null && limits.maxProjects !== '') {
      const numProj = Number(limits.maxProjects);
      if (isNaN(numProj) || numProj < 0) {
        return res.status(400).json({ success: false, message: 'Max Projects limit must be a non-negative number.' });
      }
      limits.maxProjects = numProj;
    }
    if (limits.maxEmployees !== undefined && limits.maxEmployees !== null && limits.maxEmployees !== '') {
      const numEmp = Number(limits.maxEmployees);
      if (isNaN(numEmp) || numEmp < 0) {
        return res.status(400).json({ success: false, message: 'Max Employee seats limit must be a non-negative number.' });
      }
      limits.maxEmployees = numEmp;
    }
    if (limits.maxClients !== undefined && limits.maxClients !== null && limits.maxClients !== '') {
      const numCli = Number(limits.maxClients);
      if (isNaN(numCli) || numCli < 0) {
        return res.status(400).json({ success: false, message: 'Max Clients limit must be a non-negative number.' });
      }
      limits.maxClients = numCli;
    }
    if (limits.storageGB !== undefined && limits.storageGB !== null && limits.storageGB !== '') {
      const numStor = Number(limits.storageGB);
      if (isNaN(numStor) || numStor < 0) {
        return res.status(400).json({ success: false, message: 'Storage size limit must be a non-negative number.' });
      }
      limits.storageGB = numStor;
    }
  }

  next();
}

module.exports = {
  validateSubscriptionPackage
};

