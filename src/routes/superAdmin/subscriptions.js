const express = require('express');
const router = express.Router();
const pool = require('../../db/pool');
const superAdminAuth = require('../../middleware/superAdminAuth');
const { success, error, paginated } = require('../../utils/response');

router.use(superAdminAuth);

// GET /super/subscriptions
router.get('/', async (req, res) => {
  const { status, plan, page=1, limit=20 } = req.query;
  const offset = (page-1)*limit;
  const conds=[]; const params=[]; let idx=1;
  if (status) { conds.push(`s.status=$${idx++}`); params.push(status); }
  if (plan)   { conds.push(`s.plan=$${idx++}`);   params.push(plan); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  try {
    const [cnt, data] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM subscriptions_v2 s ${where}`, params),
      pool.query(
        `SELECT s.*, r.name AS restaurant_name, r.owner_email, r.city
         FROM subscriptions_v2 s JOIN restaurants r ON s.restaurant_id=r.id
         ${where} ORDER BY s.updated_at DESC LIMIT $${idx} OFFSET $${idx+1}`,
        [...params, parseInt(limit), offset]
      )
    ]);
    return paginated(res, data.rows, cnt.rows[0].count, page, limit);
  } catch (err) { console.error(err); return error(res,'Failed to fetch subscriptions.'); }
});

// POST /super/subscriptions/:id — upsert subscription
router.post('/:id', async (req, res) => {
  const { plan, status, monthly_amount, trial_days, current_period_end } = req.body;
  let trialEndsAt = null;
  if (trial_days) { trialEndsAt = new Date(); trialEndsAt.setDate(trialEndsAt.getDate()+parseInt(trial_days)); }

  try {
    const r = await pool.query(
      `INSERT INTO subscriptions_v2 (restaurant_id,plan,status,monthly_amount,trial_ends_at,current_period_end)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (restaurant_id) DO UPDATE SET
         plan=EXCLUDED.plan, status=EXCLUDED.status, monthly_amount=EXCLUDED.monthly_amount,
         trial_ends_at=COALESCE(EXCLUDED.trial_ends_at,subscriptions_v2.trial_ends_at),
         current_period_end=EXCLUDED.current_period_end, updated_at=NOW()
       RETURNING *`,
      [req.params.id, plan||'basic', status||'trial', monthly_amount||0, trialEndsAt, current_period_end||null]
    );
    if (plan) await pool.query('UPDATE restaurants SET plan=$1 WHERE id=$2', [plan, req.params.id]);
    return success(res, r.rows[0], 'Subscription updated.', 201);
  } catch (err) { console.error(err); return error(res,'Failed to update subscription.'); }
});

// GET /super/subscriptions/:id/payments
router.get('/:id/payments', async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT * FROM payment_history WHERE restaurant_id=$1 ORDER BY created_at DESC LIMIT 50',
      [req.params.id]
    );
    return success(res, r.rows);
  } catch (err) { console.error(err); return error(res,'Failed to fetch payments.'); }
});

// POST /super/subscriptions/:id/payments
router.post('/:id/payments', async (req, res) => {
  const { amount, status='paid', description, gateway_payment_id } = req.body;
  if (!amount) return error(res,'Amount required.',400);
  try {
    const r = await pool.query(
      `INSERT INTO payment_history (restaurant_id,amount,status,description,gateway_payment_id,paid_at)
       VALUES ($1,$2,$3,$4,$5,NOW()) RETURNING *`,
      [req.params.id, amount, status, description||null, gateway_payment_id||null]
    );
    return success(res, r.rows[0], 'Payment recorded.', 201);
  } catch (err) { console.error(err); return error(res,'Failed to record payment.'); }
});

module.exports = router;
