const express = require('express');
const router = express.Router();
const pool = require('../../db/pool');
const apiKeyAuth   = require('../../middleware/apiKeyAuth');
const customerAuth = require('../../middleware/customerAuth');
const { success, error } = require('../../utils/response');

router.use(apiKeyAuth);

// POST /v1/reservations   — make a booking
router.post('/', async (req, res) => {
  const { guest_name, guest_phone, guest_email, party_size=2, reservation_date, reservation_time, occasion, special_requests } = req.body;
  if (!guest_name || !guest_phone || !reservation_date || !reservation_time) {
    return error(res, 'Name, phone, date and time are required.', 400);
  }

  const authHeader = req.headers.authorization;
  let customerId = null;
  if (authHeader) {
    try {
      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
      if (decoded.restaurant_id === req.restaurant.id) customerId = decoded.customer_id;
    } catch { /* guest booking */ }
  }

  try {
    const r = await pool.query(
      `INSERT INTO reservations (restaurant_id,customer_id,guest_name,guest_phone,guest_email,party_size,reservation_date,reservation_time,occasion,special_requests)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [req.restaurant.id, customerId, guest_name.trim(), guest_phone.trim(), guest_email||null, party_size, reservation_date, reservation_time, occasion||null, special_requests||null]
    );
    return success(res, r.rows[0], 'Reservation submitted! We will confirm shortly.', 201);
  } catch (err) { console.error(err); return error(res, 'Failed to create reservation.'); }
});

// GET /v1/reservations/my  — customer's reservations
router.get('/my', customerAuth, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT rv.*, t.table_number FROM reservations rv LEFT JOIN restaurant_tables t ON rv.table_id=t.table_id
       WHERE rv.customer_id=$1 AND rv.restaurant_id=$2 ORDER BY rv.reservation_date DESC,rv.reservation_time DESC LIMIT 20`,
      [req.customer.customer_id, req.restaurant.id]
    );
    return success(res, r.rows);
  } catch (err) { console.error(err); return error(res, 'Failed to fetch reservations.'); }
});

// GET /v1/reservations/availability?date=&party_size=
router.get('/availability', async (req, res) => {
  const { date, party_size=2 } = req.query;
  if (!date) return error(res,'Date required.',400);
  try {
    const r = await pool.query(
      `SELECT t.table_id, t.table_number, t.capacity, t.location
       FROM restaurant_tables t
       WHERE t.restaurant_id=$1 AND t.is_active=true AND t.capacity>=$2
       AND t.table_id NOT IN (
         SELECT rv.table_id FROM reservations rv
         WHERE rv.restaurant_id=$1 AND rv.reservation_date=$3 AND rv.status IN ('confirmed','pending') AND rv.table_id IS NOT NULL
       )
       ORDER BY t.capacity`,
      [req.restaurant.id, party_size, date]
    );
    return success(res, { tables: r.rows, date, party_size });
  } catch (err) { console.error(err); return error(res,'Failed to check availability.'); }
});

module.exports = router;
