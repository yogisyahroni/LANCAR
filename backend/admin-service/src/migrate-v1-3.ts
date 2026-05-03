import { db } from './db';

async function runMigration() {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    console.log('Creating web_sessions table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS web_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        session_token VARCHAR(255) UNIQUE NOT NULL,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        ip_address VARCHAR(45),
        user_agent TEXT
      );
    `);

    console.log('Creating web_push_subscriptions table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS web_push_subscriptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        endpoint TEXT NOT NULL UNIQUE,
        auth_keys JSONB NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('Creating bulk_downloads table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS bulk_downloads (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status VARCHAR(50) DEFAULT 'pending',
        file_url TEXT,
        expires_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('Creating customer_analytics_cache table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS customer_analytics_cache (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        report_type VARCHAR(50) NOT NULL,
        data JSONB NOT NULL,
        last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Add indexes
    console.log('Creating indexes...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_web_sessions_user_id ON web_sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_web_sessions_token ON web_sessions(session_token);
      CREATE INDEX IF NOT EXISTS idx_web_push_subscriptions_user_id ON web_push_subscriptions(user_id);
      CREATE INDEX IF NOT EXISTS idx_bulk_downloads_user_id ON bulk_downloads(user_id);
      CREATE INDEX IF NOT EXISTS idx_customer_analytics_cache_user_report ON customer_analytics_cache(user_id, report_type);
    `);

    await client.query('COMMIT');
    console.log('Migration completed successfully!');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error);
    throw error;
  } finally {
    client.release();
    db.end();
  }
}

runMigration().catch(console.error);
