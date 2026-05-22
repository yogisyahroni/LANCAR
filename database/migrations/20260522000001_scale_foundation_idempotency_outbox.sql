-- +goose Up
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS api_idempotency_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scope VARCHAR(100) NOT NULL,
    actor_key TEXT NOT NULL,
    actor_type VARCHAR(40) NOT NULL DEFAULT 'unknown',
    idempotency_key TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    response_hash TEXT,
    status_code INTEGER,
    response_body JSONB,
    state VARCHAR(20) NOT NULL DEFAULT 'processing'
        CHECK (state IN ('processing', 'completed', 'failed')),
    device_id TEXT,
    ip_hash TEXT,
    user_agent_hash TEXT,
    locked_until TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '2 minutes',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (scope, actor_key, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_api_idempotency_actor_recent
    ON api_idempotency_keys (scope, actor_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_api_idempotency_state_lock
    ON api_idempotency_keys (state, locked_until)
    WHERE state = 'processing';

CREATE TABLE IF NOT EXISTS event_outbox (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    aggregate_type VARCHAR(80) NOT NULL,
    aggregate_id UUID,
    event_type VARCHAR(120) NOT NULL,
    event_version INTEGER NOT NULL DEFAULT 1,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    headers JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'published', 'retry', 'dead')),
    attempts INTEGER NOT NULL DEFAULT 0,
    available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    locked_at TIMESTAMPTZ,
    locked_by TEXT,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    published_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_event_outbox_ready
    ON event_outbox (status, available_at, created_at)
    WHERE status IN ('pending', 'retry');

CREATE INDEX IF NOT EXISTS idx_event_outbox_aggregate
    ON event_outbox (aggregate_type, aggregate_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_event_outbox_type_created
    ON event_outbox (event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_customer_history_scale
    ON orders (customer_id, created_at DESC)
    WHERE customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_dispatch_open_scale
    ON orders (model, status, created_at, id)
    WHERE status IN ('paid', 'dispatching', 'assigned', 'accepted');

CREATE INDEX IF NOT EXISTS idx_payments_order_status_scale
    ON payments (order_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_route_snapshot_hash_scale
    ON orders ((route_snapshot->>'snapshot_hash'))
    WHERE route_snapshot IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_order_events_order_recent_scale
    ON order_events (order_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_order_events_type_recent_scale
    ON order_events (event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_order_legs_courier_active_scale
    ON order_legs (courier_id, status, updated_at DESC)
    WHERE courier_id IS NOT NULL
      AND status IN ('assigned', 'accepted', 'pickup_arrived', 'picked_up', 'in_transit');

CREATE INDEX IF NOT EXISTS idx_courier_locations_latest_scale
    ON courier_locations (courier_id, order_id, recorded_at DESC)
    WHERE COALESCE(is_spoofed, FALSE) = FALSE;

CREATE INDEX IF NOT EXISTS idx_courier_offer_dispatches_expiry_scale
    ON courier_offer_dispatches (status, expires_at, rank_number)
    WHERE status = 'offered';

CREATE INDEX IF NOT EXISTS idx_courier_offer_dispatches_order_status_scale
    ON courier_offer_dispatches (order_id, status, rank_number);

-- +goose Down
DROP INDEX IF EXISTS idx_courier_offer_dispatches_order_status_scale;
DROP INDEX IF EXISTS idx_courier_offer_dispatches_expiry_scale;
DROP INDEX IF EXISTS idx_courier_locations_latest_scale;
DROP INDEX IF EXISTS idx_order_legs_courier_active_scale;
DROP INDEX IF EXISTS idx_order_events_type_recent_scale;
DROP INDEX IF EXISTS idx_order_events_order_recent_scale;
DROP INDEX IF EXISTS idx_orders_route_snapshot_hash_scale;
DROP INDEX IF EXISTS idx_payments_order_status_scale;
DROP INDEX IF EXISTS idx_orders_dispatch_open_scale;
DROP INDEX IF EXISTS idx_orders_customer_history_scale;
DROP INDEX IF EXISTS idx_event_outbox_type_created;
DROP INDEX IF EXISTS idx_event_outbox_aggregate;
DROP INDEX IF EXISTS idx_event_outbox_ready;
DROP TABLE IF EXISTS event_outbox;
DROP INDEX IF EXISTS idx_api_idempotency_state_lock;
DROP INDEX IF EXISTS idx_api_idempotency_actor_recent;
DROP TABLE IF EXISTS api_idempotency_keys;
