const express = require('express');
const router = express.Router();
const pool = require('../../db/pool');
const apiKeyAuth = require('../../middleware/apiKeyAuth');
const { success, error } = require('../../utils/response');

router.use(apiKeyAuth);

// GET /v1/config  — restaurant branding for mobile app
router.get('/', async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT r.name, r.slug, r.owner_phone, r.city, r.state, r.address, r.plan,
              rc.logo_url, rc.primary_color, rc.secondary_color, rc.accent_color,
              rc.font_family, rc.hero_image_url, rc.tagline, rc.about_text,
              rc.social_facebook, rc.social_instagram, rc.social_twitter, rc.social_whatsapp,
              rc.features_enabled, rc.maps_link
       FROM restaurants r
       LEFT JOIN restaurant_config rc ON r.id = rc.restaurant_id
       WHERE r.id = $1`,
      [req.restaurant.id]
    );
    if (!r.rows.length) return error(res, 'Restaurant not found.', 404);
    return success(res, r.rows[0]);
  } catch (err) { console.error(err); return error(res, 'Failed to fetch config.'); }
});

module.exports = router;
