-- +goose Up
-- TIRE-2026-005: separate completion, collection and financial settlement.
-- Existing financial records are deliberately not backfilled as paid or settled.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- The original approval check accidentally made collection impossible.
-- +goose StatementBegin
DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
    WHERE conrelid = 'service_adjustments'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%approved_delta_idr%'
      AND pg_get_constraintdef(oid) LIKE '%pending_collection%'
      AND pg_get_constraintdef(oid) LIKE '%status%approved%'
  LOOP
    EXECUTE format('ALTER TABLE service_adjustments DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
-- +goose StatementEnd
ALTER TABLE service_adjustments ADD CONSTRAINT service_adjustments_financial_consistency CHECK (
  (status = 'pending' AND financial_state = 'not_due' AND approved_delta_idr = 0)
  OR (status = 'rejected' AND rejected_by_customer_id IS NOT NULL AND rejected_at IS NOT NULL
      AND approved_delta_idr = 0 AND financial_state = 'not_due')
  OR (status = 'approved' AND approved_by_customer_id IS NOT NULL AND approved_at IS NOT NULL
      AND approved_delta_idr = delta_idr AND financial_state IN ('pending_collection','collected','waived','reversed'))
);

ALTER TABLE payments ADD COLUMN IF NOT EXISTS purpose VARCHAR(30) NOT NULL DEFAULT 'order';
ALTER TABLE payments ADD COLUMN IF NOT EXISTS service_adjustment_id UUID REFERENCES service_adjustments(id);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS provider_verified_at TIMESTAMPTZ;
ALTER TABLE payments ADD CONSTRAINT payments_roadside_purpose CHECK (
  (purpose = 'order' AND service_adjustment_id IS NULL)
  OR (purpose = 'service_adjustment' AND service_adjustment_id IS NOT NULL)
);
-- Permit a separate payment per approved adjustment while retaining one initial payment.
-- +goose StatementBegin
DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
    WHERE conrelid = 'payments'::regclass AND contype = 'u'
      AND pg_get_constraintdef(oid) = 'UNIQUE (order_id)'
  LOOP EXECUTE format('ALTER TABLE payments DROP CONSTRAINT %I', c.conname); END LOOP;
END $$;
-- +goose StatementEnd
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_initial_order ON payments(order_id) WHERE purpose = 'order';
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_service_adjustment ON payments(service_adjustment_id) WHERE service_adjustment_id IS NOT NULL;
-- A provider transaction is a single financial fact, independent of purpose.
-- Existing duplicates are deliberately not merged or marked verified.
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_provider_transaction ON payments(provider, provider_reference)
  WHERE provider_reference IS NOT NULL;

CREATE TABLE IF NOT EXISTS roadside_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL UNIQUE REFERENCES orders(id),
  courier_id UUID NOT NULL REFERENCES users(id),
  report_id UUID NOT NULL REFERENCES tambal_ban_reports(id),
  source_snapshot JSONB NOT NULL,
  result_snapshot JSONB NOT NULL,
  evidence_hash TEXT NOT NULL CHECK (length(evidence_hash) = 64),
  gross_idr BIGINT NOT NULL CHECK (gross_idr > 0),
  courier_net_idr BIGINT NOT NULL CHECK (courier_net_idr >= 0 AND courier_net_idr <= gross_idr),
  withholding_idr BIGINT NOT NULL DEFAULT 0 CHECK (withholding_idr >= 0 AND withholding_idr <= courier_net_idr),
  ledger_journal_id UUID NOT NULL UNIQUE REFERENCES ledger_journals(id),
  payout_record_id UUID UNIQUE REFERENCES payout_records(id),
  status VARCHAR(20) NOT NULL DEFAULT 'finalized' CHECK (status = 'finalized'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (jsonb_typeof(source_snapshot) = 'object' AND jsonb_typeof(result_snapshot) = 'object')
);

-- A final report is one immutable record, never an editable claim source.
-- Duplicate legacy records require an explicit evidence reconciliation.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tambal_ban_reports_order ON tambal_ban_reports(order_id);
-- Preserve the original exact bytes used for evidence hashing on new records.
ALTER TABLE roadside_service_claims ADD COLUMN IF NOT EXISTS report_snapshot_bytes BYTEA;
ALTER TABLE roadside_service_ratings ADD COLUMN IF NOT EXISTS report_snapshot_bytes BYTEA;

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION roadside_materials_valid(value TEXT) RETURNS BOOLEAN AS $$
BEGIN
  IF value IS NULL THEN RETURN FALSE; END IF;
  RETURN jsonb_typeof(value::jsonb) = 'array';
EXCEPTION WHEN invalid_text_representation THEN
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION roadside_guard_report() RETURNS trigger AS $$
DECLARE assigned UUID;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'final roadside report is immutable';
  END IF;
  SELECT ol.courier_id INTO assigned FROM order_legs ol
    WHERE ol.order_id = NEW.order_id AND ol.leg_number = 1;
  IF assigned IS NULL OR NOT EXISTS (
    SELECT 1 FROM courier_profiles cp WHERE cp.id = NEW.courier_id AND cp.user_id = assigned
  ) OR NEW.completed_at IS NULL
    OR NULLIF(BTRIM(NEW.tire_condition_before),'') IS NULL
    OR NULLIF(BTRIM(NEW.tire_condition_after),'') IS NULL
    OR NULLIF(BTRIM(NEW.tire_photo_before_url),'') IS NULL
    OR NULLIF(BTRIM(NEW.tire_photo_after_url),'') IS NULL
    OR NEW.service_duration_minutes NOT BETWEEN 1 AND 1440
    OR NOT roadside_materials_valid(NEW.materials_used)
  THEN RAISE EXCEPTION 'invalid roadside final proof'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd
CREATE TRIGGER trg_roadside_final_report_guard BEFORE INSERT OR UPDATE OR DELETE ON tambal_ban_reports
 FOR EACH ROW EXECUTE FUNCTION roadside_guard_report();

-- The identity of the technician in the immutable report cannot be changed
-- by a later generic dispatch update. Corrections require audited reconciliation.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION roadside_guard_final_assignment() RETURNS trigger AS $$
BEGIN
 IF TG_OP='UPDATE' AND (NEW.courier_id,NEW.order_id,NEW.leg_number) IS DISTINCT FROM (OLD.courier_id,OLD.order_id,OLD.leg_number)
   AND (NEW.leg_number=1 OR OLD.leg_number=1)
   AND EXISTS(SELECT 1 FROM tambal_ban_reports WHERE order_id=OLD.order_id)
 THEN RAISE EXCEPTION 'final roadside technician assignment is immutable'; END IF;
 RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd
CREATE TRIGGER trg_roadside_final_assignment_guard BEFORE UPDATE ON order_legs
 FOR EACH ROW EXECUTE FUNCTION roadside_guard_final_assignment();

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION roadside_guard_evidence_bytes() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'roadside evidence is immutable'; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF (to_jsonb(NEW) - 'status' - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'updated_at') THEN
      RAISE EXCEPTION 'roadside evidence identity and contents are immutable';
    END IF;
  END IF;
  IF TG_OP='INSERT' AND NEW.report_snapshot_bytes IS NULL THEN
    RAISE EXCEPTION 'new roadside evidence requires immutable snapshot bytes';
  END IF;
  IF NEW.report_snapshot_bytes IS NOT NULL AND (
    encode(digest(NEW.report_snapshot_bytes,'sha256'),'hex') <> NEW.report_snapshot_hash
    OR convert_from(NEW.report_snapshot_bytes,'UTF8')::jsonb <> NEW.report_snapshot
  ) THEN RAISE EXCEPTION 'roadside evidence hash mismatch'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd
CREATE TRIGGER trg_roadside_claim_bytes_guard BEFORE INSERT OR UPDATE OR DELETE ON roadside_service_claims
 FOR EACH ROW EXECUTE FUNCTION roadside_guard_evidence_bytes();
CREATE TRIGGER trg_roadside_rating_bytes_guard BEFORE INSERT OR UPDATE OR DELETE ON roadside_service_ratings
 FOR EACH ROW EXECUTE FUNCTION roadside_guard_evidence_bytes();

-- Never let the generic 80% delivery journal accrue a roadside order.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION roadside_guard_legacy_ledger() RETURNS trigger AS $$
BEGIN
  IF NEW.journal_type IN ('order_delivered','courier_payout_accrual')
     OR NEW.idempotency_key LIKE 'LEDGER-DELIVERED-%' THEN
    IF EXISTS (SELECT 1 FROM orders o WHERE NEW.reference_type='order' AND o.id::text=NEW.reference_id
       AND (o.service_category='tambal_ban' OR o.service_sub_type LIKE 'tambal_ban_%'))
       OR EXISTS(SELECT 1 FROM payout_records p JOIN orders o ON o.id=COALESCE(p.order_id,
           (SELECT order_id FROM order_legs WHERE id=p.order_leg_id))
           WHERE NEW.reference_type='payout_record' AND p.id::text=NEW.reference_id
           AND (o.service_category='tambal_ban' OR o.service_sub_type LIKE 'tambal_ban_%'))
    THEN RAISE EXCEPTION 'roadside settlement must use authoritative finalizer'; END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd
CREATE TRIGGER trg_roadside_no_legacy_ledger BEFORE INSERT ON ledger_journals
 FOR EACH ROW EXECUTE FUNCTION roadside_guard_legacy_ledger();

-- A legacy caller cannot create a second, client-priced roadside payout.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION roadside_guard_payout() RETURNS trigger AS $$
DECLARE sid UUID; expected BIGINT; owner_id UUID; expected_tax BIGINT; settlement_payout UUID;
BEGIN
  IF NEW.order_id IS NULL AND NEW.order_leg_id IS NOT NULL THEN
    SELECT order_id INTO sid FROM order_legs WHERE id = NEW.order_leg_id;
  ELSE sid := NEW.order_id; END IF;
  IF sid IS NOT NULL AND EXISTS (SELECT 1 FROM orders WHERE id=sid
    AND (service_category='tambal_ban' OR service_sub_type LIKE 'tambal_ban_%')) THEN
    SELECT courier_net_idr,courier_id,withholding_idr,payout_record_id
      INTO expected,owner_id,expected_tax,settlement_payout FROM roadside_settlements WHERE order_id=sid;
    IF expected IS NULL OR owner_id IS DISTINCT FROM NEW.courier_id
       OR NEW.type <> 'leg_fee' OR NEW.gross_idr <> expected OR NEW.net_idr <> expected
       OR NEW.penalty_idr <> 0 OR NEW.idle_compensation_idr <> 0
       OR NEW.pph21_idr <> expected_tax
       OR NEW.order_id IS DISTINCT FROM sid
       OR NEW.disbursement_status NOT IN ('pending','processing','completed','failed')
       OR (settlement_payout IS NOT NULL AND settlement_payout<>NEW.id)
       OR EXISTS(SELECT 1 FROM payout_records p WHERE p.type='leg_fee' AND p.id<>NEW.id
           AND COALESCE(p.order_id,(SELECT order_id FROM order_legs WHERE id=p.order_leg_id))=sid)
    THEN RAISE EXCEPTION 'roadside payout requires authoritative settlement'; END IF;
    -- No generic batch may release a roadside payable. The dedicated provider
    -- release/reconciliation contract is intentionally not enabled by this migration.
    IF TG_OP='INSERT' AND NEW.disbursement_status<>'pending' THEN
      RAISE EXCEPTION 'roadside payout release is not enabled';
    END IF;
    IF TG_OP='UPDATE' AND NEW.disbursement_status IS DISTINCT FROM OLD.disbursement_status
       AND NEW.disbursement_status<>'pending' THEN
      RAISE EXCEPTION 'roadside payout release is not enabled';
    END IF;
    IF TG_OP = 'UPDATE' THEN
      IF (NEW.gross_idr,NEW.net_idr,NEW.courier_id,NEW.order_id,NEW.order_leg_id)
        IS DISTINCT FROM (OLD.gross_idr,OLD.net_idr,OLD.courier_id,OLD.order_id,OLD.order_leg_id)
      THEN RAISE EXCEPTION 'roadside payout amount and owner are immutable'; END IF;
      IF (NEW.penalty_idr,NEW.idle_compensation_idr,NEW.pph21_idr)
        IS DISTINCT FROM (OLD.penalty_idr,OLD.idle_compensation_idr,OLD.pph21_idr)
      THEN RAISE EXCEPTION 'roadside payout financial components are immutable'; END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd
CREATE TRIGGER trg_roadside_payout_guard BEFORE INSERT OR UPDATE ON payout_records
 FOR EACH ROW EXECUTE FUNCTION roadside_guard_payout();
-- The existing per-leg unique index remains authoritative for all services.
-- Do not impose one-leg-per-order on ordinary multi-leg deliveries.

-- Protect the settled money/evidence snapshot; only the payout linkage is fillable once.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION roadside_guard_settlement() RETURNS trigger AS $$
BEGIN
 IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'roadside settlement is immutable'; END IF;
 IF TG_OP = 'UPDATE' THEN
   IF (NEW.order_id,NEW.courier_id,NEW.report_id,NEW.source_snapshot,NEW.result_snapshot,
       NEW.evidence_hash,NEW.gross_idr,NEW.courier_net_idr,NEW.withholding_idr,NEW.ledger_journal_id,NEW.status)
      IS DISTINCT FROM
      (OLD.order_id,OLD.courier_id,OLD.report_id,OLD.source_snapshot,OLD.result_snapshot,
       OLD.evidence_hash,OLD.gross_idr,OLD.courier_net_idr,OLD.withholding_idr,OLD.ledger_journal_id,OLD.status)
      OR (OLD.payout_record_id IS NOT NULL AND NEW.payout_record_id IS DISTINCT FROM OLD.payout_record_id)
   THEN RAISE EXCEPTION 'roadside settlement is immutable'; END IF;
 END IF;
 RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd
CREATE TRIGGER trg_roadside_settlement_guard BEFORE UPDATE OR DELETE ON roadside_settlements
 FOR EACH ROW EXECUTE FUNCTION roadside_guard_settlement();

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION roadside_guard_collection_payment() RETURNS trigger AS $$
BEGIN
 IF TG_OP='UPDATE' AND OLD.provider_verified_at IS NOT NULL THEN
   IF NEW.provider_verified_at IS DISTINCT FROM OLD.provider_verified_at
      OR NEW.provider_reference IS DISTINCT FROM OLD.provider_reference
      OR NEW.paid_at IS DISTINCT FROM OLD.paid_at
      OR NEW.payment_number IS DISTINCT FROM OLD.payment_number
      OR NEW.amount_idr IS DISTINCT FROM OLD.amount_idr
      OR NEW.webhook_payload IS DISTINCT FROM OLD.webhook_payload
   THEN RAISE EXCEPTION 'verified payment evidence is immutable'; END IF;
 END IF;
 IF TG_OP='UPDATE' AND OLD.purpose='service_adjustment' THEN
   IF (NEW.order_id,NEW.payment_number,NEW.provider,NEW.purpose,NEW.service_adjustment_id,NEW.amount_idr)
     IS DISTINCT FROM (OLD.order_id,OLD.payment_number,OLD.provider,OLD.purpose,OLD.service_adjustment_id,OLD.amount_idr)
   THEN RAISE EXCEPTION 'roadside payment identity and amount are immutable'; END IF;
   IF OLD.status='paid' AND NEW.status<>'paid' THEN
     RAISE EXCEPTION 'verified roadside payment cannot be un-paid';
   END IF;
   IF OLD.provider_reference IS NOT NULL AND NEW.provider_reference IS DISTINCT FROM OLD.provider_reference THEN
     RAISE EXCEPTION 'roadside provider reference is immutable';
   END IF;
 END IF;
 IF NEW.provider_verified_at IS NOT NULL AND NEW.status IN ('paid','settled') THEN
   IF NEW.provider_reference IS NULL OR NEW.paid_at IS NULL OR NEW.webhook_payload IS NULL
     OR NEW.webhook_payload->>'order_id' IS DISTINCT FROM NEW.payment_number
     OR NEW.webhook_payload->>'transaction_id' IS DISTINCT FROM NEW.provider_reference
     OR NEW.webhook_payload->>'status_code'<>'200'
     OR NEW.webhook_payload->>'transaction_status' NOT IN ('settlement','capture')
     OR COALESCE(NEW.webhook_payload->>'fraud_status','accept') NOT IN ('accept','')
     OR NOT (NEW.webhook_payload->>'gross_amount' ~ '^[0-9]+(\.[0-9]+)?$')
     OR (NEW.webhook_payload->>'gross_amount')::numeric<>NEW.amount_idr
   THEN RAISE EXCEPTION 'verified payment evidence does not match provider transaction'; END IF;
 END IF;
 IF NEW.purpose='service_adjustment' AND NEW.status='paid'
    AND NEW.provider_verified_at IS NULL THEN
   RAISE EXCEPTION 'roadside payment requires verified provider evidence';
 END IF;
 RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd
CREATE TRIGGER trg_roadside_collection_payment_guard BEFORE INSERT OR UPDATE ON payments
 FOR EACH ROW EXECUTE FUNCTION roadside_guard_collection_payment();

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION roadside_guard_adjustment_collection() RETURNS trigger AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW.service_category='tambal_ban'
   AND EXISTS(SELECT 1 FROM roadside_settlements WHERE order_id=NEW.order_id)
   AND (NEW.status,NEW.financial_state,NEW.approved_delta_idr,NEW.delta_idr,NEW.proposed_total_idr)
      IS DISTINCT FROM (OLD.status,OLD.financial_state,OLD.approved_delta_idr,OLD.delta_idr,OLD.proposed_total_idr)
 THEN RAISE EXCEPTION 'finalized roadside adjustment requires separate reconciliation'; END IF;
 IF TG_OP='UPDATE' AND NEW.financial_state IS DISTINCT FROM OLD.financial_state
    AND NEW.service_category='tambal_ban' THEN
   IF NEW.financial_state='collected' THEN
     IF NEW.status<>'approved' OR NOT EXISTS(
       SELECT 1 FROM payments p WHERE p.service_adjustment_id=NEW.id
        AND p.order_id=NEW.order_id AND p.purpose='service_adjustment'
        AND p.status='paid' AND p.provider_verified_at IS NOT NULL
        AND p.amount_idr=NEW.approved_delta_idr
     ) THEN RAISE EXCEPTION 'verified adjustment collection is required'; END IF;
   ELSIF OLD.financial_state='collected' OR NEW.financial_state IN ('waived','reversed') THEN
     RAISE EXCEPTION 'roadside financial reversal requires separate audited reconciliation';
   END IF;
 END IF;
 RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd
CREATE TRIGGER trg_roadside_adjustment_collection_guard BEFORE UPDATE ON service_adjustments
 FOR EACH ROW EXECUTE FUNCTION roadside_guard_adjustment_collection();

-- +goose Down
-- Financial migrations must never silently remove paid adjustments or immutable
-- settlement evidence. Roll back only on a demonstrably empty, unapplied dataset.
-- +goose StatementBegin
DO $$
BEGIN
 IF EXISTS(SELECT 1 FROM roadside_settlements)
    OR EXISTS(SELECT 1 FROM payments WHERE purpose='service_adjustment')
    OR EXISTS(SELECT 1 FROM service_adjustments WHERE financial_state IN ('collected','waived','reversed'))
    OR EXISTS(SELECT 1 FROM roadside_service_claims WHERE report_snapshot_bytes IS NOT NULL)
    OR EXISTS(SELECT 1 FROM roadside_service_ratings WHERE report_snapshot_bytes IS NOT NULL)
 THEN RAISE EXCEPTION 'roadside financial/evidence records exist; use an audited forward migration, not destructive rollback'; END IF;
END;
$$;
-- +goose StatementEnd
DROP TRIGGER IF EXISTS trg_roadside_settlement_guard ON roadside_settlements;
DROP FUNCTION IF EXISTS roadside_guard_settlement();
DROP TRIGGER IF EXISTS trg_roadside_payout_guard ON payout_records;
DROP FUNCTION IF EXISTS roadside_guard_payout();
DROP TRIGGER IF EXISTS trg_roadside_no_legacy_ledger ON ledger_journals;
DROP FUNCTION IF EXISTS roadside_guard_legacy_ledger();
DROP TRIGGER IF EXISTS trg_roadside_rating_bytes_guard ON roadside_service_ratings;
DROP TRIGGER IF EXISTS trg_roadside_claim_bytes_guard ON roadside_service_claims;
DROP FUNCTION IF EXISTS roadside_guard_evidence_bytes();
DROP TRIGGER IF EXISTS trg_roadside_final_assignment_guard ON order_legs;
DROP FUNCTION IF EXISTS roadside_guard_final_assignment();
DROP TRIGGER IF EXISTS trg_roadside_final_report_guard ON tambal_ban_reports;
DROP FUNCTION IF EXISTS roadside_guard_report();
DROP FUNCTION IF EXISTS roadside_materials_valid(TEXT);
ALTER TABLE roadside_service_claims DROP COLUMN IF EXISTS report_snapshot_bytes;
ALTER TABLE roadside_service_ratings DROP COLUMN IF EXISTS report_snapshot_bytes;
DROP TABLE IF EXISTS roadside_settlements;
DROP TRIGGER IF EXISTS trg_roadside_adjustment_collection_guard ON service_adjustments;
DROP FUNCTION IF EXISTS roadside_guard_adjustment_collection();
DROP TRIGGER IF EXISTS trg_roadside_collection_payment_guard ON payments;
DROP FUNCTION IF EXISTS roadside_guard_collection_payment();
DROP INDEX IF EXISTS uq_payments_provider_transaction;
DROP INDEX IF EXISTS uq_payments_service_adjustment;
DROP INDEX IF EXISTS uq_payments_initial_order;
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_roadside_purpose;
ALTER TABLE payments DROP COLUMN IF EXISTS service_adjustment_id;
ALTER TABLE payments DROP COLUMN IF EXISTS purpose;
ALTER TABLE payments DROP COLUMN IF EXISTS provider_verified_at;
ALTER TABLE service_adjustments DROP CONSTRAINT IF EXISTS service_adjustments_financial_consistency;

-- Restore the original one-payment-per-order and approval contract only when
-- the rollback preflight has established that no new financial facts exist.
ALTER TABLE payments ADD CONSTRAINT payments_order_id_key UNIQUE(order_id);
ALTER TABLE service_adjustments ADD CONSTRAINT service_adjustments_financial_consistency CHECK (
 (status='approved' AND approved_by_customer_id IS NOT NULL AND approved_at IS NOT NULL
    AND approved_delta_idr=delta_idr AND financial_state='pending_collection')
 OR (status='rejected' AND rejected_by_customer_id IS NOT NULL AND rejected_at IS NOT NULL
    AND approved_delta_idr=0 AND financial_state='not_due')
 OR status<>'approved' AND status<>'rejected'
);
