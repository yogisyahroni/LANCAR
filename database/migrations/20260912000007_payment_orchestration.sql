-- +goose Up
-- PAYPLAT-2026: durable orchestration records. Provider raw evidence is kept
-- separately from normalized state; no client-writeable `paid` flag exists.
CREATE TABLE IF NOT EXISTS payment_intents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id),
    customer_id UUID NOT NULL REFERENCES users(id),
    market_code VARCHAR(32) NOT NULL,
    currency CHAR(3) NOT NULL,
    amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
    provider VARCHAR(64) NOT NULL,
    payment_method VARCHAR(64) NOT NULL,
    state VARCHAR(32) NOT NULL DEFAULT 'CREATED' CHECK (state IN (
      'CREATED','REQUIRES_ACTION','PROCESSING','AUTHORIZED','PAID',
      'CAPTURED','SETTLED','FAILED','CANCELLED','EXPIRED',
      'PARTIALLY_REFUNDED','REFUNDED','CHARGEBACK'
    )),
    provider_raw_status VARCHAR(128),
    provider_reference VARCHAR(255),
    routing_rule_version VARCHAR(128) NOT NULL,
    idempotency_key VARCHAR(128) NOT NULL,
    request_hash CHAR(64) NOT NULL,
    version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (idempotency_key),
    UNIQUE (provider, provider_reference)
);
CREATE INDEX IF NOT EXISTS idx_payment_intents_order ON payment_intents(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_intents_state ON payment_intents(state, updated_at DESC);

CREATE TABLE IF NOT EXISTS payment_intent_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    intent_id UUID NOT NULL REFERENCES payment_intents(id),
    event_id VARCHAR(255) NOT NULL,
    source VARCHAR(32) NOT NULL CHECK (source IN ('provider_webhook','client_return','lookup','reconciliation','admin')),
    provider_raw_status VARCHAR(128) NOT NULL,
    normalized_state VARCHAR(32) NOT NULL,
    provider_reference VARCHAR(255),
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    occurred_at TIMESTAMPTZ NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (intent_id, event_id)
);
CREATE INDEX IF NOT EXISTS idx_payment_intent_events_intent ON payment_intent_events(intent_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS payment_refunds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    intent_id UUID NOT NULL REFERENCES payment_intents(id),
    idempotency_key VARCHAR(128) NOT NULL,
    amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
    currency CHAR(3) NOT NULL,
    provider_reference VARCHAR(255),
    provider_raw_status VARCHAR(128),
    status VARCHAR(32) NOT NULL DEFAULT 'REQUESTED' CHECK (status IN ('REQUESTED','PROCESSING','SUCCEEDED','FAILED','UNKNOWN')),
    ledger_journal_id UUID REFERENCES ledger_journals(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (idempotency_key)
);

CREATE TABLE IF NOT EXISTS payment_refund_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    refund_id UUID NOT NULL REFERENCES payment_refunds(id),
    event_id VARCHAR(255) NOT NULL,
    provider_raw_status VARCHAR(128) NOT NULL,
    normalized_status VARCHAR(32) NOT NULL CHECK (normalized_status IN ('REQUESTED','PROCESSING','SUCCEEDED','FAILED','UNKNOWN')),
    provider_reference VARCHAR(255),
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    occurred_at TIMESTAMPTZ NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (refund_id, event_id)
);
CREATE INDEX IF NOT EXISTS idx_payment_refund_events_refund ON payment_refund_events(refund_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS payment_refund_ledger_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    refund_id UUID NOT NULL REFERENCES payment_refunds(id),
    intent_id UUID NOT NULL REFERENCES payment_intents(id),
    entry_type VARCHAR(16) NOT NULL CHECK (entry_type IN ('REFUND','REVERSAL')),
    provider_reference VARCHAR(255) NOT NULL,
    amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
    currency CHAR(3) NOT NULL,
    idempotency_key VARCHAR(180) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (refund_id, entry_type)
);
CREATE INDEX IF NOT EXISTS idx_payment_refund_ledger_intent ON payment_refund_ledger_entries(intent_id, created_at DESC);

CREATE TABLE IF NOT EXISTS payment_provider_health (
    provider VARCHAR(64) PRIMARY KEY,
    state VARCHAR(16) NOT NULL CHECK (state IN ('healthy','degraded','disabled')),
    allow_new_attempts BOOLEAN NOT NULL DEFAULT TRUE,
    reason TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS payment_method_catalog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    market_code VARCHAR(32) NOT NULL,
    currency CHAR(3) NOT NULL,
    payment_method VARCHAR(64) NOT NULL,
    provider VARCHAR(64) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    min_amount_minor BIGINT CHECK (min_amount_minor IS NULL OR min_amount_minor > 0),
    max_amount_minor BIGINT CHECK (max_amount_minor IS NULL OR max_amount_minor >= min_amount_minor),
    risk_context JSONB NOT NULL DEFAULT '{}'::jsonb,
    version BIGINT NOT NULL DEFAULT 1,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (market_code, currency, payment_method, provider)
);

CREATE TABLE IF NOT EXISTS payment_routing_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    market_code VARCHAR(32) NOT NULL,
    payment_method VARCHAR(64),
    provider VARCHAR(64) NOT NULL,
    reason TEXT NOT NULL,
    actor_id UUID NOT NULL REFERENCES users(id),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (expires_at > created_at)
);

CREATE TABLE IF NOT EXISTS payment_saved_methods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES users(id),
    market_code VARCHAR(32) NOT NULL,
    provider VARCHAR(64) NOT NULL,
    provider_token_reference VARCHAR(255) NOT NULL,
    method_type VARCHAR(64) NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (customer_id, provider, provider_token_reference)
);

CREATE TABLE IF NOT EXISTS payment_reconciliation_exceptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    intent_id UUID REFERENCES payment_intents(id),
    provider VARCHAR(64) NOT NULL,
    provider_reference VARCHAR(255),
    exception_type VARCHAR(64) NOT NULL,
    expected_state VARCHAR(32),
    actual_state VARCHAR(32),
    expected_amount_minor BIGINT,
    actual_amount_minor BIGINT,
    currency CHAR(3),
    provider_batch_date DATE,
    status VARCHAR(24) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','IN_REVIEW','RESOLVED','ACCEPTED')),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES users(id),
    resolution_note TEXT
);
CREATE INDEX IF NOT EXISTS idx_payment_reconciliation_queue ON payment_reconciliation_exceptions(status, last_seen_at DESC);

-- +goose Down
-- Financial history is not destructively rolled back. A rollback is only safe
-- before these tables contain records; goose operators must verify that first.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM payment_intents LIMIT 1)
     OR EXISTS (SELECT 1 FROM payment_refunds LIMIT 1)
     OR EXISTS (SELECT 1 FROM payment_intent_events LIMIT 1)
  THEN RAISE EXCEPTION 'payment orchestration migration contains financial history; use compensating migration'; END IF;
END $$;
DROP TABLE IF EXISTS payment_reconciliation_exceptions;
DROP TABLE IF EXISTS payment_refund_ledger_entries;
DROP TABLE IF EXISTS payment_refund_events;
DROP TABLE IF EXISTS payment_saved_methods;
DROP TABLE IF EXISTS payment_routing_overrides;
DROP TABLE IF EXISTS payment_method_catalog;
DROP TABLE IF EXISTS payment_provider_health;
DROP TABLE IF EXISTS payment_refunds;
DROP TABLE IF EXISTS payment_intent_events;
DROP TABLE IF EXISTS payment_intents;
