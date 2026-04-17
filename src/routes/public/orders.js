const express = require('express');
const router = express.Router();
const pool = require('../../db/pool');
const apiKeyAuth   = require('../../middleware/apiKeyAuth');
const customerAuth = require('../../middleware/customerAuth');
const { success, error, paginated } = require('../../utils/response');

router.use(apiKeyAuth);

// POST /v1/orders   — place order (auth optional)
router.post('/', async (req, res) => {
  const { items, order_type = 'delivery', table_number, delivery_address, customer_notes, payment_method = 'cod' } = req.body;
  if (!items?.length) return error(res, 'Order must have at least one item.', 400);

  const authHeader = req.headers.authorization;
  let customerId = null;

  if (authHeader) {
    try {
      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
      if (decoded.restaurant_id === req.restaurant.id) customerId = decoded.customer_id;
    } catch { /* guest order */ }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const ids = items.map(i => i.item_id);
    const menuRes = await client.query(
      `SELECT item_id::text, name, price FROM menu_items WHERE item_id::text = ANY($1) AND restaurant_id=$2 AND is_available=true`,
      [ids, req.restaurant.id]
    );
    const map = {}; menuRes.rows.forEach(m => { map[m.item_id] = m; });

    let subtotal = 0;
    const orderItems = items.map(i => {
      const m = map[String(i.item_id)];
      if (!m) throw new Error(`Item "${i.item_id}" unavailable or not found.`);
      const total = parseFloat(m.price) * i.quantity;
      subtotal += total;
      return { item_id: i.item_id, item_name: m.name, item_price: m.price, quantity: i.quantity, total_price: total };
    });

    const tax = parseFloat((subtotal * 0.05).toFixed(2));
    const delivery_fee = order_type === 'delivery' ? 30 : 0;
    const total = subtotal + tax + delivery_fee;

    const numRes = await client.query(`SELECT COALESCE(MAX(order_number),0)+1 AS next FROM orders_v2 WHERE restaurant_id=$1`, [req.restaurant.id]);

    const ord = await client.query(
      `INSERT INTO orders_v2 (restaurant_id,customer_id,order_number,order_type,status,table_number,subtotal,tax_amount,delivery_fee,total_amount,customer_notes,delivery_address,payment_method)
       VALUES ($1,$2,$3,$4,'pending',$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [req.restaurant.id, customerId, numRes.rows[0].next, order_type, table_number||null, subtotal, tax, delivery_fee, total, customer_notes||null, delivery_address||null, payment_method]
    );

    for (const oi of orderItems) {
      await client.query(
        `INSERT INTO order_items_v2 (order_id,item_id,item_name,item_price,quantity,total_price) VALUES ($1,$2,$3,$4,$5,$6)`,
        [ord.rows[0].order_id, oi.item_id, oi.item_name, oi.item_price, oi.quantity, oi.total_price]
      );
    }

    await client.query('COMMIT');
    return success(res, { ...ord.rows[0], items: orderItems }, 'Order placed!', 201);
  } catch (err) {
    await client.query('ROLLBACK');
    return error(res, err.message || 'Failed to place order.');
  } finally { client.release(); }
});

// GET /v1/orders/my  — customer's own orders (auth required)
router.get('/my', customerAuth, async (req, res) => {
  const { page=1, limit=20 } = req.query;
  const offset = (page-1)*limit;
  try {
    const r = await pool.query(
      `SELECT o.*, COALESCE(
         json_agg(json_build_object('item_name',oi.item_name,'quantity',oi.quantity,'total_price',oi.total_price))
         FILTER (WHERE oi.order_item_id IS NOT NULL), '[]'
       ) AS items
       FROM orders_v2 o LEFT JOIN order_items_v2 oi ON o.order_id=oi.order_id
       WHERE o.customer_id=$1 AND o.restaurant_id=$2
       GROUP BY o.order_id ORDER BY o.created_at DESC LIMIT $3 OFFSET $4`,
      [req.customer.customer_id, req.restaurant.id, parseInt(limit), offset]
    );
    return success(res, { orders: r.rows });
  } catch (err) { console.error(err); return error(res,'Failed to fetch orders.'); }
});

// GET /v1/orders/:id/track
router.get('/:id/track', async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT order_id, order_number, status, order_type, total_amount, estimated_time, created_at, updated_at FROM orders_v2 WHERE order_id=$1 AND restaurant_id=$2`,
      [req.params.id, req.restaurant.id]
    );
    if (!r.rows.length) return error(res,'Order not found.',404);
    return success(res, r.rows[0]);
  } catch (err) { console.error(err); return error(res,'Failed to track order.'); }
});

module.exports = router;
