const jwt = require('jsonwebtoken');
const { error } = require('../utils/response');

/**
 * Middleware factory: Validates JWT for restaurant staff or customers.
 *
 * Usage:
 *   router.get('/orders', apiKeyAuth, jwtAuth(['owner', 'manager']), handler)
 *   router.post('/place-order', apiKeyAuth, jwtAuth(['customer']), handler)
 *
 * @param {string[]} roles - Allowed roles. Empty array = any authenticated user.
 */
const jwtAuth = (roles = []) => {
  return (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return error(res, 'Authorization token required.', 401);
    }

    const token = authHeader.split(' ')[1];

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded;

      // Role check
      if (roles.length > 0 && !roles.includes(decoded.role)) {
        return error(
          res,
          `Access denied. Required roles: ${roles.join(', ')}`,
          403
        );
      }

      // Cross-tenant safety: ensure token belongs to this restaurant
      if (req.restaurant && decoded.restaurant_id !== req.restaurant.restaurant_id) {
        return error(res, 'Token does not match this restaurant.', 403);
      }

      next();
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return error(res, 'Session expired. Please login again.', 401);
      }
      return error(res, 'Invalid token.', 401);
    }
  };
};

module.exports = jwtAuth;
