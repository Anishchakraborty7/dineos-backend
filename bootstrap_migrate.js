require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  host: process.env.DB_HOST, port: 5432,
  database: process.env.DB_NAME, user: process.env.DB_USER,
  password: process.env.DB_PASSWORD, ssl: { rejectUnauthorized: false }
});

async function run() {
  const client = await pool.connect();
  try {
    // Ensure _migrations table exists
    await client.query(`CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY, filename VARCHAR(255) UNIQUE NOT NULL, executed_at TIMESTAMP DEFAULT NOW()
    )`);

    // Mark 001 as done so migrate.js skips it
    await client.query(`INSERT INTO _migrations (filename) VALUES ('001_initial_schema.sql') ON CONFLICT (filename) DO NOTHING`);
    console.log('Marked 001_initial_schema.sql as done');

    // Run 002 directly
    const sql = fs.readFileSync(path.join(__dirname, 'src/db/migrations/002_schema_upgrade.sql'), 'utf8');
    await client.query('BEGIN');
    await client.query(sql);
    await client.query(`INSERT INTO _migrations (filename) VALUES ('002_schema_upgrade.sql') ON CONFLICT DO NOTHING`);
    await client.query('COMMIT');
    console.log('✅ Migration 002_schema_upgrade.sql ran successfully');

    // Mark future migrations as not needed (they are incorporated in 002)
    const toSkip = ['002_restaurant_users.sql','003_menu_system.sql','004_customers_orders.sql','005_tables_reservations.sql','006_subscriptions.sql'];
    for (const f of toSkip) {
      await client.query(`INSERT INTO _migrations (filename) VALUES ('${f}') ON CONFLICT (filename) DO NOTHING`);
    }
    console.log('Marked individual migrations as done (all incorporated in 002_schema_upgrade.sql)');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', e.message);
  } finally {
    client.release();
    pool.end();
  }
}
run();
