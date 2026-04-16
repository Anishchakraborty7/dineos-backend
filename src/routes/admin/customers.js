const express = require('express');
const router = express.Router();
const pool = require('../../db/pool');
const apiKeyAuth = require('../../middleware/apiKeyAuth');
const adminAuth = require('../../middleware/adminAuth');
const { success, error, paginated } = require('../../utils/response');

router.use(apiKeyAuth);
router.use(adminAuth(['owner', 'manager']));

router.get('/', async (req, res) => {
  const { search, page=1, limit=30 } = req.query;
  const offset = (page-1)*limit;
  const conds=['c.restaurant_id=$1']; const params=[req.restaurant.id]; let idx=2;
  if (search) { conds.push(`(c.name ILIKE $${idx} OR c.phone ILIKE $${idx} OR c.email ILIKE $${idx})`); params.push(`%${search}%`); idx++; }
  const where = conds.join(' AND ');
  try {
    const [cnt, data] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM customers c WHERE ${where}`, params),
      pool.query(
        `SELECT c.customer_id,c.name,c.phone,c.email,c.address,c.created_at,
                COUNT(o.order_id) AS order_count,
                COALESCE(SUM(o.total_amount) FILTER (WHERE o.status!='cancelled'),0) AS total_spent,
                MAX(o.created_at) AS last_order_at
         FROM customers c LEFT JOIN orders_v2 o ON c.customer_id=o.customer_id
         WHERE ${where}
         GROUP BY c.customer_id ORDER BY last_order_at DESC NULLS LAST
         LIMIT $${idx} OFFSET $${idx+1}`,
        [...params, parseInt(limit), offset]
      )
    ]);
    return paginated(res, data.rows, cnt.rows[0].count, page, limit);
  } catch (err) { console.error(err); return error(res,'Failed to fetch customers.'); }
});

router.get('/:id', async (req, res) => {
  try {
    const [c, o] = await Promise.all([
      pool.query('SELECT * FROM customers WHERE customer_id=$1 AND restaurant_id=$2',[req.params.id, req.restaurant.id]),
      pool.query('SELECT order_id,order_number,order_type,status,total_amount,created_at FROM orders_v2 WHERE customer_id=$1 AND restaurant_id=$2 ORDER BY created_at DESC LIMIT 20',[req.params.id, req.restaurant.id])
    ]);
    if (!c.rows.length) return error(res,'Customer not found.',404);
    return success(res, { ...c.rows[0], orders: o.rows });
  } catch (err) { console.error(err); return error(res,'Failed to fetch customer.'); }
});

module.exports = router;
