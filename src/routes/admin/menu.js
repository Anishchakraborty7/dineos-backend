const express = require('express');
const router = express.Router();
const pool = require('../../db/pool');
const apiKeyAuth = require('../../middleware/apiKeyAuth');
const adminAuth = require('../../middleware/adminAuth');
const { success, error, paginated } = require('../../utils/response');

router.use(apiKeyAuth);
router.use(adminAuth(['owner', 'manager']));

// GET /admin/menu/categories
router.get('/categories', async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT c.*, COUNT(i.item_id) AS item_count
       FROM menu_categories c
       LEFT JOIN menu_items i ON c.category_id = i.category_id
       WHERE c.restaurant_id = $1
       GROUP BY c.category_id
       ORDER BY c.sort_order, c.name`,
      [req.restaurant.id]
    );
    return success(res, r.rows);
  } catch (err) { console.error(err); return error(res, 'Failed to fetch categories.'); }
});

// POST /admin/menu/categories
router.post('/categories', async (req, res) => {
  const { name, description, image_url, sort_order = 0 } = req.body;
  if (!name) return error(res, 'Category name required.', 400);
  try {
    const r = await pool.query(
      `INSERT INTO menu_categories (restaurant_id, name, description, image_url, sort_order) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.restaurant.id, name.trim(), description || null, image_url || null, sort_order]
    );
    return success(res, r.rows[0], 'Category created.', 201);
  } catch (err) { console.error(err); return error(res, 'Failed to create category.'); }
});

// PATCH /admin/menu/categories/:id
router.patch('/categories/:id', async (req, res) => {
  const { name, description, image_url, sort_order, is_active } = req.body;
  const fields = []; const params = []; let i = 1;
  if (name !== undefined)       { fields.push(`name=$${i++}`);        params.push(name.trim()); }
  if (description !== undefined){ fields.push(`description=$${i++}`); params.push(description); }
  if (image_url !== undefined)  { fields.push(`image_url=$${i++}`);   params.push(image_url); }
  if (sort_order !== undefined) { fields.push(`sort_order=$${i++}`);  params.push(sort_order); }
  if (is_active !== undefined)  { fields.push(`is_active=$${i++}`);   params.push(is_active); }
  if (!fields.length) return error(res, 'No fields to update.', 400);
  params.push(req.params.id, req.restaurant.id);
  try {
    const r = await pool.query(`UPDATE menu_categories SET ${fields.join(',')} WHERE category_id=$${i} AND restaurant_id=$${i+1} RETURNING *`, params);
    if (!r.rows.length) return error(res, 'Category not found.', 404);
    return success(res, r.rows[0]);
  } catch (err) { console.error(err); return error(res, 'Failed to update category.'); }
});

// DELETE /admin/menu/categories/:id
router.delete('/categories/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM menu_categories WHERE category_id=$1 AND restaurant_id=$2', [req.params.id, req.restaurant.id]);
    return success(res, null, 'Category deleted.');
  } catch (err) { console.error(err); return error(res, 'Failed to delete category.'); }
});

// GET /admin/menu/items
router.get('/items', async (req, res) => {
  const { category_id, search, available } = req.query;
  const conds = ['i.restaurant_id=$1']; const params = [req.restaurant.id]; let idx = 2;
  if (category_id) { conds.push(`i.category_id=$${idx++}`); params.push(category_id); }
  if (search)      { conds.push(`i.name ILIKE $${idx++}`);  params.push(`%${search}%`); }
  if (available !== undefined) { conds.push(`i.is_available=$${idx++}`); params.push(available === 'true'); }
  try {
    const r = await pool.query(
      `SELECT i.*, c.name AS category_name
       FROM menu_items i
       LEFT JOIN menu_categories c ON i.category_id = c.category_id
       WHERE ${conds.join(' AND ')} ORDER BY c.sort_order, i.sort_order, i.name`,
      params
    );
    return success(res, r.rows);
  } catch (err) { console.error(err); return error(res, 'Failed to fetch items.'); }
});

// POST /admin/menu/items
router.post('/items', async (req, res) => {
  const { name, description, price, category_id, image_url, is_veg = true, sort_order = 0, is_featured = false } = req.body;
  if (!name || price === undefined) return error(res, 'Name and price required.', 400);
  try {
    const r = await pool.query(
      `INSERT INTO menu_items (restaurant_id, category_id, name, description, price, image_url, is_veg, sort_order, is_featured)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.restaurant.id, category_id || null, name.trim(), description || null, price, image_url || null, is_veg, sort_order, is_featured]
    );
    return success(res, r.rows[0], 'Item created.', 201);
  } catch (err) { console.error(err); return error(res, 'Failed to create item.'); }
});

// PATCH /admin/menu/items/:id
router.patch('/items/:id', async (req, res) => {
  const allowed = ['name','description','price','category_id','image_url','is_veg','is_available','is_featured','sort_order'];
  const fields = []; const params = []; let i = 1;
  for (const k of allowed) if (req.body[k] !== undefined) { fields.push(`${k}=$${i++}`); params.push(req.body[k]); }
  if (!fields.length) return error(res, 'No fields to update.', 400);
  fields.push(`updated_at=NOW()`);
  params.push(req.params.id, req.restaurant.id);
  try {
    const r = await pool.query(
      `UPDATE menu_items SET ${fields.join(',')} WHERE item_id=$${i} AND restaurant_id=$${i+1} RETURNING *`,
      params
    );
    if (!r.rows.length) return error(res, 'Item not found.', 404);
    return success(res, r.rows[0]);
  } catch (err) { console.error(err); return error(res, 'Failed to update item.'); }
});

// DELETE /admin/menu/items/:id
router.delete('/items/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM menu_items WHERE item_id=$1 AND restaurant_id=$2', [req.params.id, req.restaurant.id]);
    return success(res, null, 'Item deleted.');
  } catch (err) { console.error(err); return error(res, 'Failed to delete item.'); }
});

module.exports = router;
