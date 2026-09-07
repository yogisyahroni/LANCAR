-- +goose Up
-- TIRE-2026-005: close direct-SQL bypasses and serialize financial evidence.
-- These additional guards retain the original safety migration and can be
-- removed independently only while there are no protected financial facts.

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION roadside_financial_order_id(p_order UUID) RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM orders WHERE id=p_order AND
    (service_category='tambal_ban' OR service_sub_type LIKE 'tambal_ban_%'));
END;
$$ LANGUAGE plpgsql STABLE;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION roadside_lock_report_order() RETURNS trigger AS $$
DECLARE oid UUID;
BEGIN
  oid := CASE WHEN TG_OP='DELETE' THEN OLD.order_id ELSE NEW.order_id END;
  PERFORM 1 FROM orders WHERE id=oid FOR UPDATE;
  IF TG_OP='UPDATE' AND NEW.order_id IS DISTINCT FROM OLD.order_id THEN
    RAISE EXCEPTION 'roadside report order identity is immutable';
  END IF;
  IF TG_OP='INSERT' AND EXISTS(SELECT 1 FROM roadside_settlements WHERE order_id=oid) THEN
    RAISE EXCEPTION 'roadside settlement already finalized';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd
CREATE TRIGGER trg_roadside_financial_report_lock BEFORE INSERT OR UPDATE OR DELETE ON tambal_ban_reports
 FOR EACH ROW EXECUTE FUNCTION roadside_lock_report_order();

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION roadside_lock_payment_order() RETURNS trigger AS $$
DECLARE oid UUID; old_roadside BOOLEAN := FALSE; new_roadside BOOLEAN := FALSE;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    old_roadside := roadside_financial_order_id(OLD.order_id);
  END IF;
  IF TG_OP <> 'DELETE' THEN
    new_roadside := roadside_financial_order_id(NEW.order_id);
  END IF;
  IF TG_OP <> 'DELETE' AND NEW.purpose='service_adjustment' AND NOT EXISTS(
    SELECT 1 FROM service_adjustments a WHERE a.id=NEW.service_adjustment_id
      AND a.order_id=NEW.order_id AND a.status='approved' AND a.approved_delta_idr=NEW.amount_idr
  ) THEN RAISE EXCEPTION 'adjustment payment must match its approved source'; END IF;
  IF NOT old_roadside AND NOT new_roadside THEN
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  oid := CASE WHEN TG_OP='DELETE' THEN OLD.order_id ELSE NEW.order_id END;
  IF TG_OP='UPDATE' AND OLD.order_id IS DISTINCT FROM NEW.order_id THEN
    RAISE EXCEPTION 'roadside payment cannot be reassigned';
  END IF;
  PERFORM 1 FROM orders WHERE id=oid FOR UPDATE;
  IF TG_OP='DELETE' THEN
    IF OLD.provider_verified_at IS NOT NULL OR EXISTS(SELECT 1 FROM roadside_settlements WHERE order_id=oid) THEN
      RAISE EXCEPTION 'verified roadside payment cannot be deleted';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP='UPDATE' AND
     (NEW.order_id,NEW.payment_number,NEW.provider,NEW.purpose,NEW.service_adjustment_id,NEW.amount_idr)
       IS DISTINCT FROM
     (OLD.order_id,OLD.payment_number,OLD.provider,OLD.purpose,OLD.service_adjustment_id,OLD.amount_idr) THEN
    RAISE EXCEPTION 'roadside payment identity and amount are immutable';
  END IF;
  IF NEW.purpose='service_adjustment' AND NOT EXISTS(
    SELECT 1 FROM service_adjustments a WHERE a.id=NEW.service_adjustment_id
      AND a.order_id=NEW.order_id AND a.status='approved' AND a.approved_delta_idr=NEW.amount_idr
  ) THEN RAISE EXCEPTION 'roadside payment must match its approved adjustment'; END IF;
  IF EXISTS(SELECT 1 FROM roadside_settlements WHERE order_id=oid) THEN
    IF TG_OP='INSERT' THEN
      RAISE EXCEPTION 'cannot add a payment after roadside settlement';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.provider_verified_at IS DISTINCT FROM OLD.provider_verified_at
       OR NEW.paid_at IS DISTINCT FROM OLD.paid_at
       OR NEW.provider_reference IS DISTINCT FROM OLD.provider_reference
       OR NEW.webhook_payload IS DISTINCT FROM OLD.webhook_payload THEN
      RAISE EXCEPTION 'finalized roadside payment requires audited reconciliation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd
