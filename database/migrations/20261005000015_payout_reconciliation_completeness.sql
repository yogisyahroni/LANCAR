-- +goose Up
-- Reconciliation must surface ambiguous provider state and a failed payout
-- without the compensating ledger credit. These are exception signals only;
-- this migration never mutates ledger truth automatically.
ALTER TABLE courier_payout_reconciliation_items
  DROP CONSTRAINT IF EXISTS courier_payout_reconciliation_items_check_type_check;

ALTER TABLE courier_payout_reconciliation_items
  ADD CONSTRAINT courier_payout_reconciliation_items_check_type_check
    CHECK (check_type IN (
      'ledger_vs_request',
      'request_vs_provider',
      'paid_amount_vs_ledger',
      'unknown_provider_state',
      'payout_failure_without_reversal',
      'provider_latency_high',
      'pending_too_long',
      'webhook_missing'
    ));

-- +goose Down
DELETE FROM courier_payout_reconciliation_items
WHERE check_type IN ('unknown_provider_state', 'payout_failure_without_reversal');

ALTER TABLE courier_payout_reconciliation_items
  DROP CONSTRAINT IF EXISTS courier_payout_reconciliation_items_check_type_check;

ALTER TABLE courier_payout_reconciliation_items
  ADD CONSTRAINT courier_payout_reconciliation_items_check_type_check
    CHECK (check_type IN (
      'ledger_vs_request',
      'request_vs_provider',
      'paid_amount_vs_ledger',
      'provider_latency_high',
      'pending_too_long',
      'webhook_missing'
    ));
