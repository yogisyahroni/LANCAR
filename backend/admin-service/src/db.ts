import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

// Load from root .env
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const connectionString = process.env.DATABASE_URL;
const readConnectionString = process.env.READ_DATABASE_URL || connectionString;

if (!connectionString) {
  console.warn('WARNING: DATABASE_URL is not set in .env. Falling back to default local connection.');
}

// Writer connection
export const db = new Pool({
  connectionString: connectionString || 'postgresql://postgres:1234@localhost:5432/lancar?sslmode=disable',
});

// Reader connection (Read Replica)
export const readDb = new Pool({
  connectionString: readConnectionString || 'postgresql://postgres:1234@localhost:5432/lancar?sslmode=disable',
});
