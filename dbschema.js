require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST, port: 5432,
  database: process.env.DB_NAME, user: process.env.DB_USER,
  password: process.env.DB_PASSWORD, ssl: { rejectUnauthorized: false }
});

async function run() {
  const tables = ['restaurants','users','menus','orders','order_items','subscriptions','features'];
  for (const t of tables) {
    try {
      const r = await pool.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='${t}' ORDER BY ordinal_position`);
      console.log(`\n=== ${t} ===`);
      r.rows.forEach(c => console.log(`  ${c.column_name} (${c.data_type})`));
    } catch(e) { console.log(`${t}: error - ${e.message}`); }
  }
  pool.end();
}
run();
