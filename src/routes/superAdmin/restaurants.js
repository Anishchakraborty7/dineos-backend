const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const pool = require('../../db/pool');
const superAdminAuth = require('../../middleware/superAdminAuth');
const { generateApiKey, generateSlug } = require('../../utils/generateApiKey');
const { success, error, paginated } = require('../../utils/response');

router.use(superAdminAuth);

// ============================================================
// GET /super/restaurants
// ============================================================
router.get('/', async (req, res) => {
  const { page=1, limit=20, search, status, plan, city } = req.query;
  const offset = (page-1)*limit;
  const conds=[]; const params=[]; let i=1;

  if (search) { conds.push(`(r.name ILIKE $${i} OR r.owner_email ILIKE $${i} OR r.owner_name ILIKE $${i} OR r.city ILIKE $${i})`); params.push(`%${search}%`); i++; }
  if (status==='active')   { conds.push(`r.is_active=$${i++}`); params.push(true); }
  if (status==='inactive') { conds.push(`r.is_active=$${i++}`); params.push(false); }
  if (plan)  { conds.push(`r.plan=$${i++}`); params.push(plan); }
  if (city)  { conds.push(`r.city ILIKE $${i++}`); params.push(`%${city}%`); }

  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

  try {
    const [cnt, data] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM restaurants r ${where}`, params),
      pool.query(
        `SELECT r.id AS restaurant_id, r.name, r.slug, r.owner_name, r.owner_email, r.owner_phone,
                r.city, r.state, r.plan, r.is_active, r.created_at AS onboarded_at,
                SUBSTRING(r.api_key,1,15)||'...' AS api_key_preview,
                rc.logo_url, rc.primary_color,
                s.status AS subscription_status, s.trial_ends_at
         FROM restaurants r
         LEFT JOIN restaurant_config rc ON r.id=rc.restaurant_id
         LEFT JOIN subscriptions_v2 s ON r.id=s.restaurant_id
         ${where}
         ORDER BY r.created_at DESC
         LIMIT $${i} OFFSET $${i+1}`,
        [...params, parseInt(limit), offset]
      )
    ]);
    return paginated(res, data.rows, cnt.rows[0].count, page, limit);
  } catch (err) { console.error(err); return error(res,'Failed to fetch restaurants.'); }
});

// ============================================================
// POST /super/restaurants — Onboard
// ============================================================
router.post('/', async (req, res) => {
  const {
    name, owner_name, owner_email, owner_phone,
    address, city, state, pincode,
    plan='basic',
    primary_color='#E63946', secondary_color='#1D3557',
    tagline='', notes='', admin_password
  } = req.body;

  if (!name||!owner_email) return error(res,'Restaurant name and owner email are required.',400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(owner_email)) return error(res,'Invalid email.',400);
  if (!['basic','pro','enterprise'].includes(plan)) return error(res,'Plan must be basic, pro, or enterprise.',400);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Unique slug
    let baseSlug = generateSlug(name); let slug = baseSlug;
    const slugCheck = await client.query(`SELECT COUNT(*) FROM restaurants WHERE slug LIKE $1`, [`${baseSlug}%`]);
    if (parseInt(slugCheck.rows[0].count)>0) slug = `${baseSlug}-${parseInt(slugCheck.rows[0].count)+1}`;

    // Unique API key
    let apiKey; let keyUnique=false;
    while (!keyUnique) {
      apiKey = generateApiKey();
      const kc = await client.query('SELECT COUNT(*) FROM restaurants WHERE api_key=$1',[apiKey]);
      if (parseInt(kc.rows[0].count)===0) keyUnique=true;
    }

    // Insert restaurant
    const rr = await client.query(
      `INSERT INTO restaurants (api_key,name,slug,owner_name,owner_email,owner_phone,address,city,state,pincode,plan,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id,name,slug,plan,created_at`,
      [apiKey, name.trim(), slug, owner_name?.trim()||null, owner_email.toLowerCase().trim(),
       owner_phone||null, address||null, city||null, state||null, pincode||null, plan, notes||null]
    );
    const restaurant = rr.rows[0];

    // Default branding
    await client.query(
      `INSERT INTO restaurant_config (restaurant_id,primary_color,secondary_color,tagline) VALUES ($1,$2,$3,$4)`,
      [restaurant.id, primary_color, secondary_color, tagline]
    );

    // Auto-create admin login
    const generatedPassword = admin_password || (Math.random().toString(36).slice(-8)+'A1!');
    const hash = await bcrypt.hash(generatedPassword, 12);
    await client.query(
      `INSERT INTO restaurant_users (restaurant_id,name,email,password_hash,role) VALUES ($1,$2,$3,$4,'owner')`,
      [restaurant.id, owner_name?.trim()||name.trim(), owner_email.toLowerCase().trim(), hash]
    );

    // 30-day trial subscription
    const trialEnd = new Date(); trialEnd.setDate(trialEnd.getDate()+30);
    await client.query(
      `INSERT INTO subscriptions_v2 (restaurant_id,plan,status,trial_ends_at) VALUES ($1,$2,'trial',$3)`,
      [restaurant.id, plan, trialEnd]
    );

    await client.query('COMMIT');

    return success(res, {
      restaurant_id:  restaurant.id,
      api_key:        apiKey,
      name:           restaurant.name,
      slug:           restaurant.slug,
      plan:           restaurant.plan,
      onboarded_at:   restaurant.created_at,
      admin_login: {
        email:    owner_email.toLowerCase().trim(),
        password: generatedPassword,
        note:     '⚠️  Share securely. Password shown ONCE only.'
      },
      trial_ends_at: trialEnd.toISOString(),
      notice: '⚠️  Save the API key now — it will NOT be shown in full again.'
    }, 'Restaurant onboarded! 30-day trial activated.', 201);

  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code==='23505') return error(res,'A restaurant with this email or slug already exists.',409);
    console.error('Onboard error:', err);
    return error(res,'Failed to onboard restaurant.');
  } finally { client.release(); }
});

// ============================================================
// GET /super/restaurants/:id
// ============================================================
router.get('/:id', async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT r.id AS restaurant_id, r.name, r.slug, r.owner_name, r.owner_email, r.owner_phone,
              r.address, r.city, r.state, r.pincode, r.plan, r.is_active, r.created_at AS onboarded_at, r.notes,
              SUBSTRING(r.api_key,1,15)||'...' AS api_key_preview,
              rc.config_id, rc.logo_url, rc.primary_color, rc.secondary_color, rc.tagline, rc.about_text,
              rc.social_instagram, rc.social_facebook, rc.social_whatsapp, rc.maps_link,
              rc.features_enabled, rc.custom_domain,
              s.status AS subscription_status, s.trial_ends_at, s.current_period_end, s.monthly_amount
       FROM restaurants r
       LEFT JOIN restaurant_config rc ON r.id=rc.restaurant_id
       LEFT JOIN subscriptions_v2 s ON r.id=s.restaurant_id
       WHERE r.id=$1`,
      [req.params.id]
    );
    if (!r.rows.length) return error(res,'Restaurant not found.',404);
    return success(res, r.rows[0]);
  } catch (err) { console.error(err); return error(res,'Failed to fetch restaurant.'); }
});

