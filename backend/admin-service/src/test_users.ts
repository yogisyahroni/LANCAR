import { db } from './db';

const test = async () => {
  const client = await db.connect();
  try {
    const res = await client.query(`
      SELECT id, full_name, email, role, pin_hash 
      FROM users 
      LIMIT 5
    `);
    console.log(JSON.stringify(res.rows, null, 2));
  } finally {
    client.release();
    await db.end();
  }
};

test();
