import { Pool, PoolConfig } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

// Load from root .env
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const connectionString = process.env.DATABASE_URL;
const readConnectionString = process.env.READ_DATABASE_URL || connectionString;
const isProductionRuntime =
  process.env.NODE_ENV === 'production' || process.env.ENVIRONMENT === 'production';

if (!connectionString) {
  if (isProductionRuntime) {
    throw new Error('DATABASE_URL is required in production');
  }
  console.warn('WARNING: DATABASE_URL is not set in .env. Falling back to default local connection.');
}

const parseIntegerEnv = (name: string, fallback: number): number => {
  const rawValue = process.env[name];
  if (!rawValue) return fallback;
  const parsedValue = Number.parseInt(rawValue, 10);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : fallback;
};

const buildPoolConfig = (
  connection: string | undefined,
  role: 'writer' | 'reader',
): PoolConfig => {
  const defaultConnection = 'postgresql://postgres:1234@localhost:5432/lancar?sslmode=disable';
  const defaultMax = role === 'writer' ? 20 : 30;
  const max = parseIntegerEnv(
    role === 'writer' ? 'PG_POOL_MAX' : 'PG_READ_POOL_MAX',
    defaultMax,
  );

  return {
    connectionString: connection || defaultConnection,
    max,
    idleTimeoutMillis: parseIntegerEnv('PG_POOL_IDLE_TIMEOUT_MS', 30_000),
    connectionTimeoutMillis: parseIntegerEnv('PG_POOL_CONNECTION_TIMEOUT_MS', 5_000),
    statement_timeout: parseIntegerEnv('PG_STATEMENT_TIMEOUT_MS', 15_000),
    query_timeout: parseIntegerEnv('PG_QUERY_TIMEOUT_MS', 15_000),
    application_name: process.env.PG_APPLICATION_NAME || `lancar-admin-${role}`,
    keepAlive: true,
  };
};

const attachPoolErrorHandler = (pool: Pool, role: 'writer' | 'reader') => {
  pool.on('error', (error) => {
    console.error(JSON.stringify({
      level: 'error',
      event: 'postgres_pool_error',
      role,
      message: error.message,
      code: (error as any).code,
    }));
  });
};

// Writer connection
export const db = new Pool(buildPoolConfig(connectionString, 'writer'));

// Reader connection (Read Replica)
export const readDb = new Pool(buildPoolConfig(readConnectionString, 'reader'));

attachPoolErrorHandler(db, 'writer');
attachPoolErrorHandler(readDb, 'reader');