CREATE TRIGGER trg_roadside_financial_payment_lock BEFORE INSERT OR UPDATE OR DELETE ON payments
 FOR EACH ROW EXECUTE FUNCTION roadside_lock_payment_order();

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION roadside_lock_adjustment_order() RETURNS trigger AS $$
DECLARE oid UUID;
BEGIN
  oid := CASE WHEN TG_OP='DELETE' THEN OLD.order_id ELSE NEW.order_id END;
  IF NOT roadside_financial_order_id(oid) THEN
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP='UPDATE' AND NEW.order_id IS DISTINCT FROM OLD.order_id THEN
    RAISE EXCEPTION 'roadside adjustment cannot be reassigned';
  END IF;
  PERFORM 1 FROM orders WHERE id=oid FOR UPDATE;
  IF TG_OP='DELETE' THEN
    IF OLD.status<>'pending' OR EXISTS(SELECT 1 FROM roadside_settlements WHERE order_id=oid) THEN
      RAISE EXCEPTION 'decided roadside adjustment is immutable';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP='UPDATE' AND OLD.status<>'pending' AND
     (NEW.customer_id,NEW.requested_by_courier_id,NEW.service_category,NEW.service_code,
      NEW.service_sub_type,NEW.reason,NEW.items,NEW.initial_quote_id,NEW.initial_pricing_snapshot,
      NEW.original_total_idr,NEW.delta_idr,NEW.proposed_total_idr,NEW.approved_delta_idr,
      NEW.status,NEW.approved_by_customer_id,NEW.approved_at,NEW.rejected_by_customer_id,
      NEW.rejected_at,NEW.proposal_idempotency_key,NEW.proposal_request_hash,
      NEW.decision_idempotency_key,NEW.decision_request_hash)
       IS DISTINCT FROM
     (OLD.customer_id,OLD.requested_by_courier_id,OLD.service_category,OLD.service_code,
      OLD.service_sub_type,OLD.reason,OLD.items,OLD.initial_quote_id,OLD.initial_pricing_snapshot,
      OLD.original_total_idr,OLD.delta_idr,OLD.proposed_total_idr,OLD.approved_delta_idr,
      OLD.status,OLD.approved_by_customer_id,OLD.approved_at,OLD.rejected_by_customer_id,
      OLD.rejected_at,OLD.proposal_idempotency_key,OLD.proposal_request_hash,
      OLD.decision_idempotency_key,OLD.decision_request_hash) THEN
    RAISE EXCEPTION 'decided roadside adjustment evidence is immutable';
  END IF;
  IF EXISTS(SELECT 1 FROM roadside_settlements WHERE order_id=oid) THEN
    IF TG_OP='INSERT' THEN
      RAISE EXCEPTION 'cannot add an adjustment after roadside settlement';
    END IF;
    IF NEW.financial_state IS DISTINCT FROM OLD.financial_state THEN
      RAISE EXCEPTION 'finalized roadside adjustment requires audited reconciliation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd
CREATE TRIGGER trg_roadside_financial_adjustment_lock BEFORE INSERT OR UPDATE OR DELETE ON service_adjustments
 FOR EACH ROW EXECUTE FUNCTION roadside_lock_adjustment_order();

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION roadside_guard_order_financial_snapshot() RETURNS trigger AS $$
DECLARE has_report BOOLEAN;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NOT (roadside_financial_order_id(OLD.id) OR NEW.service_category='tambal_ban' OR NEW.service_sub_type LIKE 'tambal_ban_%') THEN
      RETURN NEW;
    END IF;
  ELSIF NOT roadside_financial_order_id(OLD.id) THEN
    RETURN OLD;
  END IF;
  has_report := EXISTS(SELECT 1 FROM tambal_ban_reports WHERE order_id=OLD.id);
  IF TG_OP='DELETE' THEN
    IF has_report OR EXISTS(SELECT 1 FROM roadside_settlements WHERE order_id=OLD.id) THEN
      RAISE EXCEPTION 'roadside financial order cannot be deleted';
    END IF;
    RETURN OLD;
  END IF;
  IF (has_report OR EXISTS(SELECT 1 FROM payments WHERE order_id=OLD.id)
       OR EXISTS(SELECT 1 FROM service_adjustments WHERE order_id=OLD.id)
       OR EXISTS(SELECT 1 FROM roadside_settlements WHERE order_id=OLD.id)) AND
    (NEW.service_category,NEW.service_sub_type,NEW.customer_id)
      IS DISTINCT FROM (OLD.service_category,OLD.service_sub_type,OLD.customer_id) THEN
    RAISE EXCEPTION 'final roadside order identity is immutable';
  END IF;
  IF EXISTS(SELECT 1 FROM roadside_settlements WHERE order_id=OLD.id) THEN
    IF (NEW.total_price_idr,NEW.base_price_idr,NEW.distance_fee_idr,NEW.pricing_snapshot,
        NEW.service_code,NEW.service_category,NEW.service_sub_type,NEW.customer_id)
       IS DISTINCT FROM
       (OLD.total_price_idr,OLD.base_price_idr,OLD.distance_fee_idr,OLD.pricing_snapshot,
        OLD.service_code,OLD.service_category,OLD.service_sub_type,OLD.customer_id)
       OR NEW.status IN ('cancelled','failed','rejected') THEN
      RAISE EXCEPTION 'finalized roadside financial order requires audited reconciliation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd
