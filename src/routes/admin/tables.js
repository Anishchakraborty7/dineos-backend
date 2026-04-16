const express = require('express');
const router = express.Router();
const pool = require('../../db/pool');
const apiKeyAuth = require('../../middleware/apiKeyAuth');
const adminAuth = require('../../middleware/adminAuth');
const { success, error } = require('../../utils/response');

router.use(apiKeyAuth);
router.use(adminAuth(['owner', 'manager']));

router.get('/', async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT t.*, (SELECT COUNT(*) FROM reservations rv WHERE rv.table_id=t.table_id AND rv.reservation_date=CURRENT_DATE AND rv.status IN ('pending','confirmed')) AS today_reservations
       FROM restaurant_tables t WHERE t.restaurant_id=$1 ORDER BY t.table_number`,
      [req.restaurant.id]
    );
    return success(res, r.rows);
  } catch (err) { console.error(err); return error(res,'Failed to fetch tables.'); }
});

router.post('/', async (req, res) => {
  const { table_number, capacity=4, location } = req.body;
  if (!table_number) return error(res,'Table number required.',400);
  try {
    const r = await pool.query(
      `INSERT INTO restaurant_tables (restaurant_id,table_number,capacity,location) VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.restaurant.id, table_number.trim(), capacity, location||null]
    );
    return success(res, r.rows[0], 'Table added.', 201);
  } catch (err) {
    if (err.code==='23505') return error(res,'Table number already exists.',409);
    console.error(err); return error(res,'Failed to add table.');
  }
});

router.patch('/:id', async (req, res) => {
  const { table_number, capacity, location, status, is_active } = req.body;
  const f=[],p=[]; let i=1;
  if (table_number!==undefined){f.push(`table_number=$${i++}`);p.push(table_number.trim());}
  if (capacity!==undefined)    {f.push(`capacity=$${i++}`);    p.push(capacity);}
  if (location!==undefined)    {f.push(`location=$${i++}`);    p.push(location);}
  if (status!==undefined)      {f.push(`status=$${i++}`);      p.push(status);}
  if (is_active!==undefined)   {f.push(`is_active=$${i++}`);   p.push(is_active);}
  if (!f.length) return error(res,'No fields to update.',400);
  p.push(req.params.id, req.restaurant.id);
  try {
    const r = await pool.query(`UPDATE restaurant_tables SET ${f.join(',')} WHERE table_id=$${i} AND restaurant_id=$${i+1} RETURNING *`, p);
    if (!r.rows.length) return error(res,'Table not found.',404);
    return success(res, r.rows[0]);
  } catch (err) { console.error(err); return error(res,'Failed to update table.'); }
});

router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM restaurant_tables WHERE table_id=$1 AND restaurant_id=$2',[req.params.id,req.restaurant.id]);
    return success(res, null,'Table deleted.');
  } catch (err) { console.error(err); return error(res,'Failed to delete table.'); }
});

module.exports = router;
