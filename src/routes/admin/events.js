const express = require('express');
const router = express.Router();
const pool = require('../../db/pool');
const { success, error } = require('../../utils/response');
const { v4: uuidv4 } = require('uuid');
const apiKeyAuth = require('../../middleware/apiKeyAuth');
const adminAuth = require('../../middleware/adminAuth');

router.use(apiKeyAuth);
router.use(adminAuth(['owner', 'manager']));

// GET /v1/admin/events - List events
router.get('/', async (req, res) => {
  try {
    const { status } = req.query;
    let query = `SELECT * FROM events WHERE restaurant_id = $1`;
    const params = [req.restaurant.id];

    if (status) {
      query += ` AND status = $2`;
      params.push(status);
    }

    query += ` ORDER BY event_date ASC, start_time ASC`;

    const result = await pool.query(query, params);

    // Fetch registrations count for each event
    const events = [...result.rows];
    for (let e of events) {
      const regCount = await pool.query(`SELECT COUNT(*) as count FROM event_registrations WHERE event_id = $1`, [e.event_id]);
      e.registration_count = parseInt(regCount.rows[0].count, 10);
    }

    return success(res, { events });
  } catch (err) {
    console.error(err);
    return error(res, 'Failed to fetch events.');
  }
});

// POST /v1/admin/events - Create event
router.post('/', async (req, res) => {
  try {
    const { title, description, event_type, event_date, start_time, end_time, cover_charge, max_performers, max_attendees } = req.body;
    if (!title || !event_date || !start_time) return error(res, 'Title, date, and start time are required.', 400);

    const result = await pool.query(
      `INSERT INTO events (
        restaurant_id, title, description, event_type, 
        event_date, start_time, end_time, cover_charge, 
        max_performers, max_attendees
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        req.restaurant.id, title, description, event_type || 'open_mic',
        event_date, start_time, end_time || null, cover_charge || 0,
        max_performers || null, max_attendees || null
      ]
    );

    return success(res, result.rows[0], 'Event created successfully.', 201);
  } catch (err) {
    console.error(err);
    return error(res, 'Failed to create event.');
  }
});

// GET /v1/admin/events/:id/registrations
router.get('/:id/registrations', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT r.*, c.name as customer_name, c.email as customer_email
       FROM event_registrations r
       LEFT JOIN customers c ON r.customer_id = c.customer_id
       WHERE r.event_id = $1
       ORDER BY r.created_at DESC`,
      [id]
    );
    return success(res, { registrations: result.rows });
  } catch (err) {
    console.error(err);
    return error(res, 'Failed to fetch registrations.');
  }
});

// PATCH /v1/admin/events/registrations/:regId/status
router.patch('/registrations/:regId/status', async (req, res) => {
  try {
    const { regId } = req.params;
    const { status } = req.body;
    if (!['pending', 'approved', 'rejected', 'cancelled'].includes(status)) {
      return error(res, 'Invalid status', 400);
    }
    
    // Make sure the event belongs to this restaurant (security check)
    const check = await pool.query(
      `SELECT e.restaurant_id FROM event_registrations r
       JOIN events e ON r.event_id = e.event_id
       WHERE r.registration_id = $1`, [regId]
    );
    
    if (!check.rows.length || check.rows[0].restaurant_id !== req.restaurant.id) {
       return error(res, 'Registration not found or unauthorized', 404);
    }

    const result = await pool.query(
      `UPDATE event_registrations SET status = $1 WHERE registration_id = $2 RETURNING *`,
      [status, regId]
    );
    return success(res, result.rows[0]);
  } catch (err) {
    console.error(err);
    return error(res, 'Failed to update registration status.');
  }
});

module.exports = router;
