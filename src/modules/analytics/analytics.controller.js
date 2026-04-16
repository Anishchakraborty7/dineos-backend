const pool = require('../../config/db');

exports.getAnalytics = async (req, res) => {
  try {
    // ---- Total ----
    const totalRes = await pool.query(
      `SELECT COUNT(*) FROM restaurants`
    );

    // ---- Active ----
    const activeRes = await pool.query(
      `SELECT COUNT(*) FROM restaurants WHERE is_active = true`
    );

    // ---- Inactive ----
    const inactiveRes = await pool.query(
      `SELECT COUNT(*) FROM restaurants WHERE is_active = false`
    );

    // ---- New This Week ----
    const weekRes = await pool.query(
      `SELECT COUNT(*) FROM restaurants
       WHERE created_at >= NOW() - INTERVAL '7 days'`
    );

    // ---- New This Month ----
    const monthRes = await pool.query(
      `SELECT COUNT(*) FROM restaurants
       WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())`
    );

    // ---- Plan Distribution ----
    const planRes = await pool.query(
      `SELECT plan, COUNT(*) as count
       FROM restaurants
       GROUP BY plan`
    );

    // ---- Monthly Growth ----
    const growthRes = await pool.query(
      `SELECT TO_CHAR(created_at, 'Mon YYYY') as month,
              COUNT(*) as count
       FROM restaurants
       GROUP BY month
       ORDER BY MIN(created_at)`
    );

    // ---- Recent Restaurants ----
    const recentRes = await pool.query(
      `SELECT id as restaurant_id, name, slug, city, plan, is_active, created_at as onboarded_at
       FROM restaurants
       ORDER BY created_at DESC
       LIMIT 5`
    );

    res.json({
      stats: {
        total: parseInt(totalRes.rows[0].count),
        active: parseInt(activeRes.rows[0].count),
        inactive: parseInt(inactiveRes.rows[0].count),
        new_this_week: parseInt(weekRes.rows[0].count),
        new_this_month: parseInt(monthRes.rows[0].count),
      },
      plan_distribution: planRes.rows,
      monthly_growth: growthRes.rows,
      recent_restaurants: recentRes.rows
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Analytics failed' });
  }
};