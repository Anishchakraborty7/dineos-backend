const pool = require('../config/db');

const tenantAuth = async (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.headers.authorization?.replace('Bearer ', '');
  
  if (!apiKey) {
    return res.status(401).json({ error: 'API key required' });
  }

  try {
    const result = await pool.query(
      `SELECT id, name, slug, is_active FROM restaurants 
       WHERE api_key = $1 AND is_active = true`,
      [apiKey]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid or inactive API key' });
    }

    req.restaurant = result.rows[0];
    req.restaurant_id = result.rows[0].id;
    next();
  } catch (err) {
    res.status(500).json({ error: 'Authentication failed' });
  }
};

module.exports = tenantAuth;