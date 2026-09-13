-- +goose Up
-- Allow support to link a payment dispute without copying or mutating provider state.
ALTER TABLE support_case_links
  DROP CONSTRAINT IF EXISTS support_case_links_reference_type_check;
ALTER TABLE support_case_links
  ADD CONSTRAINT support_case_links_reference_type_check CHECK (
    reference_type IN ('order', 'payment', 'refund', 'chargeback', 'courier', 'merchant', 'carrier', 'proof', 'claim', 'reconciliation')
  );

-- +goose Down
-- +goose StatementBegin
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM support_case_links WHERE reference_type = 'chargeback' LIMIT 1) THEN
    RAISE EXCEPTION 'chargeback support links exist; use a reviewed compensating migration';
  END IF;
END $$;
-- +goose StatementEnd
ALTER TABLE support_case_links
  DROP CONSTRAINT IF EXISTS support_case_links_reference_type_check;
ALTER TABLE support_case_links
  ADD CONSTRAINT support_case_links_reference_type_check CHECK (
    reference_type IN ('order', 'payment', 'refund', 'courier', 'merchant', 'carrier', 'proof', 'claim', 'reconciliation')
  );
