-- +goose Up

-- Courier earning facts are server-owned order-leg facts. Clients never send
-- or overwrite these values; operational services may record verified facts
-- (waiting, toll, return and extra-service work) before final settlement.
ALTER TABLE order_legs
  ADD COLUMN IF NOT EXISTS toll_reimbursement_idr INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS return_compensation_idr INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS extra_service_compensation_idr INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cancellation_compensation_idr INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS courier_earning_policy_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS courier_earning_components JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE order_legs
  DROP CONSTRAINT IF EXISTS order_legs_toll_reimbursement_nonnegative,
  ADD CONSTRAINT order_legs_toll_reimbursement_nonnegative CHECK (toll_reimbursement_idr >= 0),
  DROP CONSTRAINT IF EXISTS order_legs_return_compensation_nonnegative,
  ADD CONSTRAINT order_legs_return_compensation_nonnegative CHECK (return_compensation_idr >= 0),
  DROP CONSTRAINT IF EXISTS order_legs_extra_service_compensation_nonnegative,
  ADD CONSTRAINT order_legs_extra_service_compensation_nonnegative CHECK (extra_service_compensation_idr >= 0),
  DROP CONSTRAINT IF EXISTS order_legs_cancellation_compensation_nonnegative,
  ADD CONSTRAINT order_legs_cancellation_compensation_nonnegative CHECK (cancellation_compensation_idr >= 0);

-- Snapshot the immutable policy and the server-verified earning facts on the
-- leg before the ledger trigger runs. The snapshot is intentionally copied
-- from orders.settlement_snapshot, never from a courier request body.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION snapshot_courier_earning_components()
RETURNS TRIGGER AS $$
DECLARE
  policy_snapshot JSONB;
  base_earning INTEGER;
  waiting_compensation INTEGER;
  toll_reimbursement INTEGER;
  return_compensation INTEGER;
  extra_service_compensation INTEGER;
  cancellation_compensation INTEGER;
  penalty INTEGER;
BEGIN
  SELECT COALESCE(settlement_snapshot->'courier_earning_policy', '{}'::jsonb)
    INTO policy_snapshot
    FROM orders
   WHERE id = NEW.order_id;

  base_earning := GREATEST(COALESCE(NEW.assigned_fee_idr, 0), 0);
  NEW.courier_earning_policy_snapshot := COALESCE(policy_snapshot, '{}'::jsonb);
  waiting_compensation := LEAST(
    COALESCE(NULLIF(NEW.courier_earning_policy_snapshot #>> '{compensation,waiting,cap_idr}', '')::integer, 10000),
    GREATEST(COALESCE(NEW.idle_compensation_idr, 0), 0)
  );
  toll_reimbursement := LEAST(
    COALESCE(NULLIF(NEW.courier_earning_policy_snapshot #>> '{compensation,toll,cap_idr}', '')::integer, 50000),
    GREATEST(COALESCE(NEW.toll_reimbursement_idr, 0), 0)
  );
  return_compensation := LEAST(
    COALESCE(NULLIF(NEW.courier_earning_policy_snapshot #>> '{compensation,return,cap_idr}', '')::integer, 15000),
    GREATEST(COALESCE(NEW.return_compensation_idr, 0), 0)
  );
  extra_service_compensation := LEAST(
    COALESCE(NULLIF(NEW.courier_earning_policy_snapshot #>> '{compensation,extra_service,cap_idr}', '')::integer, 50000),
    GREATEST(COALESCE(NEW.extra_service_compensation_idr, 0), 0)
  );
  cancellation_compensation := LEAST(
    COALESCE(NULLIF(NEW.courier_earning_policy_snapshot #>> '{compensation,cancellation,cap_idr}', '')::integer, 10000),
    GREATEST(COALESCE(NEW.cancellation_compensation_idr, 0), 0)
  );
  penalty := GREATEST(COALESCE(NEW.penalty_idr, 0), 0);
  NEW.courier_earning_components := jsonb_build_object(
    'base_earning_idr', base_earning,
    'waiting_compensation_idr', waiting_compensation,
    'toll_reimbursement_idr', toll_reimbursement,
    'return_compensation_idr', return_compensation,
    'extra_service_compensation_idr', extra_service_compensation,
    'cancellation_compensation_idr', cancellation_compensation,
    'penalty_idr', penalty,
    'estimated_total_idr', GREATEST(
      base_earning
      + waiting_compensation
      + toll_reimbursement
      + return_compensation
      + extra_service_compensation
      + cancellation_compensation
      - penalty,
      0
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd

DROP TRIGGER IF EXISTS trg_snapshot_courier_earning_components ON order_legs;
CREATE TRIGGER trg_snapshot_courier_earning_components
BEFORE INSERT OR UPDATE OF assigned_fee_idr, penalty_idr, idle_compensation_idr,
  toll_reimbursement_idr, return_compensation_idr, extra_service_compensation_idr,
  cancellation_compensation_idr, status
ON order_legs
FOR EACH ROW
EXECUTE FUNCTION snapshot_courier_earning_components();

-- Replace the legacy delivery trigger so its single authoritative credit
-- contains the full policy-derived earning breakdown and not just the offer
-- amount. The unique delivery guard remains the replay/concurrency boundary.
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
DROP TRIGGER IF EXISTS trg_snapshot_courier_earning_components ON order_legs;
DROP FUNCTION IF EXISTS sync_courier_delivery_earning();
DROP FUNCTION IF EXISTS snapshot_courier_earning_components();

ALTER TABLE order_legs
  DROP CONSTRAINT IF EXISTS order_legs_toll_reimbursement_nonnegative,
  DROP CONSTRAINT IF EXISTS order_legs_return_compensation_nonnegative,
  DROP CONSTRAINT IF EXISTS order_legs_extra_service_compensation_nonnegative,
  DROP CONSTRAINT IF EXISTS order_legs_cancellation_compensation_nonnegative,
  DROP COLUMN IF EXISTS toll_reimbursement_idr,
  DROP COLUMN IF EXISTS return_compensation_idr,
  DROP COLUMN IF EXISTS extra_service_compensation_idr,
  DROP COLUMN IF EXISTS cancellation_compensation_idr,
  DROP COLUMN IF EXISTS courier_earning_policy_snapshot,
  DROP COLUMN IF EXISTS courier_earning_components;

-- Restore the pre-ECON-004 trigger contract for a clean rollback.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION sync_courier_delivery_earning()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.courier_id IS NOT NULL AND NEW.status = 'delivered' AND COALESCE(NEW.assigned_fee_idr, 0) > 0 THEN
    INSERT INTO courier_earnings_ledger (
      courier_id, order_id, source, direction, amount_idr, settlement_status,
      description, metadata
    ) VALUES (
      NEW.courier_id, NEW.order_id, 'delivery', 'credit', NEW.assigned_fee_idr,
      'available', 'Payout bersih pengantaran',
      jsonb_build_object('order_leg_id', NEW.id, 'synced_from', 'order_legs')
    ) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd

CREATE TRIGGER trg_sync_courier_delivery_earning
AFTER INSERT OR UPDATE OF status, assigned_fee_idr, courier_id
ON order_legs
FOR EACH ROW
EXECUTE FUNCTION sync_courier_delivery_earning();
