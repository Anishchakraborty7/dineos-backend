require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();

// ---- Security Headers ----
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// ---- CORS ----
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:5500', 'http://127.0.0.1:5500', 'http://localhost:3000'];

// Wildcard patterns allowed in production (*.netlify.app, *.onrender.com)
const allowedPatterns = [/\.netlify\.app$/, /\.onrender\.com$/];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); // server-to-server / curl
    if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    if (allowedPatterns.some(p => p.test(origin))) {
      return callback(null, true);
    }
    callback(new Error(`CORS policy: origin ${origin} not allowed`));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
  credentials: true
}));

// ---- Rate Limiting ----
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests. Please slow down.' }
}));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: { success: false, error: 'Too many login attempts. Try again later.' }
});

// ---- Body Parsing ----
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ---- Request Logger (dev only) ----
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
  });
}

// ============================================================
// ROUTES — SUPER ADMIN (your team only)
// ============================================================
app.use('/super/auth',          authLimiter, require('./src/routes/superAdmin/auth'));
app.use('/super/restaurants',                require('./src/routes/superAdmin/restaurants'));
app.use('/super/analytics',                  require('./src/routes/superAdmin/analytics'));
app.use('/super/subscriptions',              require('./src/routes/superAdmin/subscriptions'));

// ============================================================
// ROUTES — RESTAURANT ADMIN (restaurant owners/staff)
// All require X-API-Key + JWT
// ============================================================
app.use('/admin/auth',          authLimiter, require('./src/routes/admin/auth'));
app.use('/admin/menu',                       require('./src/routes/admin/menu'));
app.use('/admin/orders',                     require('./src/routes/admin/orders'));
app.use('/admin/profile',                    require('./src/routes/admin/profile'));
app.use('/admin/tables',                     require('./src/routes/admin/tables'));
app.use('/admin/reservations',               require('./src/routes/admin/reservations'));
app.use('/admin/customers',                  require('./src/routes/admin/customers'));
app.use('/admin/analytics',                  require('./src/routes/admin/analytics'));

// ============================================================
// ROUTES — PUBLIC API (mobile apps / customers)
// All require X-API-Key header (restaurant identifier)
// ============================================================
app.use('/v1/config',          require('./src/routes/public/config'));
app.use('/v1/menu',            require('./src/routes/public/menu'));
app.use('/v1/auth',   authLimiter, require('./src/routes/public/auth'));
app.use('/v1/orders',          require('./src/routes/public/orders'));
app.use('/v1/reservations',    require('./src/routes/public/reservations'));

// ---- Health Check ----
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    service: 'DineOS API',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    endpoints: {
      super_admin: ['/super/auth', '/super/restaurants', '/super/analytics', '/super/subscriptions'],
      restaurant_admin: ['/admin/auth', '/admin/menu', '/admin/orders', '/admin/profile', '/admin/tables', '/admin/reservations', '/admin/customers', '/admin/analytics'],
      public_api: ['/v1/config', '/v1/menu', '/v1/auth', '/v1/orders', '/v1/reservations']
    }
  });
});

// ---- 404 Handler ----
app.use((req, res) => {
  res.status(404).json({ success: false, error: `Route ${req.method} ${req.path} not found` });
});

// ---- Global Error Handler ----
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message || 'Internal server error'
  });
});

// ---- Start Server ----
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('\n🍽️  ================================');
  console.log('   DineOS API v2.0 — Started!');
  console.log(`   Port     : ${PORT}`);
  console.log(`   Env      : ${process.env.NODE_ENV || 'development'}`);
  console.log('   ================================');
  console.log('\n   Super Admin   → POST /super/auth/login');
  console.log('   Restaurant    → POST /admin/auth/login');
  console.log('   Customer App  → POST /v1/auth/login');
  console.log('   Health        → GET  /health\n');
});

module.exports = app;
