const { Pool } = require('pg');
const { DB } = require('./env');

const pool = new Pool({
  ...DB,
  ssl: {
    rejectUnauthorized: false
  }
});

pool.connect()
  .then(() => console.log('✅ PostgreSQL connected'))
  .catch(err => console.error('❌ DB ERROR:', err.message));

module.exports = pool;