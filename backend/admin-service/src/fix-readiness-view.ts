import { db } from './db';

async function run() {
  try {
    console.log('Creating mv_readiness_three_legs table/view...');
    // Drop if exists to be safe
    await db.query(`DROP MATERIALIZED VIEW IF EXISTS mv_readiness_three_legs CASCADE`);
    await db.query(`DROP TABLE IF EXISTS mv_readiness_three_legs CASCADE`);
    
    // We'll create it as a regular table for now to avoid complex query dependencies
    await db.query(`
      CREATE TABLE mv_readiness_three_legs (
        id SERIAL PRIMARY KEY,
        readiness_data JSONB NOT NULL DEFAULT '{}'::jsonb,
        overall_ready BOOLEAN NOT NULL DEFAULT false,
        estimated_ready_in_weeks NUMERIC NOT NULL DEFAULT 0,
        can_activate BOOLEAN NOT NULL DEFAULT false,
        last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // Insert dummy data
    await db.query(`
      INSERT INTO mv_readiness_three_legs (
        readiness_data, overall_ready, estimated_ready_in_weeks, can_activate, last_updated
      ) VALUES (
        '{"api": "ready", "database": "ready", "frontend": "in_progress"}'::jsonb,
        false,
        2.5,
        false,
        NOW()
      )
    `);
    
    console.log('Successfully created mv_readiness_three_legs and inserted dummy data.');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await db.end();
  }
}

run();