CREATE TRIGGER trg_roadside_financial_order_guard BEFORE UPDATE OR DELETE ON orders
 FOR EACH ROW EXECUTE FUNCTION roadside_guard_order_financial_snapshot();

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION roadside_guard_payout_binding() RETURNS trigger AS $$
DECLARE old_oid UUID; new_oid UUID; old_leg_oid UUID; new_leg_oid UUID; oid UUID; expected_id UUID;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    old_oid := OLD.order_id;
    SELECT order_id INTO old_leg_oid FROM order_legs WHERE id=OLD.order_leg_id;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    new_oid := NEW.order_id;
    SELECT order_id INTO new_leg_oid FROM order_legs WHERE id=NEW.order_leg_id;
  END IF;
  IF NOT (roadside_financial_order_id(old_oid) OR roadside_financial_order_id(old_leg_oid)
          OR roadside_financial_order_id(new_oid) OR roadside_financial_order_id(new_leg_oid)) THEN
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  oid := COALESCE(old_oid,old_leg_oid,new_oid,new_leg_oid);
  PERFORM 1 FROM orders WHERE id=oid FOR UPDATE;
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'roadside payout reservation is immutable'; END IF;
  IF NEW.order_id IS NULL OR NEW.order_leg_id IS NULL OR NEW.order_id IS DISTINCT FROM new_leg_oid
     OR NEW.order_id IS DISTINCT FROM oid THEN
    RAISE EXCEPTION 'roadside payout order and leg must match';
  END IF;
  IF TG_OP='UPDATE' THEN
    IF (NEW.order_id,NEW.order_leg_id,NEW.courier_id,NEW.type,NEW.gross_idr,NEW.net_idr,
        NEW.pph21_idr,NEW.penalty_idr,NEW.idle_compensation_idr)
        IS DISTINCT FROM
       (OLD.order_id,OLD.order_leg_id,OLD.courier_id,OLD.type,OLD.gross_idr,OLD.net_idr,
        OLD.pph21_idr,OLD.penalty_idr,OLD.idle_compensation_idr) THEN
      RAISE EXCEPTION 'roadside payout identity and amounts are immutable';
    END IF;
    IF NEW.disbursement_status IS DISTINCT FROM OLD.disbursement_status AND NEW.disbursement_status<>'pending' THEN
      RAISE EXCEPTION 'roadside payout release requires dedicated provider-idempotent workflow';
    END IF;
    SELECT payout_record_id INTO expected_id FROM roadside_settlements WHERE order_id=oid;
    IF expected_id IS NULL OR expected_id<>NEW.id THEN
      RAISE EXCEPTION 'roadside payout reservation is not linked to its settlement';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd
