const express = require('express');
const router = express.Router();
const pool = require('../../db/pool');
const superAdminAuth = require('../../middleware/superAdminAuth');
const { success, error } = require('../../utils/response');

router.use(superAdminAuth);

// GET /super/analytics
router.get('/', async (req, res) => {
  try {
    const [restaurantStats, planDist, recentRestaurants, monthlyGrowth] = await Promise.all([

      pool.query(`
        SELECT
          COUNT(*)                                                      AS total,
          COUNT(*) FILTER (WHERE is_active=true)                       AS active,
          COUNT(*) FILTER (WHERE is_active=false)                      AS inactive,
          COUNT(*) FILTER (WHERE created_at >= NOW()-INTERVAL '30 days') AS new_this_month,
          COUNT(*) FILTER (WHERE created_at >= NOW()-INTERVAL '7 days')  AS new_this_week
        FROM restaurants`),

      pool.query(`SELECT plan, COUNT(*) AS count FROM restaurants GROUP BY plan ORDER BY count DESC`),

      pool.query(`
        SELECT r.id AS restaurant_id, r.name, r.slug, r.city, r.plan, r.is_active, r.created_at AS onboarded_at,
               s.status AS subscription_status
        FROM restaurants r
        LEFT JOIN subscriptions_v2 s ON r.id=s.restaurant_id
        ORDER BY r.created_at DESC LIMIT 5`),

      pool.query(`
        SELECT TO_CHAR(DATE_TRUNC('month',created_at),'Mon YYYY') AS month,
               DATE_TRUNC('month',created_at) AS month_date,
               COUNT(*) AS count
        FROM restaurants WHERE created_at >= NOW()-INTERVAL '6 months'
        GROUP BY DATE_TRUNC('month',created_at) ORDER BY month_date`)
    ]);

    return success(res, {
      stats:              restaurantStats.rows[0],
      plan_distribution:  planDist.rows,
      recent_restaurants: recentRestaurants.rows,
      monthly_growth:     monthlyGrowth.rows
    });
  } catch (err) {
    console.error('Analytics error:', err);
    return error(res, 'Failed to fetch analytics.');
  }
});

module.exports = router;
