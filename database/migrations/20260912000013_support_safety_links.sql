-- SAFE-2026-009: support may reference a safety incident without owning or
-- mutating the incident/order source of truth.
-- +goose Up
ALTER TABLE support_case_links
  DROP CONSTRAINT IF EXISTS support_case_links_reference_type_check;
ALTER TABLE support_case_links
  ADD CONSTRAINT support_case_links_reference_type_check CHECK (
    reference_type IN ('order', 'payment', 'refund', 'courier', 'merchant', 'carrier', 'proof', 'claim', 'reconciliation', 'chargeback', 'safety')
  );

-- +goose Down
-- Existing safety links must be reviewed before rollback; no history is
-- deleted implicitly.
-- +goose StatementBegin
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM support_case_links WHERE reference_type = 'safety') THEN
    RAISE EXCEPTION 'support case contains safety references; use a reviewed compensating migration';
  END IF;
END $$;
-- +goose StatementEnd
ALTER TABLE support_case_links
  DROP CONSTRAINT IF EXISTS support_case_links_reference_type_check;
ALTER TABLE support_case_links
  ADD CONSTRAINT support_case_links_reference_type_check CHECK (
    reference_type IN ('order', 'payment', 'refund', 'courier', 'merchant', 'carrier', 'proof', 'claim', 'reconciliation', 'chargeback')
  );
