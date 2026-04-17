const express = require('express');
const router = express.Router();
const pool = require('../../db/pool');
const apiKeyAuth = require('../../middleware/apiKeyAuth');
const { success, error } = require('../../utils/response');

router.use(apiKeyAuth);

// GET /v1/menu      — full menu for the mobile app
router.get('/', async (req, res) => {
  try {
    const [cats, items] = await Promise.all([
      pool.query(`SELECT category_id, name, description, image_url, sort_order
                  FROM menu_categories WHERE restaurant_id=$1 AND is_active=true ORDER BY sort_order,name`,
                 [req.restaurant.id]),
      pool.query(`SELECT item_id, category_id, name, description, price, image_url, is_veg, is_featured
                  FROM menu_items WHERE restaurant_id=$1 AND is_available=true ORDER BY sort_order,name`,
                 [req.restaurant.id])
    ]);

    // Group items under their categories
    const grouped = cats.rows.map(cat => ({
      ...cat,
      items: items.rows.filter(i => String(i.category_id) === String(cat.category_id))
    }));

    const uncategorized = items.rows.filter(i => !i.category_id);
    if (uncategorized.length) {
      grouped.push({ category_id: null, name: 'Other', items: uncategorized });
    }

    return success(res, { categories: grouped, total_items: items.rows.length });
  } catch (err) { console.error(err); return error(res, 'Failed to fetch menu.'); }
});

// GET /v1/menu/featured
router.get('/featured', async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT item_id, name, description, price, image_url, is_veg
       FROM menu_items WHERE restaurant_id=$1 AND is_featured=true AND is_available=true ORDER BY name`,
      [req.restaurant.id]
    );
    return success(res, { items: r.rows });
  } catch (err) { console.error(err); return error(res, 'Failed to fetch featured items.'); }
});

// GET /v1/menu/search?q=
router.get('/search', async (req, res) => {
  const { q } = req.query;
  if (!q || q.trim().length < 2) return error(res, 'Search query must be at least 2 characters.', 400);
  try {
    const r = await pool.query(
      `SELECT item_id, name, description, price, image_url, is_veg, category_id
       FROM menu_items WHERE restaurant_id=$1 AND is_available=true
       AND (name ILIKE $2 OR description ILIKE $2) ORDER BY name LIMIT 20`,
      [req.restaurant.id, `%${q.trim()}%`]
    );
    return success(res, { items: r.rows });
  } catch (err) { console.error(err); return error(res, 'Search failed.'); }
});

module.exports = router;
