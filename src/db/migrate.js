/**
 * DineOS Database Migration Runner
 * Run with: npm run migrate
 *
 * Executes all .sql files in src/db/migrations/ in alphabetical order.
 * Tracks which migrations have run in the _migrations table to prevent re-runs.
 */

require('dotenv').config();
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const isCloudDb = process.env.DB_HOST &&
  !process.env.DB_HOST.includes('localhost') &&
  !process.env.DB_HOST.includes('127.0.0.1');

// Build a connection URL so Render honours sslmode=require reliably
const connectionString = process.env.DATABASE_URL ||
  `postgresql://${process.env.DB_USER}:${encodeURIComponent(process.env.DB_PASSWORD)}@${process.env.DB_HOST}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME}${isCloudDb ? '?sslmode=require' : ''}`;

function makeClient() {
  return new Client({
    connectionString,
    ssl: isCloudDb ? { rejectUnauthorized: false } : false,
  });
}

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

const migrate = async () => {
  const client = makeClient();
  await client.connect();

  try {
    console.log('\n🔄 DineOS Migration Runner');
    console.log('   Database:', process.env.DB_NAME || 'dineos_db');
    console.log('   Host:', process.env.DB_HOST || 'localhost');
    console.log('');

    // Create migrations tracking table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id           SERIAL PRIMARY KEY,
        filename     VARCHAR(255) UNIQUE NOT NULL,
        executed_at  TIMESTAMP DEFAULT NOW()
      )
    `);

    // Get all SQL migration files, sorted alphabetically
    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort();

    if (files.length === 0) {
      console.log('   No migration files found.');
      return;
    }

    let executedCount = 0;
    let skippedCount = 0;

    for (const file of files) {
      // Check if already executed
      const check = await client.query(
        'SELECT id FROM _migrations WHERE filename = $1',
        [file]
      );

      if (check.rows.length > 0) {
        console.log(`   ⏭️  Skip  ${file} (already run)`);
        skippedCount++;
        continue;
      }

      // Execute migration
      const sqlPath = path.join(MIGRATIONS_DIR, file);
      const sql = fs.readFileSync(sqlPath, 'utf8');

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO _migrations (filename) VALUES ($1)',
          [file]
        );
        await client.query('COMMIT');
        console.log(`   ✅ Ran   ${file}`);
        executedCount++;
      } catch (sqlErr) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${sqlErr.message}`);
      }
    }

    console.log('');
    console.log(`   ✅ Done! Ran: ${executedCount}, Skipped: ${skippedCount}`);
    console.log('');

  } catch (err) {
    console.error('\n   ❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
};

migrate();
