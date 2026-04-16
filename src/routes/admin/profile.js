const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const pool = require('../../db/pool');
const apiKeyAuth = require('../../middleware/apiKeyAuth');
const adminAuth = require('../../middleware/adminAuth');
const { success, error } = require('../../utils/response');

router.use(apiKeyAuth);
router.use(adminAuth(['owner', 'manager']));

// GET /admin/profile
router.get('/', async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT r.id, r.name, r.slug, r.owner_name, r.owner_email, r.owner_phone,
              r.address, r.city, r.state, r.pincode, r.plan, r.is_active, r.created_at,
              SUBSTRING(r.api_key,1,20)||'...' AS api_key_preview,
              rc.logo_url, rc.primary_color, rc.secondary_color, rc.accent_color,
              rc.font_family, rc.hero_image_url, rc.tagline, rc.about_text,
              rc.social_facebook, rc.social_instagram, rc.social_twitter, rc.social_whatsapp,
              rc.features_enabled, rc.custom_domain, rc.maps_link
       FROM restaurants r
       LEFT JOIN restaurant_config rc ON r.id = rc.restaurant_id
       WHERE r.id = $1`,
      [req.restaurant.id]
    );
    if (!r.rows.length) return error(res, 'Restaurant not found.', 404);
    return success(res, r.rows[0]);
  } catch (err) { console.error(err); return error(res, 'Failed to fetch profile.'); }
});

// PATCH /admin/profile
router.patch('/', async (req, res) => {
  const configFields = ['logo_url','primary_color','secondary_color','accent_color','font_family',
    'hero_image_url','tagline','about_text','social_facebook','social_instagram',
    'social_twitter','social_whatsapp','custom_domain','maps_link','features_enabled'];
  const restFields  = ['owner_name','owner_phone','address','city','state','pincode'];

  const cU=[],cP=[]; let ci=1;
  const rU=[],rP=[]; let ri=1;

  for (const f of configFields) if (req.body[f] !== undefined) { cU.push(`${f}=$${ci++}`); cP.push(req.body[f]); }
  for (const f of restFields)   if (req.body[f] !== undefined) { rU.push(`${f}=$${ri++}`); rP.push(req.body[f]); }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (rU.length) {
      rP.push(req.restaurant.id);
      await client.query(`UPDATE restaurants SET ${rU.join(',')} WHERE id=$${ri}`, rP);
    }
    if (cU.length) {
      cP.push(req.restaurant.id);
      await client.query(`UPDATE restaurant_config SET ${cU.join(',')},updated_at=NOW() WHERE restaurant_id=$${ci}`, cP);
    }
    await client.query('COMMIT');
    return success(res, null, 'Profile updated.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err); return error(res, 'Failed to update profile.');
  } finally { client.release(); }
});

// GET /admin/profile/staff
router.get('/staff', adminAuth(['owner']), async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT user_id, name, email, phone, role, is_active, last_login, created_at
       FROM restaurant_users WHERE restaurant_id=$1 ORDER BY created_at DESC`,
      [req.restaurant.id]
    );
    return success(res, r.rows);
  } catch (err) { console.error(err); return error(res, 'Failed to fetch staff.'); }
});

// POST /admin/profile/staff
router.post('/staff', adminAuth(['owner']), async (req, res) => {
  const { name, email, password, phone, role='staff' } = req.body;
  if (!name||!email||!password) return error(res,'Name, email, and password required.',400);
  try {
    const hash = await bcrypt.hash(password, 12);
    const r = await pool.query(
      `INSERT INTO restaurant_users (restaurant_id,name,email,password_hash,phone,role)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING user_id,name,email,phone,role,created_at`,
      [req.restaurant.id, name.trim(), email.toLowerCase().trim(), hash, phone||null, role]
    );
    return success(res, r.rows[0], 'Staff member added.', 201);
  } catch (err) {
    if (err.code==='23505') return error(res,'Email already exists for this restaurant.',409);
    console.error(err); return error(res, 'Failed to add staff member.');
  }
});

// PATCH /admin/profile/staff/:id
router.patch('/staff/:id', adminAuth(['owner']), async (req, res) => {
  const { name, phone, role, is_active } = req.body;
  const f=[],p=[]; let i=1;
  if (name!==undefined)      {f.push(`name=$${i++}`);      p.push(name.trim());}
  if (phone!==undefined)     {f.push(`phone=$${i++}`);     p.push(phone);}
  if (role!==undefined)      {f.push(`role=$${i++}`);      p.push(role);}
  if (is_active!==undefined) {f.push(`is_active=$${i++}`); p.push(is_active);}
  if (!f.length) return error(res,'No fields to update.',400);
  p.push(req.params.id, req.restaurant.id);
  try {
    const r = await pool.query(
      `UPDATE restaurant_users SET ${f.join(',')} WHERE user_id=$${i} AND restaurant_id=$${i+1} RETURNING user_id,name,email,role,is_active`,
      p
    );
    if (!r.rows.length) return error(res,'Staff member not found.',404);
    return success(res, r.rows[0]);
  } catch (err) { console.error(err); return error(res,'Failed to update staff.'); }
});

module.exports = router;
