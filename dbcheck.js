require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     5432,
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl:      { rejectUnauthorized: false }
});

pool.query(`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`)
  .then(r => {
    console.log('\nExisting tables in database:');
    r.rows.forEach(t => console.log('  - ' + t.tablename));
    pool.end();
  })
  .catch(e => { console.error('Error:', e.message); pool.end(); });
