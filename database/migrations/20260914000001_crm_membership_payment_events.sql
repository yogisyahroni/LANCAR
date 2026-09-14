-- +goose Up
CREATE TABLE IF NOT EXISTS crm_membership_payment_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entitlement_id UUID NOT NULL REFERENCES crm_membership_entitlements(id),
    idempotency_key VARCHAR(180) NOT NULL UNIQUE,
    payment_state VARCHAR(16) NOT NULL CHECK (payment_state IN ('SUCCEEDED','FAILED','REFUNDED','CANCELLED')),
    resulting_state VARCHAR(24) NOT NULL CHECK (resulting_state IN ('PENDING_PAYMENT','ACTIVE','GRACE','CANCELLED','EXPIRED','REFUNDED')),
    payment_intent_id UUID,
    provider_reference VARCHAR(180),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_membership_payment_events_entitlement
  ON crm_membership_payment_events(entitlement_id, created_at DESC);

-- +goose Down
-- Membership payment history is financial/audit history and must not be
-- removed automatically after it contains rows.
-- +goose StatementBegin
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM crm_membership_payment_events LIMIT 1) THEN
    RAISE EXCEPTION 'membership payment event history exists; use a reviewed compensating migration';
  END IF;
END $$;
-- +goose StatementEnd
DROP INDEX IF EXISTS idx_crm_membership_payment_events_entitlement;
DROP TABLE IF EXISTS crm_membership_payment_events;
