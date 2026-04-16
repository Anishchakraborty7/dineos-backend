const express = require('express');
const router = express.Router();
const pool = require('../../db/pool');
const apiKeyAuth = require('../../middleware/apiKeyAuth');
const adminAuth = require('../../middleware/adminAuth');
const { success, error, paginated } = require('../../utils/response');

router.use(apiKeyAuth);
router.use(adminAuth(['owner', 'manager', 'staff']));

// GET /admin/orders
router.get('/', async (req, res) => {
  const { status, order_type, date, page = 1, limit = 30 } = req.query;
  const offset = (page - 1) * limit;
  const conds = ['o.restaurant_id=$1']; const params = [req.restaurant.id]; let idx = 2;
  if (status)     { conds.push(`o.status=$${idx++}`);            params.push(status); }
  if (order_type) { conds.push(`o.order_type=$${idx++}`);        params.push(order_type); }
  if (date)       { conds.push(`DATE(o.created_at)=$${idx++}`);  params.push(date); }
  const where = conds.join(' AND ');
  try {
    const [cnt, data] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM orders_v2 o WHERE ${where}`, params),
      pool.query(
        `SELECT o.*,
                c.name AS customer_name, c.phone AS customer_phone,
                COALESCE(json_agg(json_build_object('item_name',oi.item_name,'quantity',oi.quantity,'item_price',oi.item_price,'total_price',oi.total_price))
                  FILTER (WHERE oi.order_item_id IS NOT NULL),'[]') AS items
         FROM orders_v2 o
         LEFT JOIN customers c ON o.customer_id = c.customer_id
         LEFT JOIN order_items_v2 oi ON o.order_id = oi.order_id
         WHERE ${where}
         GROUP BY o.order_id, c.name, c.phone
         ORDER BY o.created_at DESC
         LIMIT $${idx} OFFSET $${idx+1}`,
        [...params, parseInt(limit), offset]
      )
    ]);
    return paginated(res, data.rows, cnt.rows[0].count, page, limit);
  } catch (err) { console.error(err); return error(res, 'Failed to fetch orders.'); }
});

// GET /admin/orders/:id
router.get('/:id', async (req, res) => {
  try {
    const o = await pool.query(
      `SELECT o.*, c.name AS customer_name, c.phone AS customer_phone
       FROM orders_v2 o LEFT JOIN customers c ON o.customer_id = c.customer_id
       WHERE o.order_id=$1 AND o.restaurant_id=$2`,
      [req.params.id, req.restaurant.id]
    );
    if (!o.rows.length) return error(res, 'Order not found.', 404);
    const items = await pool.query('SELECT * FROM order_items_v2 WHERE order_id=$1', [req.params.id]);
    return success(res, { ...o.rows[0], items: items.rows });
  } catch (err) { console.error(err); return error(res, 'Failed to fetch order.'); }
});

// PATCH /admin/orders/:id/status
router.patch('/:id/status', async (req, res) => {
  const { status, estimated_time } = req.body;
  const valid = ['confirmed','preparing','ready','out_for_delivery','delivered','cancelled'];
  if (!valid.includes(status)) return error(res, `Status must be one of: ${valid.join(', ')}`, 400);
  const fields = ['status=$1', 'updated_at=NOW()']; const params = [status]; let i = 2;
  if (estimated_time !== undefined) { fields.push(`estimated_time=$${i++}`); params.push(estimated_time); }
  params.push(req.params.id, req.restaurant.id);
  try {
    const r = await pool.query(
      `UPDATE orders_v2 SET ${fields.join(',')} WHERE order_id=$${i} AND restaurant_id=$${i+1} RETURNING *`,
      params
    );
    if (!r.rows.length) return error(res, 'Order not found.', 404);
    return success(res, r.rows[0], `Order updated to: ${status}`);
  } catch (err) { console.error(err); return error(res, 'Failed to update order.'); }
});

// POST /admin/orders — POS / manual order
router.post('/', adminAuth(['owner', 'manager']), async (req, res) => {
  const { items, order_type = 'dine_in', table_number, notes } = req.body;
  if (!items?.length) return error(res, 'Order must have at least one item.', 400);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ids = items.map(i => i.item_id);
    const menuRes = await client.query(
      `SELECT item_id, name, price FROM menu_items WHERE item_id = ANY($1::uuid[]) AND restaurant_id=$2 AND is_available=true`,
      [ids, req.restaurant.id]
    );
    const map = {}; menuRes.rows.forEach(m => { map[m.item_id] = m; });
    let subtotal = 0;
    const orderItems = items.map(i => {
      const m = map[i.item_id]; if (!m) throw new Error(`Item ${i.item_id} not found.`);
      const total = m.price * i.quantity; subtotal += total;
      return { item_id: m.item_id, item_name: m.name, item_price: m.price, quantity: i.quantity, total_price: total };
    });
    const tax = parseFloat((subtotal * 0.05).toFixed(2));
    const numRes = await client.query(`SELECT COALESCE(MAX(order_number),0)+1 AS next FROM orders_v2 WHERE restaurant_id=$1`, [req.restaurant.id]);
    const ord = await client.query(
      `INSERT INTO orders_v2 (restaurant_id,order_number,order_type,status,table_number,subtotal,tax_amount,total_amount,customer_notes,payment_method)
       VALUES ($1,$2,$3,'confirmed',$4,$5,$6,$7,$8,'cod') RETURNING *`,
      [req.restaurant.id, numRes.rows[0].next, order_type, table_number||null, subtotal, tax, subtotal+tax, notes||null]
    );
    for (const oi of orderItems) {
      await client.query(
        `INSERT INTO order_items_v2 (order_id,item_id,item_name,item_price,quantity,total_price) VALUES ($1,$2,$3,$4,$5,$6)`,
        [ord.rows[0].order_id, oi.item_id, oi.item_name, oi.item_price, oi.quantity, oi.total_price]
      );
    }
    await client.query('COMMIT');
    return success(res, { ...ord.rows[0], items: orderItems }, 'Order created.', 201);
  } catch (err) {
    await client.query('ROLLBACK');
    return error(res, err.message || 'Failed to create order.');
  } finally { client.release(); }
});

module.exports = router;
