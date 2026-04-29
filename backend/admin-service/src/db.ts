import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

// Load from root .env
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn('WARNING: DATABASE_URL is not set in .env. Falling back to default local connection.');
}

export const db = new Pool({
  connectionString: connectionString || 'postgresql://postgres:1234@localhost:5432/lancar?sslmode=disable',
});
