const { Pool } = require('pg');

const isCloudDb = process.env.DB_HOST &&
  !process.env.DB_HOST.includes('localhost') &&
  !process.env.DB_HOST.includes('127.0.0.1');

const pool = new Pool({
  host:                   process.env.DB_HOST || 'localhost',
  port:                   parseInt(process.env.DB_PORT) || 5432,
  database:               process.env.DB_NAME || 'dineos_db',
  user:                   process.env.DB_USER || 'postgres',
  password:               process.env.DB_PASSWORD,
  max:                    10,
  idleTimeoutMillis:      60000,
  connectionTimeoutMillis: 15000,    // 15s — Render free tier wakes slowly
  ssl: isCloudDb ? { rejectUnauthorized: false } : false
});

pool.on('error', (err) => {
  console.error('PostgreSQL pool error:', err.message);
});

// Lazy connection test — just log after first successful query
let connected = false;
pool.on('connect', () => {
  if (!connected) {
    connected = true;
    console.log('✅ PostgreSQL connected:', process.env.DB_NAME || 'dineos_db');
  }
});

// Keep-alive ping every 4 minutes for Render free tier
if (isCloudDb) {
  setInterval(() => {
    pool.query('SELECT 1').catch(err => {
      console.warn('Keep-alive ping failed:', err.message);
    });
  }, 4 * 60 * 1000);
}

module.exports = pool;
