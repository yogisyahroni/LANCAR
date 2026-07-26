import { db } from './src/db';
import * as fs from 'fs';

async function run() {
  try {
    const sql0 = fs.readFileSync('./migrations/008_super_aggregator_3pl.sql', 'utf8');
    await db.query(sql0);
    console.log('Migration 008 successful');
    
    const sql1 = fs.readFileSync('./migrations/009_add_awb_sender_name.sql', 'utf8');
    await db.query(sql1);
    console.log('Migration 009 successful');
    
    const sql2 = fs.readFileSync('./migrations/010_add_provider_discounts.sql', 'utf8');
    await db.query(sql2);
    console.log('Migration 010 successful');
    
    const sql3 = fs.readFileSync('./migrations/011_cost_intelligence_opex_capex_jsonb.sql', 'utf8');
    await db.query(sql3);
    console.log('Migration 011 successful');
  } catch (e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
}
run();
