const express = require('express');
const router = express.Router();
const pool = require('../../db/pool');
const apiKeyAuth = require('../../middleware/apiKeyAuth');
const adminAuth = require('../../middleware/adminAuth');
const { success, error } = require('../../utils/response');

router.use(apiKeyAuth);
router.use(adminAuth(['owner', 'manager']));

router.get('/', async (req, res) => {
  const rid = req.restaurant.id;
  try {
    const [orderStats, revenueToday, revenueWeek, revenueMonth, topItems, ordersByStatus, dailyRevenue, recentOrders] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE DATE(created_at)=CURRENT_DATE)             AS orders_today,
          COUNT(*) FILTER (WHERE created_at>=NOW()-INTERVAL '7 days')        AS orders_week,
          COUNT(*) FILTER (WHERE DATE_TRUNC('month',created_at)=DATE_TRUNC('month',NOW())) AS orders_month,
          COUNT(*) FILTER (WHERE status='pending')                            AS orders_pending,
          COUNT(*) FILTER (WHERE status='preparing')                          AS orders_preparing
        FROM orders_v2 WHERE restaurant_id=$1`, [rid]),

      pool.query(`SELECT COALESCE(SUM(total_amount),0) AS revenue_today FROM orders_v2
        WHERE restaurant_id=$1 AND DATE(created_at)=CURRENT_DATE AND status!='cancelled'`, [rid]),

      pool.query(`SELECT COALESCE(SUM(total_amount),0) AS revenue_week FROM orders_v2
        WHERE restaurant_id=$1 AND created_at>=NOW()-INTERVAL '7 days' AND status!='cancelled'`, [rid]),

      pool.query(`SELECT COALESCE(SUM(total_amount),0) AS revenue_month FROM orders_v2
        WHERE restaurant_id=$1 AND DATE_TRUNC('month',created_at)=DATE_TRUNC('month',NOW()) AND status!='cancelled'`, [rid]),

      pool.query(`
        SELECT oi.item_name, SUM(oi.quantity) AS total_qty, SUM(oi.total_price) AS total_revenue
        FROM order_items_v2 oi JOIN orders_v2 o ON oi.order_id=o.order_id
        WHERE o.restaurant_id=$1 AND o.status!='cancelled' AND o.created_at>=NOW()-INTERVAL '30 days'
        GROUP BY oi.item_name ORDER BY total_qty DESC LIMIT 5`, [rid]),

      pool.query(`SELECT status, COUNT(*) FROM orders_v2 WHERE restaurant_id=$1 AND DATE(created_at)=CURRENT_DATE GROUP BY status`, [rid]),

      pool.query(`
        SELECT TO_CHAR(DATE(created_at),'DD Mon') AS day, DATE(created_at) AS day_date,
               COALESCE(SUM(total_amount),0) AS revenue, COUNT(*) AS order_count
        FROM orders_v2 WHERE restaurant_id=$1 AND created_at>=NOW()-INTERVAL '7 days' AND status!='cancelled'
        GROUP BY DATE(created_at) ORDER BY day_date`, [rid]),

      pool.query(`
        SELECT o.order_id,o.order_number,o.order_type,o.status,o.total_amount,o.created_at,
               c.name AS customer_name,c.phone AS customer_phone
        FROM orders_v2 o LEFT JOIN customers c ON o.customer_id=c.customer_id
        WHERE o.restaurant_id=$1 ORDER BY o.created_at DESC LIMIT 10`, [rid])
    ]);

    return success(res, {
      order_stats: {
        ...orderStats.rows[0],
        revenue_today:  parseFloat(revenueToday.rows[0].revenue_today),
        revenue_week:   parseFloat(revenueWeek.rows[0].revenue_week),
        revenue_month:  parseFloat(revenueMonth.rows[0].revenue_month)
      },
      top_items:       topItems.rows,
      orders_by_status:ordersByStatus.rows,
      daily_revenue:   dailyRevenue.rows,
      recent_orders:   recentOrders.rows
    });
  } catch (err) { console.error('Analytics error:', err); return error(res,'Failed to fetch analytics.'); }
});

router.get('/customers', async (req, res) => {
  const rid = req.restaurant.id;
  try {
    const [total, newThisMonth, top] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM customers WHERE restaurant_id=$1`,[rid]),
      pool.query(`SELECT COUNT(*) FROM customers WHERE restaurant_id=$1 AND DATE_TRUNC('month',created_at)=DATE_TRUNC('month',NOW())`,[rid]),
      pool.query(`SELECT c.name,c.phone,COUNT(o.order_id) AS order_count,COALESCE(SUM(o.total_amount) FILTER(WHERE o.status!='cancelled'),0) AS total_spent
        FROM customers c LEFT JOIN orders_v2 o ON c.customer_id=o.customer_id
        WHERE c.restaurant_id=$1 GROUP BY c.customer_id,c.name,c.phone ORDER BY total_spent DESC NULLS LAST LIMIT 10`,[rid])
    ]);
    return success(res,{total_customers:parseInt(total.rows[0].count),new_this_month:parseInt(newThisMonth.rows[0].count),top_customers:top.rows});
  } catch (err) { console.error(err); return error(res,'Failed to fetch customer analytics.'); }
});

module.exports = router;
