const express = require('express');
const router = express.Router();
const pool = require('../../db/pool');
const apiKeyAuth = require('../../middleware/apiKeyAuth');
const adminAuth = require('../../middleware/adminAuth');
const { success, error, paginated } = require('../../utils/response');

router.use(apiKeyAuth);
router.use(adminAuth(['owner', 'manager', 'staff']));

// GET /admin/reservations/today  (must be before /:id)
router.get('/today', async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT rv.*, t.table_number FROM reservations rv
       LEFT JOIN restaurant_tables t ON rv.table_id=t.table_id
       WHERE rv.restaurant_id=$1 AND rv.reservation_date=CURRENT_DATE
       ORDER BY rv.reservation_time`,
      [req.restaurant.id]
    );
    return success(res, r.rows);
  } catch (err) { console.error(err); return error(res,'Failed to fetch today reservations.'); }
});

// GET /admin/reservations
router.get('/', async (req, res) => {
  const { date, status, page=1, limit=30 } = req.query;
  const offset = (page-1)*limit;
  const conds = ['rv.restaurant_id=$1']; const params=[req.restaurant.id]; let idx=2;
  if (date)   { conds.push(`rv.reservation_date=$${idx++}`); params.push(date); }
  else        { conds.push(`rv.reservation_date>=CURRENT_DATE`); }
  if (status) { conds.push(`rv.status=$${idx++}`); params.push(status); }
  const where = conds.join(' AND ');
  try {
    const [cnt, data] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM reservations rv WHERE ${where}`, params),
      pool.query(`SELECT rv.*, t.table_number, t.capacity FROM reservations rv LEFT JOIN restaurant_tables t ON rv.table_id=t.table_id
       WHERE ${where} ORDER BY rv.reservation_date,rv.reservation_time LIMIT $${idx} OFFSET $${idx+1}`,
        [...params, parseInt(limit), offset])
    ]);
    return paginated(res, data.rows, cnt.rows[0].count, page, limit);
  } catch (err) { console.error(err); return error(res,'Failed to fetch reservations.'); }
});

// PATCH /admin/reservations/:id
router.patch('/:id', async (req, res) => {
  const { status, table_id, notes, reservation_date, reservation_time } = req.body;
  const f=[],p=[]; let i=1;
  if (status!==undefined)          { f.push(`status=$${i++}`);           p.push(status); }
  if (table_id!==undefined)        { f.push(`table_id=$${i++}`);         p.push(table_id); }
  if (notes!==undefined)           { f.push(`notes=$${i++}`);            p.push(notes); }
  if (reservation_date!==undefined){ f.push(`reservation_date=$${i++}`); p.push(reservation_date); }
  if (reservation_time!==undefined){ f.push(`reservation_time=$${i++}`); p.push(reservation_time); }
  if (!f.length) return error(res,'No fields to update.',400);
  f.push(`updated_at=NOW()`);
  p.push(req.params.id, req.restaurant.id);
  try {
    const r = await pool.query(
      `UPDATE reservations SET ${f.join(',')} WHERE reservation_id=$${i} AND restaurant_id=$${i+1} RETURNING *`, p
    );
    if (!r.rows.length) return error(res,'Reservation not found.',404);
    return success(res, r.rows[0]);
  } catch (err) { console.error(err); return error(res,'Failed to update reservation.'); }
});

module.exports = router;
