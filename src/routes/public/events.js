const express = require('express');
const router = express.Router();
const pool = require('../../db/pool');
const apiKeyAuth = require('../../middleware/apiKeyAuth');
const customerAuth = require('../../middleware/customerAuth'); // Assuming it exists
const { success, error } = require('../../utils/response');

router.use(apiKeyAuth); // Enforce restaurant tenant

// GET /v1/events - List upcoming public events for this restaurant
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM events
       WHERE restaurant_id = $1 AND status != 'cancelled'
       AND event_date >= CURRENT_DATE
       ORDER BY event_date ASC, start_time ASC`,
      [req.restaurant.id]
    );
    return success(res, { events: result.rows });
  } catch (err) {
    console.error(err);
    return error(res, 'Failed to fetch public events.');
  }
});

// POST /v1/events/:id/register - Register for an event (requires customer token)
router.post('/:id/register', customerAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { guest_name, guest_phone, role, performance_type } = req.body;
    
    // Verify event exists and belongs to this restaurant
    const eventCheck = await pool.query(
      `SELECT * FROM events WHERE event_id = $1 AND restaurant_id = $2 AND status != 'cancelled'`,
      [id, req.restaurant.id]
    );
    
    if (!eventCheck.rows.length) {
      return error(res, 'Event not found or unavailable.', 404);
    }
    
    const event = eventCheck.rows[0];
    
    // Check if already registered
    const regCheck = await pool.query(
      `SELECT * FROM event_registrations WHERE event_id = $1 AND customer_id = $2`,
      [id, req.customer.customer_id]
    );
    
    if (regCheck.rows.length) {
      return error(res, 'You are already registered for this event.', 400);
    }
    
    const result = await pool.query(
      `INSERT INTO event_registrations (
        event_id, customer_id, guest_name, guest_phone, role, performance_type
      ) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        id, 
        req.customer.customer_id, 
        guest_name || req.customer.name, 
        guest_phone || req.customer.phone,
        role || 'attendee',
        performance_type || null
      ]
    );
    
    return success(res, result.rows[0], 'Registered successfully.', 201);
  } catch (err) {
    console.error(err);
    return error(res, 'Failed to register for event.');
  }
});

module.exports = router;
