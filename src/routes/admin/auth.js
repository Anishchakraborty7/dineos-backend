const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../../db/pool');
const apiKeyAuth = require('../../middleware/apiKeyAuth');
const adminAuth = require('../../middleware/adminAuth');
const { success, error } = require('../../utils/response');

router.use(apiKeyAuth);

// POST /admin/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return error(res, 'Email and password are required.', 400);

  try {
    const result = await pool.query(
      `SELECT user_id, name, email, password_hash, role, is_active, last_login
       FROM restaurant_users
       WHERE restaurant_id = $1 AND email = $2`,
      [req.restaurant.id, email.toLowerCase().trim()]
    );

    if (!result.rows.length) return error(res, 'Invalid email or password.', 401);
    const user = result.rows[0];
    if (!user.is_active) return error(res, 'Account deactivated. Contact your restaurant owner.', 403);

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return error(res, 'Invalid email or password.', 401);

    await pool.query('UPDATE restaurant_users SET last_login = NOW() WHERE user_id = $1', [user.user_id]);

    const token = jwt.sign(
      { user_id: user.user_id, restaurant_id: req.restaurant.id, name: user.name, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRY || '7d' }
    );

    return success(res, {
      token,
      user: { user_id: user.user_id, name: user.name, email: user.email, role: user.role, last_login: user.last_login },
      restaurant: { id: req.restaurant.id, restaurant_id: req.restaurant.restaurant_id, name: req.restaurant.name, plan: req.restaurant.plan }
    }, 'Login successful');
  } catch (err) {
    console.error('Admin login error:', err);
    return error(res, 'Login failed. Please try again.');
  }
});

// GET /admin/auth/me
router.get('/me', adminAuth(), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.user_id, u.name, u.email, u.phone, u.role, u.last_login,
              r.name AS restaurant_name, r.plan,
              rc.primary_color, rc.secondary_color, rc.logo_url
       FROM restaurant_users u
       JOIN restaurants r ON u.restaurant_id = r.id
       LEFT JOIN restaurant_config rc ON r.id = rc.restaurant_id
       WHERE u.user_id = $1`,
      [req.adminUser.user_id]
    );
    if (!result.rows.length) return error(res, 'User not found.', 404);
    return success(res, result.rows[0]);
  } catch (err) {
    console.error(err);
    return error(res, 'Failed to fetch profile.');
  }
});

// PATCH /admin/auth/change-password
router.patch('/change-password', adminAuth(), async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) return error(res, 'Both passwords required.', 400);
  if (new_password.length < 8) return error(res, 'New password must be at least 8 characters.', 400);

  try {
    const result = await pool.query('SELECT password_hash FROM restaurant_users WHERE user_id = $1', [req.adminUser.user_id]);
    const valid = await bcrypt.compare(current_password, result.rows[0].password_hash);
    if (!valid) return error(res, 'Current password is incorrect.', 400);

    const hash = await bcrypt.hash(new_password, 12);
    await pool.query('UPDATE restaurant_users SET password_hash = $1 WHERE user_id = $2', [hash, req.adminUser.user_id]);
    return success(res, null, 'Password updated successfully.');
  } catch (err) {
    console.error(err);
    return error(res, 'Failed to update password.');
  }
});

module.exports = router;
