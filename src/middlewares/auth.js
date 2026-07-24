const jwt = require('jsonwebtoken');

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizeId(value) {
  return value ? String(value) : '';
}

async function resolveAuthenticatedUser(decoded) {
  const email = normalizeEmail(decoded.email);
  const { getIsConnected } = require('../config/db');
  const User = require('../models/User');
  const Company = require('../models/Company');
  const Employee = require('../models/Employee');
  const { fallbackUsers, fallbackCompanies } = require('../utils/fallbackStore');

  if (!email) return null;

  if (decoded.role === 'Super Admin') {
    return {
      email,
      name: decoded.name || email,
      role: 'Super Admin',
      companyId: '',
      org: decoded.org || 'System Admin',
      id: normalizeId(decoded.id || decoded.userId || 'super_admin_id'),
    };
  }

  if (getIsConnected()) {
    const user = await User.findOne({ email }).setOptions({ bypassTenant: true });
    if (user) {
      if (user.status === 'Suspended') return null;
      return {
        email,
        name: user.name || decoded.name || email,
        role: user.role || decoded.role || 'Employee',
        companyId: normalizeId(user.companyId || decoded.companyId),
        org: user.org || decoded.org || '',
        id: normalizeId(user._id),
      };
    }

    const employee = await Employee.findOne({ email }).setOptions({ bypassTenant: true });
    if (employee) {
      return {
        email,
        name: employee.name || decoded.name || email,
        role: employee.role || decoded.role || 'Employee',
        companyId: normalizeId(employee.companyId || decoded.companyId),
        org: employee.org || decoded.org || '',
        id: normalizeId(employee._id),
      };
    }

    const company = await Company.findOne({ admin: email, isDeleted: { $ne: true } });
    if (company) {
      return {
        email,
        name: company.adminName || decoded.name || email,
        role: 'Company Admin',
        companyId: normalizeId(company._id),
        org: company.name || decoded.org || '',
        id: normalizeId(company._id),
      };
    }

    return null;
  }

  const fallbackUser = fallbackUsers.find((user) => normalizeEmail(user.email) === email);
  if (fallbackUser) {
    if (fallbackUser.status === 'Suspended') return null;
    return {
      email,
      name: fallbackUser.name || decoded.name || email,
      role: fallbackUser.role || decoded.role || 'Employee',
      companyId: normalizeId(fallbackUser.companyId || decoded.companyId),
      org: fallbackUser.org || decoded.org || '',
      id: normalizeId(fallbackUser._id || fallbackUser.id),
    };
  }

  const fallbackCompany = fallbackCompanies.find(
    (company) => normalizeEmail(company.admin) === email && company.isDeleted !== true
  );
  if (fallbackCompany) {
    return {
      email,
      name: fallbackCompany.adminName || decoded.name || email,
      role: 'Company Admin',
      companyId: normalizeId(fallbackCompany._id || fallbackCompany.id),
      org: fallbackCompany.name || decoded.org || '',
      id: normalizeId(fallbackCompany._id || fallbackCompany.id),
    };
  }

  if (decoded.role && (decoded.companyId || decoded.role === 'Super Admin')) {
    return {
      email,
      name: decoded.name || email,
      role: decoded.role,
      companyId: normalizeId(decoded.companyId),
      org: decoded.org || '',
      id: normalizeId(decoded.id || decoded.userId),
    };
  }

  return null;
}

async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ success: false, message: 'Authorization header is missing.' });
  }

  const [scheme, token] = authHeader.split(' ');
  if (scheme !== 'Bearer' || !token || token === 'null' || token === 'undefined') {
    return res.status(401).json({ success: false, message: 'Bearer token is missing.' });
  }

  try {
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET || 'duskra_secret_key_123');
    } catch (jwtErr) {
      try {
        decoded = jwt.verify(token, process.env.JWT_SECRET || 'syncra_secret_key_123');
      } catch (jwtErr2) {
        decoded = jwt.verify(token, process.env.JWT_SECRET || 'bloombiz_secret_key_123');
      }
    }
    let resolved;

    try {
      resolved = await resolveAuthenticatedUser(decoded);
    } catch (dbErr) {
      console.error('Error verifying user in authMiddleware:', dbErr.message);
      resolved = decoded.email
        ? {
            email: normalizeEmail(decoded.email),
            name: decoded.name || normalizeEmail(decoded.email),
            role: decoded.role || 'Employee',
            companyId: normalizeId(decoded.companyId),
            org: decoded.org || '',
            id: normalizeId(decoded.id || decoded.userId),
          }
        : null;
    }

    if (!resolved) {
      return res.status(401).json({ success: false, message: 'User account has been deleted, disabled, or was not found.' });
    }

    req.user = {
      ...decoded,
      ...resolved,
      companyId: normalizeId(resolved.companyId || decoded.companyId),
    };

    const { tenantStorage } = require('../utils/tenantPlugin');
    tenantStorage.run(req.user.companyId, () => {
      next();
    });
  } catch (err) {
    return res.status(403).json({ success: false, message: 'Invalid or expired authentication token.' });
  }
}

module.exports = authMiddleware;