const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../../db/pool');
const superAdminAuth = require('../../middleware/superAdminAuth');
const { success, error } = require('../../utils/response');

// ============================================================
// POST /super/auth/login
// ============================================================
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return error(res, 'Email and password are required.', 400);
  }

  try {
    const result = await pool.query(
      `SELECT admin_id, name, email, password_hash, is_active, last_login
       FROM super_admins
       WHERE email = $1`,
      [email.toLowerCase().trim()]
    );

    if (result.rows.length === 0) {
      // Don't reveal if email exists (security best practice)
      return error(res, 'Invalid email or password.', 401);
    }

    const admin = result.rows[0];

    if (!admin.is_active) {
      return error(res, 'Account deactivated. Contact system owner.', 403);
    }

    const isValid = await bcrypt.compare(password, admin.password_hash);
    if (!isValid) {
      return error(res, 'Invalid email or password.', 401);
    }

    // Update last login timestamp
    await pool.query(
      'UPDATE super_admins SET last_login = NOW() WHERE admin_id = $1',
      [admin.admin_id]
    );

    const token = jwt.sign(
      {
        admin_id: admin.admin_id,
        email: admin.email,
        name: admin.name,
        role: 'super_admin'
      },
      process.env.SUPER_ADMIN_JWT_SECRET,
      { expiresIn: process.env.SUPER_ADMIN_JWT_EXPIRY || '24h' }
    );

    return success(res, {
      token,
      admin: {
        admin_id: admin.admin_id,
        name: admin.name,
        email: admin.email,
        last_login: admin.last_login
      }
    }, 'Login successful');

  } catch (err) {
    console.error('Login error:', err);
    return error(res, 'Login failed. Please try again.');
  }
});

// ============================================================
// GET /super/auth/me — Get current admin profile
// ============================================================
router.get('/me', superAdminAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT admin_id, name, email, last_login, created_at
       FROM super_admins
       WHERE admin_id = $1`,
      [req.superAdmin.admin_id]
    );

    if (result.rows.length === 0) {
      return error(res, 'Admin not found.', 404);
    }

    return success(res, result.rows[0]);
  } catch (err) {
    console.error('Get me error:', err);
    return error(res, 'Failed to fetch profile.');
  }
});

// ============================================================
// POST /super/auth/setup — ONE-TIME: Create first super admin
//
// Steps to use:
//   1. Set ALLOW_SETUP=true in .env
//   2. Set SETUP_SECRET_KEY=some_strong_secret in .env
//   3. POST /super/auth/setup with { name, email, password, setup_key }
//   4. Set ALLOW_SETUP=false in .env immediately after!
// ============================================================
router.post('/setup', async (req, res) => {
  if (process.env.ALLOW_SETUP !== 'true') {
    return error(
      res,
      'Setup endpoint is disabled. Set ALLOW_SETUP=true in .env to enable.',
      403
    );
  }

  const { name, email, password, setup_key } = req.body;

  // Validate setup key
  if (!setup_key || setup_key !== process.env.SETUP_SECRET_KEY) {
    return error(res, 'Invalid setup key.', 403);
  }

  // Validate required fields
  if (!name || !email || !password) {
    return error(res, 'Name, email, and password are required.', 400);
  }

  if (password.length < 8) {
    return error(res, 'Password must be at least 8 characters.', 400);
  }

  try {
    // Only allow setup if no super admins exist yet
    const countResult = await pool.query('SELECT COUNT(*) FROM super_admins');
    if (parseInt(countResult.rows[0].count) > 0) {
      return error(
        res,
        'Setup already completed. A super admin already exists.',
        409
      );
    }

    const password_hash = await bcrypt.hash(password, 12);

    const insertResult = await pool.query(
      `INSERT INTO super_admins (name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING admin_id, name, email, created_at`,
      [name.trim(), email.toLowerCase().trim(), password_hash]
    );

    return success(
      res,
      insertResult.rows[0],
      '✅ Super Admin created! IMPORTANT: Set ALLOW_SETUP=false in your .env now.',
      201
    );
  } catch (err) {
    if (err.code === '23505') {
      return error(res, 'An admin with this email already exists.', 409);
    }
    console.error('Setup error:', err);
    return error(res, 'Setup failed.');
  }
});

// ============================================================
// POST /super/auth/logout — Client-side only (JWT is stateless)
// ============================================================
router.post('/logout', superAdminAuth, (req, res) => {
  // JWTs are stateless — actual logout is done by deleting the token client-side.
  // For production, implement a token blacklist using Redis.
  return success(res, null, 'Logged out successfully.');
});

module.exports = router;