// ============================================================
// PATCH /super/restaurants/:id
// ============================================================
router.patch('/:id', async (req, res) => {
  const allowedR = ['is_active','plan','notes','name','owner_name','owner_email','owner_phone','city','state','address','pincode'];
  const allowedC = ['primary_color','secondary_color','tagline','about_text','logo_url','hero_image_url','custom_domain','maps_link','features_enabled'];

  const rF=[],rP=[]; let ri=1;
  const cF=[],cP=[]; let ci=1;

  for (const f of allowedR) if (req.body[f]!==undefined) { rF.push(`${f}=$${ri++}`); rP.push(req.body[f]); }
  for (const f of allowedC) if (req.body[f]!==undefined) { cF.push(`${f}=$${ci++}`); cP.push(req.body[f]); }

  if (!rF.length&&!cF.length) return error(res,'No valid fields to update.',400);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (rF.length) { rP.push(req.params.id); await client.query(`UPDATE restaurants SET ${rF.join(',')} WHERE id=$${ri}`, rP); }
    if (cF.length) { cP.push(req.params.id); await client.query(`UPDATE restaurant_config SET ${cF.join(',')},updated_at=NOW() WHERE restaurant_id=$${ci}`, cP); }
    await client.query('COMMIT');
    return success(res, null,'Restaurant updated.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err); return error(res,'Failed to update.');
  } finally { client.release(); }
});

// ============================================================
// POST /super/restaurants/:id/reset-admin-password
// ============================================================
router.post('/:id/reset-admin-password', async (req, res) => {
  try {
    const newPass = Math.random().toString(36).slice(-8)+'A1!';
    const hash = await bcrypt.hash(newPass, 12);
    const r = await pool.query(
      `UPDATE restaurant_users SET password_hash=$1 WHERE restaurant_id=$2 AND role='owner' RETURNING email`,
      [hash, req.params.id]
    );
    if (!r.rows.length) return error(res,'No owner account found.',404);
    return success(res,{email:r.rows[0].email,new_password:newPass,note:'⚠️  Share securely. Shown ONCE.'},'Admin password reset.');
  } catch (err) { console.error(err); return error(res,'Failed to reset password.'); }
});

// ============================================================
// POST /super/restaurants/:id/regenerate-key
// ============================================================
router.post('/:id/regenerate-key', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const newKey = generateApiKey();
    await client.query('UPDATE restaurants SET api_key=$1 WHERE id=$2',[newKey,req.params.id]);
    await client.query('COMMIT');
    return success(res,{api_key:newKey,notice:'⚠️  Old key immediately invalidated.'},'API key regenerated.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err); return error(res,'Failed to regenerate key.');
  } finally { client.release(); }
});

// ============================================================
// DELETE /super/restaurants/:id
// ============================================================
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM restaurants WHERE id=$1',[req.params.id]);
    return success(res,null,'Restaurant deleted.');
  } catch (err) { console.error(err); return error(res,'Failed to delete restaurant.'); }
});

module.exports = router;
