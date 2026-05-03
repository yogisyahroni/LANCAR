import { db } from './db';

const check = async () => {
  const client = await db.connect();
  try {
    const table = 'courier_profiles';
    const columns = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = $1
    `, [table]);
    console.log(`Table: ${table}`);
    console.log(columns.rows.map(r => r.column_name).join(', '));
  } finally {
    client.release();
    await db.end();
  }
};

check();
