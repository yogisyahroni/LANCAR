-- +goose Up
-- ECON-2026-012: make cancellation compensation a terminal earning event.
-- Delivery and cancellation credits share the existing (courier, order,
-- source) unique boundary, so replay/concurrent terminal updates cannot pay
-- the same order twice.

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION sync_courier_delivery_earning()
RETURNS TRIGGER AS $$
DECLARE
  earning_total INTEGER;
  terminal_event TEXT;
  base_earning INTEGER;
BEGIN
  IF NEW.courier_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'delivered' THEN
    terminal_event := 'delivery';
    base_earning := GREATEST(COALESCE((NEW.courier_earning_components->>'base_earning_idr')::integer, NEW.assigned_fee_idr, 0), 0);
  ELSIF NEW.status = 'cancelled'
        AND (
          COALESCE(NEW.cancellation_compensation_idr, 0) > 0
          OR COALESCE(NEW.idle_compensation_idr, 0) > 0
          OR COALESCE(NEW.toll_reimbursement_idr, 0) > 0
          OR COALESCE(NEW.return_compensation_idr, 0) > 0
          OR COALESCE(NEW.extra_service_compensation_idr, 0) > 0
        ) THEN
    terminal_event := 'cancellation';
    -- The assigned delivery fee is not payable when the delivery was
    -- cancelled. Only verified compensation facts are eligible here.
    base_earning := 0;
  ELSE
    RETURN NEW;
  END IF;

  earning_total := GREATEST(
    base_earning
    + COALESCE((NEW.courier_earning_components->>'waiting_compensation_idr')::integer, NEW.idle_compensation_idr, 0)
    + COALESCE((NEW.courier_earning_components->>'toll_reimbursement_idr')::integer, NEW.toll_reimbursement_idr, 0)
    + COALESCE((NEW.courier_earning_components->>'return_compensation_idr')::integer, NEW.return_compensation_idr, 0)
    + COALESCE((NEW.courier_earning_components->>'extra_service_compensation_idr')::integer, NEW.extra_service_compensation_idr, 0)
    + COALESCE((NEW.courier_earning_components->>'cancellation_compensation_idr')::integer, NEW.cancellation_compensation_idr, 0)
    - COALESCE((NEW.courier_earning_components->>'penalty_idr')::integer, NEW.penalty_idr, 0),
    0
  );

  IF earning_total > 0 THEN
    INSERT INTO courier_earnings_ledger (
      courier_id,
      order_id,
      source,
      direction,
      amount_idr,
      settlement_status,
      transaction_type,
      description,
      metadata
    ) VALUES (
      NEW.courier_id,
      NEW.order_id,
      'delivery',
      'credit',
      earning_total,
      'available',
      'earning_credit',
      CASE WHEN terminal_event = 'cancellation'
        THEN 'Kompensasi pembatalan sesuai courier earning policy'
        ELSE 'Pendapatan pengiriman sesuai courier earning policy'
      END,
      jsonb_build_object(
        'order_leg_id', NEW.id,
        'synced_from', 'order_legs',
        'terminal_event', terminal_event,
        'policy_snapshot', NEW.courier_earning_policy_snapshot,
        'earning_components', NEW.courier_earning_components
      )
    )
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd

-- The trigger already watches all earning facts; keep that boundary explicit
-- for cancellation updates that set the compensation after status changes.
DROP TRIGGER IF EXISTS trg_sync_courier_delivery_earning ON order_legs;
CREATE TRIGGER trg_sync_courier_delivery_earning
AFTER INSERT OR UPDATE OF status, assigned_fee_idr, courier_id, penalty_idr, idle_compensation_idr,
  toll_reimbursement_idr, return_compensation_idr, extra_service_compensation_idr,
  cancellation_compensation_idr
ON order_legs
FOR EACH ROW
EXECUTE FUNCTION sync_courier_delivery_earning();

-- +goose Down
DROP TRIGGER IF EXISTS trg_sync_courier_delivery_earning ON order_legs;
DROP FUNCTION IF EXISTS sync_courier_delivery_earning();

-- Restore the ECON-2026-004/011 delivery-only terminal credit contract.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION sync_courier_delivery_earning()
RETURNS TRIGGER AS $$
DECLARE
  earning_total INTEGER;
BEGIN
  IF NEW.courier_id IS NOT NULL AND NEW.status = 'delivered' THEN
    earning_total := GREATEST(
      COALESCE((NEW.courier_earning_components->>'base_earning_idr')::integer, NEW.assigned_fee_idr, 0)
      + COALESCE((NEW.courier_earning_components->>'waiting_compensation_idr')::integer, NEW.idle_compensation_idr, 0)
      + COALESCE((NEW.courier_earning_components->>'toll_reimbursement_idr')::integer, NEW.toll_reimbursement_idr, 0)
      + COALESCE((NEW.courier_earning_components->>'return_compensation_idr')::integer, NEW.return_compensation_idr, 0)
      + COALESCE((NEW.courier_earning_components->>'extra_service_compensation_idr')::integer, NEW.extra_service_compensation_idr, 0)
      + COALESCE((NEW.courier_earning_components->>'cancellation_compensation_idr')::integer, NEW.cancellation_compensation_idr, 0)
      - COALESCE((NEW.courier_earning_components->>'penalty_idr')::integer, NEW.penalty_idr, 0),
      0
    );

    IF earning_total > 0 THEN
      INSERT INTO courier_earnings_ledger (
        courier_id, order_id, source, direction, amount_idr, settlement_status,
        transaction_type, description, metadata
      ) VALUES (
        NEW.courier_id, NEW.order_id, 'delivery', 'credit', earning_total,
        'available', 'earning_credit',
        'Pendapatan pengiriman sesuai courier earning policy',
        jsonb_build_object(
          'order_leg_id', NEW.id,
          'synced_from', 'order_legs',
          'policy_snapshot', NEW.courier_earning_policy_snapshot,
          'earning_components', NEW.courier_earning_components
        )
      )
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd

CREATE TRIGGER trg_sync_courier_delivery_earning
AFTER INSERT OR UPDATE OF status, assigned_fee_idr, courier_id, penalty_idr, idle_compensation_idr,
  toll_reimbursement_idr, return_compensation_idr, extra_service_compensation_idr,
  cancellation_compensation_idr
ON order_legs
FOR EACH ROW
EXECUTE FUNCTION sync_courier_delivery_earning();