CREATE TRIGGER trg_roadside_financial_payout_binding BEFORE INSERT OR UPDATE OR DELETE ON payout_records
 FOR EACH ROW EXECUTE FUNCTION roadside_guard_payout_binding();

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION roadside_guard_settlement_payout_binding() RETURNS trigger AS $$
DECLARE p record;
BEGIN
  IF NEW.payout_record_id IS NOT NULL AND NEW.payout_record_id IS DISTINCT FROM OLD.payout_record_id THEN
    SELECT * INTO p FROM payout_records WHERE id=NEW.payout_record_id;
    IF NOT FOUND OR p.order_id IS DISTINCT FROM NEW.order_id OR p.courier_id IS DISTINCT FROM NEW.courier_id
       OR p.gross_idr<>NEW.courier_net_idr OR p.net_idr<>NEW.courier_net_idr
       OR p.pph21_idr<>NEW.withholding_idr OR p.disbursement_status<>'pending'
       OR NOT EXISTS(SELECT 1 FROM order_legs l WHERE l.id=p.order_leg_id AND l.order_id=NEW.order_id
          AND l.leg_number=1 AND l.courier_id=NEW.courier_id) THEN
      RAISE EXCEPTION 'roadside settlement payout linkage is inconsistent';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd
CREATE TRIGGER trg_roadside_financial_settlement_binding BEFORE UPDATE ON roadside_settlements
 FOR EACH ROW EXECUTE FUNCTION roadside_guard_settlement_payout_binding();

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION roadside_guard_earning_entry() RETURNS trigger AS $$
DECLARE journal record; oid UUID;
BEGIN
  IF NEW.account_name NOT IN ('courier_payable','courier_payout_expense')
     OR (NEW.debit_idr=0 AND NEW.credit_idr=0) THEN
    RETURN NEW;
  END IF;
  SELECT journal_type,reference_type,reference_id,idempotency_key INTO journal FROM ledger_journals WHERE id=NEW.journal_id;
  IF journal.reference_type='order' THEN
    BEGIN oid := journal.reference_id::uuid; EXCEPTION WHEN invalid_text_representation THEN RETURN NEW; END;
  ELSIF journal.reference_type='payout_record' THEN
    SELECT COALESCE(p.order_id,l.order_id) INTO oid FROM payout_records p
      LEFT JOIN order_legs l ON l.id=p.order_leg_id WHERE p.id::text=journal.reference_id;
  END IF;
  IF roadside_financial_order_id(oid) AND (journal.journal_type<>'roadside_settlement' OR journal.reference_type<>'order' OR journal.idempotency_key IS DISTINCT FROM 'ROADSIDE-SETTLEMENT-'||oid::text) THEN
    RAISE EXCEPTION 'roadside courier payable requires authoritative settlement journal';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd
CREATE TRIGGER trg_roadside_financial_earning_guard BEFORE INSERT ON ledger_entries
 FOR EACH ROW EXECUTE FUNCTION roadside_guard_earning_entry();

-- +goose Down
-- A rollback may remove the additional guards only before protected facts exist.
-- +goose StatementBegin
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM roadside_settlements)
     OR EXISTS(SELECT 1 FROM payments WHERE purpose='service_adjustment')
     OR EXISTS(SELECT 1 FROM roadside_service_claims)
     OR EXISTS(SELECT 1 FROM roadside_service_ratings) THEN
    RAISE EXCEPTION 'roadside financial facts exist; use an audited forward migration';
  END IF;
END $$;
-- +goose StatementEnd
DROP TRIGGER IF EXISTS trg_roadside_financial_earning_guard ON ledger_entries;
DROP FUNCTION IF EXISTS roadside_guard_earning_entry();
DROP TRIGGER IF EXISTS trg_roadside_financial_settlement_binding ON roadside_settlements;
DROP FUNCTION IF EXISTS roadside_guard_settlement_payout_binding();
DROP TRIGGER IF EXISTS trg_roadside_financial_payout_binding ON payout_records;
DROP FUNCTION IF EXISTS roadside_guard_payout_binding();
DROP TRIGGER IF EXISTS trg_roadside_financial_order_guard ON orders;
DROP FUNCTION IF EXISTS roadside_guard_order_financial_snapshot();
DROP TRIGGER IF EXISTS trg_roadside_financial_adjustment_lock ON service_adjustments;
DROP FUNCTION IF EXISTS roadside_lock_adjustment_order();
DROP TRIGGER IF EXISTS trg_roadside_financial_payment_lock ON payments;
DROP FUNCTION IF EXISTS roadside_lock_payment_order();
DROP TRIGGER IF EXISTS trg_roadside_financial_report_lock ON tambal_ban_reports;
DROP FUNCTION IF EXISTS roadside_lock_report_order();
DROP FUNCTION IF EXISTS roadside_financial_order_id(UUID);
