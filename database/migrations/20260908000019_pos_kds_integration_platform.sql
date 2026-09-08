-- +goose Up
-- MERCH-2026-009: POS/KDS connector state, idempotent delivery and
-- reconciliation. Integration Gateway owns these projections; orders,
-- catalog and inventory remain canonical in their existing services.

CREATE TABLE IF NOT EXISTS pos_connector_health (
  provider_code         VARCHAR(64) PRIMARY KEY,
  provider_name         VARCHAR(120) NOT NULL,
  state                 VARCHAR(20) NOT NULL DEFAULT 'unknown'
                        CHECK (state IN ('healthy', 'degraded', 'unhealthy', 'unconfigured', 'unknown')),
  capabilities          JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_checked_at       TIMESTAMPTZ,
  last_latency_ms       BIGINT,
  consecutive_failures  INT NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  last_error             TEXT,
  availability_reason    TEXT,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pos_connector_bindings (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id    UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  branch_id      UUID REFERENCES merchant_branches(id) ON DELETE CASCADE,
  provider_code  VARCHAR(64) NOT NULL,
  enabled        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pos_connector_bindings_scope
  ON pos_connector_bindings (
    merchant_id,
    COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid),
    provider_code
  );
CREATE INDEX IF NOT EXISTS idx_pos_connector_bindings_merchant
  ON pos_connector_bindings (merchant_id, enabled, updated_at DESC);

CREATE TABLE IF NOT EXISTS pos_order_deliveries (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id           UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  branch_id             UUID REFERENCES merchant_branches(id) ON DELETE RESTRICT,
  order_id              UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  provider_code         VARCHAR(64) NOT NULL,
  idempotency_key       VARCHAR(160) NOT NULL,
  request_hash          CHAR(64) NOT NULL,
  status                VARCHAR(20) NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'acknowledged', 'failed')),
  merchant_received     BOOLEAN NOT NULL DEFAULT FALSE,
  customer_order_status VARCHAR(32) NOT NULL DEFAULT 'pending_merchant'
                        CHECK (customer_order_status = 'pending_merchant'),
  provider_receipt_id   VARCHAR(255),
  attempts              INT NOT NULL DEFAULT 1 CHECK (attempts > 0),
  lease_until           TIMESTAMPTZ,
  last_error            TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged_at       TIMESTAMPTZ,
  UNIQUE (provider_code, idempotency_key),
  UNIQUE (merchant_id, order_id, provider_code)
);

CREATE INDEX IF NOT EXISTS idx_pos_order_deliveries_reconciliation
  ON pos_order_deliveries (merchant_id, status, updated_at DESC)
  WHERE status <> 'acknowledged';
CREATE INDEX IF NOT EXISTS idx_pos_order_deliveries_order
  ON pos_order_deliveries (order_id, provider_code);

CREATE TABLE IF NOT EXISTS pos_sync_operations (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id        UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  branch_id          UUID REFERENCES merchant_branches(id) ON DELETE RESTRICT,
  provider_code      VARCHAR(64) NOT NULL,
  resource_type      VARCHAR(20) NOT NULL CHECK (resource_type IN ('catalog', 'inventory')),
  resource_id        VARCHAR(160) NOT NULL,
  canonical_version  BIGINT NOT NULL CHECK (canonical_version > 0),
  idempotency_key    VARCHAR(160) NOT NULL,
  request_hash       CHAR(64) NOT NULL,
  status             VARCHAR(20) NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'acknowledged', 'failed')),
  provider_receipt_id VARCHAR(255),
  attempts           INT NOT NULL DEFAULT 1 CHECK (attempts > 0),
  lease_until        TIMESTAMPTZ,
  last_error         TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged_at    TIMESTAMPTZ,
  UNIQUE (provider_code, resource_type, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_pos_sync_operations_reconciliation
  ON pos_sync_operations (merchant_id, status, updated_at DESC)
  WHERE status <> 'acknowledged';

-- Immutable operational history makes retries and provider disputes
-- explainable without treating logs as the source of truth.
CREATE TABLE IF NOT EXISTS pos_integration_events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type    VARCHAR(20) NOT NULL CHECK (entity_type IN ('order', 'sync')),
  entity_id      UUID NOT NULL,
  provider_code  VARCHAR(64) NOT NULL,
  event_type     VARCHAR(32) NOT NULL
                 CHECK (event_type IN ('dispatch_started', 'retry_started', 'acknowledged', 'failed', 'reconciled')),
  metadata       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pos_integration_events_entity
  ON pos_integration_events (entity_type, entity_id, created_at DESC);

CREATE TABLE IF NOT EXISTS pos_reconciliation_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id       UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  branch_id         UUID REFERENCES merchant_branches(id) ON DELETE RESTRICT,
  provider_code     VARCHAR(64) NOT NULL,
  resource_type     VARCHAR(20) NOT NULL CHECK (resource_type IN ('order', 'catalog', 'inventory')),
  resource_id       VARCHAR(160) NOT NULL,
  source_entity_id  UUID NOT NULL,
  status            VARCHAR(16) NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open', 'resolved')),
  local_status      VARCHAR(32) NOT NULL,
  merchant_received BOOLEAN NOT NULL DEFAULT FALSE,
  attempts          INT NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  reason            TEXT,
  first_seen_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at       TIMESTAMPTZ,
  UNIQUE (provider_code, resource_type, resource_id)
);
CREATE INDEX IF NOT EXISTS idx_pos_reconciliation_merchant
  ON pos_reconciliation_items (merchant_id, status, last_seen_at DESC);

-- +goose Down
DROP INDEX IF EXISTS idx_pos_reconciliation_merchant;
DROP TABLE IF EXISTS pos_reconciliation_items;
DROP INDEX IF EXISTS idx_pos_integration_events_entity;
DROP TABLE IF EXISTS pos_integration_events;
DROP INDEX IF EXISTS idx_pos_sync_operations_reconciliation;
DROP TABLE IF EXISTS pos_sync_operations;
DROP INDEX IF EXISTS idx_pos_order_deliveries_order;
DROP INDEX IF EXISTS idx_pos_order_deliveries_reconciliation;
DROP TABLE IF EXISTS pos_order_deliveries;
DROP INDEX IF EXISTS idx_pos_connector_bindings_merchant;
DROP INDEX IF EXISTS uq_pos_connector_bindings_scope;
DROP TABLE IF EXISTS pos_connector_bindings;
DROP TABLE IF EXISTS pos_connector_health;
