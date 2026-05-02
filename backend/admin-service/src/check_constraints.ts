import { db } from './db';

async function check() {
  try {
    const columns = await db.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'courier_profiles'
    `);
    console.log('Columns:');
    console.log(JSON.stringify(columns.rows, null, 2));
    
    const res = await db.query(`
      SELECT conname, pg_get_constraintdef(oid) 
      FROM pg_constraint 
      WHERE conrelid = 'courier_profiles'::regclass
    `);
    console.log('Constraints:');
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (e) {
    console.error(e);
  } finally {
    await db.end();
  }
}

check();
