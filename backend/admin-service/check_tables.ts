import { db } from './src/db';
async function run() {
  const res = await db.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`);
  console.log(res.rows.map(r => r.table_name));
  process.exit(0);
}
run();
