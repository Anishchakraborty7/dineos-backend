const pool = require('../../config/db');
const crypto = require('crypto');

exports.createRestaurant = async (req, res) => {
  const {
    name,
    plan,
    owner_name,
    owner_email,
    owner_phone,
    address,
    city,
    state,
    pincode,
    primary_color,
    secondary_color,
    tagline,
    notes
  } = req.body;

  const slug = name.toLowerCase().replace(/\s+/g, '-');
  const apiKey = crypto.randomBytes(16).toString('hex');   // ← cleaned

  const result = await pool.query(
    `INSERT INTO restaurants
    (name, slug, api_key, plan,
     owner_name, owner_email, owner_phone,
     address, city, state, pincode,
     primary_color, secondary_color, tagline, notes)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
    RETURNING *`,
    [
      name, slug, apiKey, plan,
      owner_name, owner_email, owner_phone,
      address, city, state, pincode,
      primary_color, secondary_color, tagline, notes
    ]
  );

  res.json(result.rows[0]);
};

exports.getRestaurants = async (req, res) => {
  const { search = '', status, plan, page = 1, limit = 15 } = req.query;

  const offset = (page - 1) * limit;

  let conditions = [];
  let values = [];

  if (search) {
    values.push(`%${search}%`);
    conditions.push(`(name ILIKE $${values.length} OR slug ILIKE $${values.length} OR owner_email ILIKE $${values.length})`);
  }

  if (status && status !== 'all') {
    values.push(status === 'active');
    conditions.push(`is_active = $${values.length}`);
  }

  if (plan && plan !== 'all') {
    values.push(plan.toLowerCase());
    conditions.push(`plan = $${values.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const dataQuery = `
    SELECT * FROM restaurants
    ${where}
    ORDER BY created_at DESC
    LIMIT $${values.length + 1}
    OFFSET $${values.length + 2}
  `;

  const countQuery = `
    SELECT COUNT(*) FROM restaurants
    ${where}
  `;

  const dataResult = await pool.query(dataQuery, [...values, limit, offset]);
  const countResult = await pool.query(countQuery, values);

  res.json({
    data: dataResult.rows,
    pagination: {
      total: parseInt(countResult.rows[0].count),
      pages: Math.ceil(countResult.rows[0].count / limit)
    }
  });
};

exports.getRestaurantById = async (req, res) => {
  const { id } = req.params;

  const result = await pool.query(
    'SELECT * FROM restaurants WHERE id = $1',
    [id]
  );

  const restaurant = result.rows[0];

  if (!restaurant) {
    return res.status(404).json({ error: 'Restaurant not found' });
  }

  const featuresRes = await pool.query(
    'SELECT feature_key, enabled FROM features WHERE restaurant_id = $1',
    [id]
  );

  const features = {};
  featuresRes.rows.forEach(f => {
    features[f.feature_key] = f.enabled;
  });

  res.json({
    ...restaurant,
    features_enabled: features
  });
};

exports.updateRestaurant = async (req, res) => {
  const { id } = req.params;

  const allowed = [
    'name', 'plan', 'is_active',
    'owner_name', 'owner_email',
    'owner_phone', 'address',
    'city', 'state', 'pincode',
    'primary_color', 'secondary_color',
    'tagline', 'notes'
  ];

  const fields = {};
  for (let key of allowed) {
    if (req.body[key] !== undefined) {
      fields[key] = req.body[key];
    }
  }

  const keys = Object.keys(fields);
  if (!keys.length) {
    return res.status(400).json({ error: 'No valid fields provided' });
  }

  const set = keys.map((k, i) => `${k}=$${i+1}`).join(', ');
  const values = Object.values(fields);

  try {
    const result = await pool.query(
      `UPDATE restaurants SET ${set} WHERE id=$${keys.length+1} RETURNING *`,
      [...values, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Restaurant not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("UPDATE ERROR:", err);
    res.status(500).json({ error: 'Failed to update restaurant' });
  }
};

exports.deleteRestaurant = async (req, res) => {
  const { id } = req.params;
  await pool.query(`DELETE FROM restaurants WHERE id=$1`, [id]);
  res.json({ success: true });
};

exports.regenerateApiKey = async (req, res) => {
  const { id } = req.params;
  const newKey = crypto.randomBytes(16).toString('hex');
  const result = await pool.query(
    `UPDATE restaurants SET api_key=$1 WHERE id=$2 RETURNING api_key`,
    [newKey, id]
  );
  res.json({ api_key: result.rows[0].api_key });
};

exports.updateFeature = async (req, res) => {
  const { id } = req.params;
  const { feature, enabled } = req.body;

  const existing = await pool.query(
    `SELECT * FROM features WHERE restaurant_id=$1 AND feature_key=$2`,
    [id, feature]
  );

  if (existing.rows.length > 0) {
    await pool.query(
      `UPDATE features SET enabled=$1 WHERE restaurant_id=$2 AND feature_key=$3`,
      [enabled, id, feature]
    );
  } else {
    await pool.query(
      `INSERT INTO features (restaurant_id, feature_key, enabled)
       VALUES ($1,$2,$3)`,
      [id, feature, enabled]
    );
  }

  res.json({ success: true });
};

// ===================== RESTAURANT OWNER FUNCTIONS (NEW) =====================
exports.getMe = async (req, res) => {
  res.json(req.restaurant);
};

exports.getMenu = async (req, res) => {
  const result = await pool.query(
    `SELECT * FROM menus WHERE restaurant_id = $1 ORDER BY category, name`,
    [req.restaurant_id]
  );
  res.json(result.rows);
};

exports.createMenuItem = async (req, res) => {
  const { name, description, price, category } = req.body;
  const result = await pool.query(
    `INSERT INTO menus (restaurant_id, name, description, price, category)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [req.restaurant_id, name, description, price, category]
  );
  res.json(result.rows[0]);
};

exports.updateMenuItem = async (req, res) => {
  const { id } = req.params;
  const { name, description, price, category, is_available } = req.body;
  const result = await pool.query(
    `UPDATE menus SET name=$1, description=$2, price=$3, category=$4, is_available=$5
     WHERE id=$6 AND restaurant_id=$7 RETURNING *`,
    [name, description, price, category, is_available, id, req.restaurant_id]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Item not found' });
  res.json(result.rows[0]);
};

exports.deleteMenuItem = async (req, res) => {
  const { id } = req.params;
  await pool.query(`DELETE FROM menus WHERE id=$1 AND restaurant_id=$2`, [id, req.restaurant_id]);
  res.json({ success: true });
};

exports.getOrders = async (req, res) => {
  const result = await pool.query(
    `SELECT * FROM orders WHERE restaurant_id = $1 ORDER BY created_at DESC`,
    [req.restaurant_id]
  );
  res.json(result.rows);
};

exports.updateOrderStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const result = await pool.query(
    `UPDATE orders SET status=$1 WHERE id=$2 AND restaurant_id=$3 RETURNING *`,
    [status, id, req.restaurant_id]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Order not found' });
  res.json(result.rows[0]);
};