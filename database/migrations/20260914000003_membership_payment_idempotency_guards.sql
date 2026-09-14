-- +goose Up
-- CRM-2026-003: an idempotency key is a request identity, not an optional
-- field. Empty keys would collapse unrelated provider callbacks into one row.
ALTER TABLE crm_membership_payment_events
  DROP CONSTRAINT IF EXISTS crm_membership_payment_events_idempotency_key_check,
  ADD CONSTRAINT crm_membership_payment_events_idempotency_key_check
    CHECK (length(trim(idempotency_key)) >= 3);

ALTER TABLE food_membership_payment_events
  DROP CONSTRAINT IF EXISTS food_membership_payment_events_idempotency_key_check,
  ADD CONSTRAINT food_membership_payment_events_idempotency_key_check
    CHECK (length(trim(idempotency_key)) >= 3);

-- +goose Down
ALTER TABLE crm_membership_payment_events
  DROP CONSTRAINT IF EXISTS crm_membership_payment_events_idempotency_key_check;
ALTER TABLE food_membership_payment_events
  DROP CONSTRAINT IF EXISTS food_membership_payment_events_idempotency_key_check;
