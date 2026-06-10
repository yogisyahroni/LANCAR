import { db } from './src/db';
import * as fs from 'fs';
async function run() {
  const sql = fs.readFileSync('../../database/migrations/20260610000003_add_batch_id_and_capacity.sql', 'utf8');
  await db.query(sql);
  console.log('Migration successful');
  process.exit(0);
}
run().catch(console.error);
