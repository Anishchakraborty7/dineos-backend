const jwt = require('jsonwebtoken');
const { error } = require('../utils/response');

/**
 * Middleware: Validates customer JWT.
 * Compares token's restaurant_id (integer) with req.restaurant.id.
 */
const customerAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return error(res, 'Customer authorization required.', 401);
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Cross-tenant: integer compare
    if (decoded.restaurant_id !== req.restaurant.id) {
      return error(res, 'Token does not match this restaurant.', 403);
    }

    req.customer = {
      customer_id:   decoded.customer_id,
      restaurant_id: decoded.restaurant_id,   // integer
      phone:         decoded.phone,
      name:          decoded.name
    };

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') return error(res, 'Session expired. Please login again.', 401);
    return error(res, 'Invalid token.', 401);
  }
};

module.exports = customerAuth;
