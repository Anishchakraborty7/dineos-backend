const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');

const app = express();

// ── Middleware ────────────────────────────────────────────────
app.use(cors());
app.use(helmet());
app.use(express.json());

// ── Super-Admin Routes  (prefix: /super) ─────────────────────
app.use('/super/auth',          require('./routes/superAdmin/auth'));
app.use('/super/restaurants',   require('./routes/superAdmin/restaurants'));
app.use('/super/subscriptions', require('./routes/superAdmin/subscriptions'));
app.use('/super/analytics',     require('./routes/superAdmin/analytics'));

// ── Restaurant-Admin Routes (prefix: /admin) ─────────────────
app.use('/admin/auth',         require('./routes/admin/auth'));
app.use('/admin/menu',         require('./routes/admin/menu'));
app.use('/admin/orders',       require('./routes/admin/orders'));
app.use('/admin/tables',       require('./routes/admin/tables'));
app.use('/admin/reservations', require('./routes/admin/reservations'));
app.use('/admin/customers',    require('./routes/admin/customers'));
app.use('/admin/analytics',    require('./routes/admin/analytics'));
app.use('/admin/profile',      require('./routes/admin/profile'));
app.use('/admin/events',       require('./routes/admin/events'));

// ── Public Mobile API (prefix: /v1) ──────────────────────────
app.use('/v1/config',        require('./routes/public/config'));
app.use('/v1/menu',          require('./routes/public/menu'));
app.use('/v1/auth',          require('./routes/public/auth'));
app.use('/v1/orders',        require('./routes/public/orders'));
app.use('/v1/reservations',  require('./routes/public/reservations'));
app.use('/v1/events',        require('./routes/public/events'));

// ── Health check ──────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', ts: new Date() }));

// ── 404 ───────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ success: false, error: 'Route not found.' }));

module.exports = app;