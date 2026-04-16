const jwt = require('jsonwebtoken');
const { error } = require('../utils/response');

/**
 * Middleware: Validates restaurant staff JWT.
 * Compares token's restaurant_id (integer) with req.restaurant.id.
 */
const adminAuth = (roles = []) => {
  return (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return error(res, 'Admin authorization required.', 401);
    }

    const token = authHeader.split(' ')[1];

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Cross-tenant safety: compare integer restaurant ids
      if (decoded.restaurant_id !== req.restaurant.id) {
        return error(res, 'Token does not match this restaurant.', 403);
      }

      if (roles.length > 0 && !roles.includes(decoded.role)) {
        return error(res, `Access denied. Requires role: ${roles.join(' or ')}`, 403);
      }

      req.adminUser = {
        user_id:       decoded.user_id,
        restaurant_id: decoded.restaurant_id,   // integer
        name:          decoded.name,
        email:         decoded.email,
        role:          decoded.role
      };

      next();
    } catch (err) {
      if (err.name === 'TokenExpiredError') return error(res, 'Session expired. Please login again.', 401);
      return error(res, 'Invalid token.', 401);
    }
  };
};

module.exports = adminAuth;
