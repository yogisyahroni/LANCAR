-- +goose Up
CREATE TABLE IF NOT EXISTS service_adjustments (
    id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id                    UUID NOT NULL REFERENCES orders(id),
    customer_id                 UUID NOT NULL REFERENCES users(id),
    requested_by_courier_id     UUID NOT NULL REFERENCES users(id),
    service_category            VARCHAR(40) NOT NULL CHECK (service_category IN ('tambal_ban','towing')),
    service_code                VARCHAR(80),
    service_sub_type            VARCHAR(80),
    reason                      TEXT NOT NULL,
    items                       JSONB NOT NULL CHECK (jsonb_typeof(items) = 'array'),
    initial_quote_id            VARCHAR(160) NOT NULL,
    initial_pricing_snapshot    JSONB NOT NULL,
    original_total_idr          BIGINT NOT NULL CHECK (original_total_idr >= 0),
    delta_idr                   BIGINT NOT NULL CHECK (delta_idr > 0),
    proposed_total_idr          BIGINT NOT NULL CHECK (proposed_total_idr = original_total_idr + delta_idr),
    approved_delta_idr          BIGINT NOT NULL DEFAULT 0 CHECK (approved_delta_idr >= 0),
    status                      VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
    financial_state             VARCHAR(30) NOT NULL DEFAULT 'not_due' CHECK (financial_state IN ('not_due','pending_collection','collected','waived','reversed')),
    proposal_idempotency_key    VARCHAR(160) NOT NULL,
    proposal_request_hash       VARCHAR(64) NOT NULL,
    decision_idempotency_key    VARCHAR(160),
    decision_request_hash       VARCHAR(64),
    approved_by_customer_id     UUID REFERENCES users(id),
    approved_at                 TIMESTAMPTZ,
    rejected_by_customer_id     UUID REFERENCES users(id),
    rejected_at                 TIMESTAMPTZ,
    rejection_reason            TEXT,
    correlation_id              VARCHAR(160),
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK ((status = 'approved' AND approved_by_customer_id IS NOT NULL AND approved_at IS NOT NULL AND approved_delta_idr = delta_idr AND financial_state = 'pending_collection') OR status <> 'approved'),
    CHECK ((status = 'rejected' AND rejected_by_customer_id IS NOT NULL AND rejected_at IS NOT NULL AND approved_delta_idr = 0 AND financial_state = 'not_due') OR status <> 'rejected')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_service_adjustment_proposal_intent
    ON service_adjustments(requested_by_courier_id, proposal_idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS uq_service_adjustment_pending_order
    ON service_adjustments(order_id) WHERE status = 'pending';
CREATE UNIQUE INDEX IF NOT EXISTS uq_service_adjustment_decision_intent
    ON service_adjustments(customer_id, decision_idempotency_key)
    WHERE decision_idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_service_adjustments_order_created
    ON service_adjustments(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_service_adjustments_customer_status
    ON service_adjustments(customer_id, status);

-- +goose Down
DROP TABLE IF EXISTS service_adjustments;
