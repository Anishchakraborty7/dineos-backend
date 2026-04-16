const jwt = require('jsonwebtoken');
const { error } = require('../utils/response');

/**
 * Middleware: Validates Super Admin JWT token.
 *
 * Uses a separate secret (SUPER_ADMIN_JWT_SECRET) from regular restaurant JWTs,
 * so there is zero risk of a restaurant staff token being used on super admin routes.
 */
const superAdminAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return error(res, 'Super Admin authorization required.', 401);
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.SUPER_ADMIN_JWT_SECRET);

    if (decoded.role !== 'super_admin') {
      return error(res, 'Super Admin access required.', 403);
    }

    req.superAdmin = {
      admin_id: decoded.admin_id,
      name: decoded.name,
      email: decoded.email,
      role: decoded.role
    };

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return error(res, 'Session expired. Please login again.', 401);
    }
    return error(res, 'Invalid or tampered token.', 401);
  }
};

module.exports = superAdminAuth;
