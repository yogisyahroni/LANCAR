-- +goose Up
-- FOOD-2026-021 / CRM-2026-003: provider-driven Food membership lifecycle.
-- The order-service remains the owner of the existing Food membership tables;
-- payment events are an append-only bridge and do not fabricate a payment.
ALTER TABLE food_membership_entitlements
  ADD COLUMN IF NOT EXISTS payment_intent_id UUID;

ALTER TABLE food_membership_entitlements
  DROP CONSTRAINT IF EXISTS food_membership_entitlements_status_check,
  ADD CONSTRAINT food_membership_entitlements_status_check
    CHECK (status IN ('pending_payment', 'active', 'grace', 'expired', 'cancelled', 'refunded'));

CREATE TABLE IF NOT EXISTS food_membership_payment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entitlement_id UUID NOT NULL REFERENCES food_membership_entitlements(id) ON DELETE RESTRICT,
  idempotency_key VARCHAR(180) NOT NULL UNIQUE,
  payment_state VARCHAR(16) NOT NULL CHECK (payment_state IN ('SUCCEEDED','FAILED','REFUNDED','CANCELLED')),
  resulting_status VARCHAR(24) NOT NULL CHECK (resulting_status IN ('pending_payment','active','grace','expired','cancelled','refunded')),
  payment_intent_id UUID,
  provider_reference VARCHAR(180),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_food_membership_payment_events_entitlement
  ON food_membership_payment_events(entitlement_id, created_at DESC);

-- +goose Down
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM food_membership_payment_events LIMIT 1) THEN
    RAISE EXCEPTION 'Food membership payment history exists; use a reviewed compensating migration';
  END IF;
END $$;
DROP INDEX IF EXISTS idx_food_membership_payment_events_entitlement;
DROP TABLE IF EXISTS food_membership_payment_events;
ALTER TABLE food_membership_entitlements
  DROP CONSTRAINT IF EXISTS food_membership_entitlements_status_check,
  ADD CONSTRAINT food_membership_entitlements_status_check
    CHECK (status IN ('pending_payment', 'active', 'expired', 'cancelled')),
  DROP COLUMN IF EXISTS payment_intent_id;
