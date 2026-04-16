const pool = require('../db/pool');
const { error } = require('../utils/response');

/**
 * Middleware: Validates X-API-Key header → resolves restaurant → injects req.restaurant.
 *
 * The DB uses restaurants.id (integer) as the primary key.
 * restaurants.restaurant_id (UUID) is also available as a globally unique identifier.
 *
 * All FK relationships in new tables (restaurant_users, menu_items, etc.)
 * reference restaurants(id) as an integer.
 *
 * req.restaurant = { id, restaurant_id, name, plan, is_active }
 */
const apiKeyAuth = async (req, res, next) => {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    return error(res, 'Missing X-API-Key header. Include it as X-API-Key in your request.', 401);
  }

  if (!apiKey.startsWith('rk_live_')) {
    return error(res, 'Invalid API key format.', 401);
  }

  try {
    const result = await pool.query(
      `SELECT id, restaurant_id, name, is_active, plan
       FROM restaurants
       WHERE api_key = $1`,
      [apiKey]
    );

    if (result.rows.length === 0) {
      return error(res, 'Invalid API key. Please check your credentials.', 401);
    }

    const restaurant = result.rows[0];

    if (!restaurant.is_active) {
      return error(res, 'This restaurant account is suspended. Contact DineOS support.', 403);
    }

    // Inject full tenant context
    req.restaurant = {
      id:            restaurant.id,            // integer PK — used in all FK queries
      restaurant_id: restaurant.restaurant_id, // UUID — used in JWTs and public references
      name:          restaurant.name,
      plan:          restaurant.plan
    };

    next();
  } catch (err) {
    console.error('apiKeyAuth error:', err.message);
    return error(res, 'Authentication service unavailable.', 500);
  }
};

module.exports = apiKeyAuth;
