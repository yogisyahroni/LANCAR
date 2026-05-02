import { db } from './db';

const check = async () => {
  const client = await db.connect();
  try {
    const res = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    console.log('Tables:', res.rows.map(r => r.table_name).join(', '));
    
    const tablesToCheck = ['payout_records', 'payouts', 'order_events', 'payments', 'order_legs'];
    for (const table of tablesToCheck) {
      const exists = res.rows.some(r => r.table_name === table);
      if (exists) {
        const columns = await client.query(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = $1
        `, [table]);
        console.log(`Table: ${table}`);
        console.log(columns.rows.map(r => r.column_name).join(', '));
      } else {
        console.log(`Table ${table} does not exist.`);
      }
      console.log('---');
    }
  } finally {
    client.release();
    await db.end();
  }
};

check();
