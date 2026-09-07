-- +goose Up
-- COURIER-2026-006: immutable courier earning facts, explicit wallet buckets,
-- and statement categorisation for the courier payout surface.

ALTER TABLE order_legs
  ADD COLUMN IF NOT EXISTS courier_earning_settled_at TIMESTAMPTZ;

-- Existing terminal legs already represent settled earning facts. Backfill the
-- marker before installing the guard so historical rows receive the same
-- immutability contract as new deliveries.
UPDATE order_legs
SET courier_earning_settled_at = COALESCE(completed_at, updated_at, created_at, NOW())
WHERE courier_earning_settled_at IS NULL
  AND courier_id IS NOT NULL
  AND status IN ('delivered', 'cancelled');

-- A promotional/non-withdrawable credit is never eligible for payout, even if
-- an older writer accidentally labelled it available. The default is
-- withdrawable so ordinary delivery and incentive credits remain compatible;
-- non-withdrawable policy must be explicit in metadata.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION courier_ledger_is_withdrawable(p_metadata JSONB)
RETURNS BOOLEAN
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT CASE
    WHEN lower(COALESCE(p_metadata->>'withdrawable', '')) IN ('false', '0', 'no') THEN FALSE
    WHEN lower(COALESCE(p_metadata->>'non_withdrawable', '')) IN ('true', '1', 'yes') THEN FALSE
    WHEN lower(COALESCE(p_metadata->>'balance_bucket', '')) IN (
      'promotional', 'promo', 'held', 'non_withdrawable', 'non-withdrawable'
    ) THEN FALSE
    ELSE TRUE
  END;
$$;
-- +goose StatementEnd

-- Statement category is derived server-side. Metadata may explicitly declare
-- tax/fee/adjustment rows; legacy rows fall back to their canonical source.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION courier_ledger_statement_category(
  p_source TEXT,
  p_direction TEXT,
  p_transaction_type TEXT,
  p_metadata JSONB
)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT CASE
    WHEN lower(COALESCE(p_metadata->>'statement_category', p_metadata->>'category', '')) IN
      ('order', 'incentive', 'adjustment', 'tax', 'fee', 'payout')
      THEN lower(COALESCE(p_metadata->>'statement_category', p_metadata->>'category'))
    WHEN lower(COALESCE(p_transaction_type, '')) IN
      ('tax', 'tax_withholding', 'pph21', 'pph21_withholding') THEN 'tax'
    WHEN lower(COALESCE(p_transaction_type, '')) IN
      ('fee', 'platform_fee', 'payout_fee') THEN 'fee'
    WHEN lower(COALESCE(p_source, '')) = 'delivery' THEN 'order'
    WHEN lower(COALESCE(p_source, '')) = 'incentive' THEN 'incentive'
    WHEN lower(COALESCE(p_source, '')) IN ('adjustment', 'reversal') THEN 'adjustment'
    WHEN lower(COALESCE(p_source, '')) = 'payout' THEN 'payout'
    ELSE 'other'
  END;
$$;
-- +goose StatementEnd

-- Normalize all newly inserted non-withdrawable credits into the held bucket.
-- This is a database boundary, so payout callers cannot accidentally bypass
-- the policy by sending settlement_status = 'available'.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION normalize_courier_ledger_bucket()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.direction = 'credit' AND NOT courier_ledger_is_withdrawable(NEW.metadata) THEN
    NEW.settlement_status := 'held';
    NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb)
      || jsonb_build_object('balance_bucket', 'promotional', 'withdrawable', FALSE);
  END IF;
  RETURN NEW;
END;
$$;
-- +goose StatementEnd

DROP TRIGGER IF EXISTS trg_normalize_courier_ledger_bucket ON courier_earnings_ledger;
CREATE TRIGGER trg_normalize_courier_ledger_bucket
BEFORE INSERT ON courier_earnings_ledger
FOR EACH ROW
EXECUTE FUNCTION normalize_courier_ledger_bucket();

-- The earning breakdown is a settlement fact. Once the terminal earning event
-- has been recorded, operational updates may change workflow status but may
-- not rewrite money, policy, owner, or the snapshot. Corrections use an
-- append-only source='adjustment' ledger entry.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION guard_courier_earning_settlement()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.courier_earning_settled_at IS NOT NULL THEN
    IF NEW.order_id IS DISTINCT FROM OLD.order_id
       OR NEW.courier_id IS DISTINCT FROM OLD.courier_id
       OR NEW.assigned_fee_idr IS DISTINCT FROM OLD.assigned_fee_idr
       OR NEW.penalty_idr IS DISTINCT FROM OLD.penalty_idr
       OR NEW.idle_compensation_idr IS DISTINCT FROM OLD.idle_compensation_idr
       OR NEW.toll_reimbursement_idr IS DISTINCT FROM OLD.toll_reimbursement_idr
       OR NEW.return_compensation_idr IS DISTINCT FROM OLD.return_compensation_idr
       OR NEW.extra_service_compensation_idr IS DISTINCT FROM OLD.extra_service_compensation_idr
       OR NEW.cancellation_compensation_idr IS DISTINCT FROM OLD.cancellation_compensation_idr
       OR NEW.courier_earning_policy_snapshot IS DISTINCT FROM OLD.courier_earning_policy_snapshot
       OR NEW.courier_earning_components IS DISTINCT FROM OLD.courier_earning_components
       OR NEW.courier_earning_settled_at IS DISTINCT FROM OLD.courier_earning_settled_at THEN
      RAISE EXCEPTION
        'settled courier earning breakdown is immutable; use a compensating adjustment ledger entry';
    END IF;
  END IF;

  IF NEW.courier_earning_settled_at IS NULL
     AND NEW.courier_id IS NOT NULL
     AND NEW.status IN ('delivered', 'cancelled') THEN
    NEW.courier_earning_settled_at := NOW();
  END IF;
  RETURN NEW;
END;
$$;
-- +goose StatementEnd

DROP TRIGGER IF EXISTS trg_guard_courier_earning_settlement ON order_legs;
DROP TRIGGER IF EXISTS zz_guard_courier_earning_settlement ON order_legs;
CREATE TRIGGER zz_guard_courier_earning_settlement
BEFORE INSERT OR UPDATE ON order_legs
FOR EACH ROW
EXECUTE FUNCTION guard_courier_earning_settlement();

-- +goose Down
DROP TRIGGER IF EXISTS trg_guard_courier_earning_settlement ON order_legs;
DROP TRIGGER IF EXISTS zz_guard_courier_earning_settlement ON order_legs;
DROP FUNCTION IF EXISTS guard_courier_earning_settlement();
DROP TRIGGER IF EXISTS trg_normalize_courier_ledger_bucket ON courier_earnings_ledger;
DROP FUNCTION IF EXISTS normalize_courier_ledger_bucket();
DROP FUNCTION IF EXISTS courier_ledger_statement_category(TEXT, TEXT, TEXT, JSONB);
DROP FUNCTION IF EXISTS courier_ledger_is_withdrawable(JSONB);
ALTER TABLE order_legs
  DROP COLUMN IF EXISTS courier_earning_settled_at;
