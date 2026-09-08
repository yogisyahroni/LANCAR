-- +goose Up
-- GLOB-2026-011: scoped external developer API and durable webhook delivery.
-- External credentials are bcrypt-hashed; webhook signing secrets are encrypted
-- at rest and are returned only once during subscription creation.

-- +goose StatementBegin
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'tembus_developer') THEN
    CREATE ROLE tembus_developer WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
END $$;
-- +goose StatementEnd

GRANT USAGE ON SCHEMA public TO tembus_developer;

CREATE TABLE IF NOT EXISTS developer_api_clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id VARCHAR(40) NOT NULL UNIQUE,
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  name VARCHAR(160) NOT NULL,
  environment VARCHAR(16) NOT NULL CHECK (environment IN ('live', 'sandbox')),
  secret_hash BYTEA NOT NULL,
  scopes TEXT[] NOT NULL CHECK (cardinality(scopes) BETWEEN 1 AND 32),
  quota_per_minute INTEGER NOT NULL DEFAULT 60 CHECK (quota_per_minute BETWEEN 1 AND 10000),
  status VARCHAR(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS developer_webhook_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES developer_api_clients(id) ON DELETE CASCADE,
  endpoint_url TEXT NOT NULL,
  event_types TEXT[] NOT NULL CHECK (cardinality(event_types) BETWEEN 1 AND 32),
  secret_ciphertext BYTEA NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS developer_webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subscription_id UUID NOT NULL REFERENCES developer_webhook_subscriptions(id) ON DELETE CASCADE,
  source_event_id UUID NOT NULL REFERENCES event_outbox(id) ON DELETE RESTRICT,
  event_type VARCHAR(120) NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'delivering', 'succeeded', 'retry', 'dead')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  response_status INTEGER,
  last_error TEXT,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_attempt_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (subscription_id, source_event_id)
);

CREATE TABLE IF NOT EXISTS developer_api_idempotency (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES developer_api_clients(id) ON DELETE CASCADE,
  operation VARCHAR(80) NOT NULL,
  idempotency_key VARCHAR(160) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  state VARCHAR(16) NOT NULL DEFAULT 'processing'
    CHECK (state IN ('processing', 'completed', 'failed')),
  status_code INTEGER,
  response_hash CHAR(64),
  response_body JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, operation, idempotency_key)
);

CREATE TABLE IF NOT EXISTS developer_rate_limit_windows (
  client_id UUID NOT NULL REFERENCES developer_api_clients(id) ON DELETE CASCADE,
  window_start TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  PRIMARY KEY (client_id, window_start)
);

CREATE TABLE IF NOT EXISTS developer_sandbox_orders (
  id UUID PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES developer_api_clients(id) ON DELETE CASCADE,
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status VARCHAR(32) NOT NULL CHECK (status IN ('sandbox_created', 'cancelled')),
  request_body JSONB NOT NULL,
  response_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS developer_event_cursors (
  id SMALLINT PRIMARY KEY CHECK (id = 1),
  last_created_at TIMESTAMPTZ NOT NULL,
  last_event_id TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO developer_event_cursors (id, last_created_at, last_event_id)
VALUES (1, TIMESTAMPTZ '1970-01-01 00:00:00+00', '')
ON CONFLICT (id) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_developer_clients_owner
  ON developer_api_clients(owner_user_id, status);
CREATE INDEX IF NOT EXISTS idx_developer_subscriptions_client
  ON developer_webhook_subscriptions(client_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_developer_deliveries_ready
  ON developer_webhook_deliveries(status, next_attempt_at, created_at)
  WHERE status IN ('pending', 'retry');
CREATE INDEX IF NOT EXISTS idx_developer_deliveries_subscription
  ON developer_webhook_deliveries(subscription_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_developer_idempotency_cleanup
  ON developer_api_idempotency(created_at);
CREATE INDEX IF NOT EXISTS idx_developer_rate_windows_cleanup
  ON developer_rate_limit_windows(window_start);
CREATE INDEX IF NOT EXISTS idx_developer_sandbox_owner
  ON developer_sandbox_orders(client_id, owner_user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON developer_api_clients TO tembus_developer;
GRANT SELECT, INSERT, UPDATE ON developer_webhook_subscriptions TO tembus_developer;
GRANT SELECT, INSERT, UPDATE ON developer_webhook_deliveries TO tembus_developer;
GRANT SELECT, INSERT, UPDATE ON developer_api_idempotency TO tembus_developer;
GRANT SELECT, INSERT, UPDATE, DELETE ON developer_rate_limit_windows TO tembus_developer;
GRANT SELECT, INSERT, UPDATE ON developer_sandbox_orders TO tembus_developer;
GRANT SELECT, UPDATE ON developer_event_cursors TO tembus_developer;
GRANT SELECT ON event_outbox TO tembus_developer;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO tembus_developer;

-- +goose Down
REVOKE ALL ON event_outbox FROM tembus_developer;
REVOKE ALL ON developer_event_cursors FROM tembus_developer;
REVOKE ALL ON developer_sandbox_orders FROM tembus_developer;
REVOKE ALL ON developer_rate_limit_windows FROM tembus_developer;
REVOKE ALL ON developer_api_idempotency FROM tembus_developer;
REVOKE ALL ON developer_webhook_deliveries FROM tembus_developer;
REVOKE ALL ON developer_webhook_subscriptions FROM tembus_developer;
REVOKE ALL ON developer_api_clients FROM tembus_developer;
REVOKE USAGE ON SCHEMA public FROM tembus_developer;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM tembus_developer;
DROP INDEX IF EXISTS idx_developer_sandbox_owner;
DROP INDEX IF EXISTS idx_developer_rate_windows_cleanup;
DROP INDEX IF EXISTS idx_developer_idempotency_cleanup;
DROP INDEX IF EXISTS idx_developer_deliveries_subscription;
DROP INDEX IF EXISTS idx_developer_deliveries_ready;
DROP INDEX IF EXISTS idx_developer_subscriptions_client;
DROP INDEX IF EXISTS idx_developer_clients_owner;
DROP TABLE IF EXISTS developer_event_cursors;
DROP TABLE IF EXISTS developer_sandbox_orders;
DROP TABLE IF EXISTS developer_rate_limit_windows;
DROP TABLE IF EXISTS developer_api_idempotency;
DROP TABLE IF EXISTS developer_webhook_deliveries;
DROP TABLE IF EXISTS developer_webhook_subscriptions;
DROP TABLE IF EXISTS developer_api_clients;
-- Role lifecycle is managed at the cluster/platform level. Do not DROP ROLE
-- here: a deployment may reuse the least-privilege role in another database,
-- and PostgreSQL rejects dropping roles with cross-database ACL dependencies.
