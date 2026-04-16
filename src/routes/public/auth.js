const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const pool    = require('../../db/pool');
const apiKeyAuth   = require('../../middleware/apiKeyAuth');
const customerAuth = require('../../middleware/customerAuth');
const { success, error } = require('../../utils/response');

router.use(apiKeyAuth);

// POST /v1/auth/signup
router.post('/signup', async (req, res) => {
  const { phone, name, email, password } = req.body;
  if (!phone || !password) return error(res, 'Phone and password are required.', 400);

  try {
    const existing = await pool.query('SELECT customer_id FROM customers WHERE restaurant_id=$1 AND phone=$2', [req.restaurant.id, phone]);
    if (existing.rows.length) return error(res, 'This phone number is already registered.', 409);

    const hash = await bcrypt.hash(password, 12);
    const r = await pool.query(
      `INSERT INTO customers (restaurant_id, phone, name, email, password_hash) VALUES ($1,$2,$3,$4,$5) RETURNING customer_id, name, phone, email, created_at`,
      [req.restaurant.id, phone.trim(), name?.trim() || null, email?.toLowerCase().trim() || null, hash]
    );
    const customer = r.rows[0];
    const token = jwt.sign(
      { customer_id: customer.customer_id, restaurant_id: req.restaurant.id, phone: customer.phone, name: customer.name },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );
    return success(res, { token, customer }, 'Account created!', 201);
  } catch (err) {
    if (err.code === '23505') return error(res, 'Phone number already registered.', 409);
    console.error(err); return error(res, 'Signup failed.');
  }
});

// POST /v1/auth/login
router.post('/login', async (req, res) => {
  const { phone, password } = req.body;
  if (!phone || !password) return error(res, 'Phone and password are required.', 400);

  try {
    const r = await pool.query(
      'SELECT customer_id, name, phone, email, password_hash FROM customers WHERE restaurant_id=$1 AND phone=$2 AND is_active=true',
      [req.restaurant.id, phone.trim()]
    );
    if (!r.rows.length) return error(res, 'Invalid phone or password.', 401);

    const customer = r.rows[0];
    const valid = await bcrypt.compare(password, customer.password_hash);
    if (!valid) return error(res, 'Invalid phone or password.', 401);

    await pool.query('UPDATE customers SET updated_at=NOW() WHERE customer_id=$1', [customer.customer_id]);

    const token = jwt.sign(
      { customer_id: customer.customer_id, restaurant_id: req.restaurant.id, phone: customer.phone, name: customer.name },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    const { password_hash, ...safe } = customer;
    return success(res, { token, customer: safe }, 'Login successful');
  } catch (err) { console.error(err); return error(res, 'Login failed.'); }
});

// GET /v1/auth/me
router.get('/me', customerAuth, async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT customer_id, name, phone, email, address, created_at FROM customers WHERE customer_id=$1',
      [req.customer.customer_id]
    );
    return success(res, r.rows[0]);
  } catch (err) { console.error(err); return error(res, 'Failed to fetch profile.'); }
});

// PATCH /v1/auth/me
router.patch('/me', customerAuth, async (req, res) => {
  const { name, email, address } = req.body;
  const f=[],p=[]; let i=1;
  if (name!==undefined)    { f.push(`name=$${i++}`);    p.push(name.trim()); }
  if (email!==undefined)   { f.push(`email=$${i++}`);   p.push(email.toLowerCase().trim()); }
  if (address!==undefined) { f.push(`address=$${i++}`); p.push(address.trim()); }
  f.push(`updated_at=NOW()`);
  if (f.length===1) return error(res,'No fields to update.',400);
  p.push(req.customer.customer_id);
  try {
    const r = await pool.query(
      `UPDATE customers SET ${f.join(',')} WHERE customer_id=$${i} RETURNING customer_id,name,phone,email,address`,
      p
    );
    return success(res, r.rows[0]);
  } catch (err) { console.error(err); return error(res,'Failed to update profile.'); }
});

module.exports = router;
