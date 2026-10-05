-- +goose Up
-- MWEB-BIZ-2026-001: server-authoritative introductory merchant commission.
--
-- The existing merchant_commission_contracts table remains the source of
-- truth.  This migration adds the eligibility rule for the introductory
-- program through contract metadata:
--   program_code: new_merchant_intro
--   completed_order_cap: positive integer
--   fallback_commission_percent: standard rate after the program
--
-- Orders keep an immutable commercial snapshot.  The cap is evaluated before
-- a new order is snapshotted, so the 101st order cannot keep the introductory
-- rate after the configured number of completed food orders.

UPDATE delivery_service_products
   SET platform_commission_percent = 15
 WHERE code = 'food_delivery';

-- The database-level contract validator is intentionally kept in the
-- original migration.  Admin API validation and this trigger both reject
-- malformed introductory metadata before it can affect pricing.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION merchant_food_commission_intro_eligible(
  p_merchant_id UUID,
  p_metadata JSONB
)
RETURNS BOOLEAN AS $$
DECLARE
  v_program TEXT;
  v_cap BIGINT;
  v_completed BIGINT;
BEGIN
  v_program := COALESCE(NULLIF(btrim(p_metadata->>'program_code'), ''), 'standard');
  IF v_program <> 'new_merchant_intro' THEN
    RETURN TRUE;
  END IF;

  -- Treat malformed metadata as ineligible rather than allowing a direct
  -- database writer to abort order creation with a cast error.  The Admin API
  -- rejects this input; this guard protects imports and other trusted writers.
  IF COALESCE(jsonb_typeof(p_metadata), 'null') <> 'object'
     OR COALESCE(btrim(p_metadata->>'completed_order_cap'), '') !~ '^[1-9][0-9]{0,17}$' THEN
    RETURN FALSE;
  END IF;

  v_cap := (p_metadata->>'completed_order_cap')::BIGINT;
  IF v_cap IS NULL OR v_cap < 1 THEN
    RETURN TRUE;
  END IF;

  -- Serialize cap decisions per merchant.  Without this lock two checkout
  -- transactions arriving at the boundary could both observe the same count.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('merchant-food-commission:' || p_merchant_id::TEXT, 0)
  );

  SELECT COUNT(*)::BIGINT
    INTO v_completed
    FROM orders
   WHERE merchant_id = p_merchant_id
     AND service_sub_type = 'food_delivery'
     AND status IN ('delivered', 'completed');

  RETURN v_completed < v_cap;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd

-- Keep the existing snapshot contract, adding only the cap eligibility check
-- and the safe 15% default for merchants without a custom contract.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION snapshot_food_merchant_commercial_terms()
RETURNS TRIGGER AS $$
DECLARE
  v_market TEXT;
  v_contract merchant_commission_contracts%ROWTYPE;
  v_contract_id UUID;
  v_version TEXT;
  v_basis TEXT;
  v_percent NUMERIC;
  v_fixed BIGINT;
  v_effective_from TIMESTAMPTZ;
  v_effective_to TIMESTAMPTZ;
  v_source TEXT;
  v_base BIGINT;
  v_commission BIGINT;
  v_snapshot JSONB;
BEGIN
  IF COALESCE(NEW.service_sub_type, '') <> 'food_delivery' OR NEW.merchant_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_market := UPPER(COALESCE(NULLIF(btrim(NEW.pricing_snapshot->>'market'), ''), 'ID-JK'));
  SELECT * INTO v_contract
    FROM merchant_commission_contracts c
   WHERE c.merchant_id = NEW.merchant_id
     AND c.market_code = v_market
     AND c.service_code = 'food_delivery'
     AND c.status = 'approved'
     AND COALESCE(NEW.created_at, NOW()) >= c.effective_from
     AND (c.effective_to IS NULL OR COALESCE(NEW.created_at, NOW()) < c.effective_to)
     AND merchant_food_commission_intro_eligible(NEW.merchant_id, c.metadata)
   ORDER BY c.effective_from DESC, c.created_at DESC
   LIMIT 1;

  IF v_contract.id IS NOT NULL THEN
    v_contract_id := v_contract.id;
    v_version := v_contract.contract_version;
    v_basis := v_contract.commission_basis;
    v_percent := v_contract.commission_percent;
    v_fixed := v_contract.fixed_fee_idr;
    v_effective_from := v_contract.effective_from;
    v_effective_to := v_contract.effective_to;
    v_source := 'approved_merchant_contract';
  ELSE
    v_percent := 15;
    SELECT COALESCE(NULLIF(platform_commission_percent, 0), 15)
      INTO v_percent
      FROM delivery_service_products
     WHERE code = 'food_delivery'
     LIMIT 1;
    v_contract_id := NULL;
    v_version := 'service-default-food_delivery-v2';
    v_basis := 'item_subtotal';
    v_fixed := 0;
    v_effective_from := COALESCE(NEW.created_at, NOW());
    v_effective_to := NULL;
    v_source := 'service_default';
  END IF;

  v_base := GREATEST(0, COALESCE(NULLIF(NEW.pricing_snapshot->>'subtotal_idr', '')::BIGINT, NEW.base_price_idr, 0));
  v_commission := GREATEST(0, ROUND(v_base * v_percent / 100.0)::BIGINT + v_fixed);
  v_snapshot := jsonb_build_object(
    'contract_id', v_contract_id,
    'contract_version', v_version,
    'merchant_id', NEW.merchant_id,
    'market_code', v_market,
    'service_code', 'food_delivery',
    'commission_basis', v_basis,
    'commission_percent', v_percent,
    'fixed_fee_idr', v_fixed,
    'commission_base_idr', v_base,
    'commission_idr', v_commission,
    'effective_from', v_effective_from,
    'effective_to', v_effective_to,
    'source', v_source,
    'ads_spend_idr', 0,
    'snapshotted_at', COALESCE(NEW.created_at, NOW())
  );

  NEW.settlement_snapshot := jsonb_set(
    COALESCE(NEW.settlement_snapshot, '{}'::jsonb),
    '{merchant_commercial_terms}', v_snapshot, TRUE
  );
  NEW.platform_commission_idr := v_commission;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd

-- +goose Down
-- The food_delivery seed already defines 15% as the service baseline. Keep
-- that baseline when rolling back this policy migration; do not restore the
-- obsolete 2.5% trigger fallback.
UPDATE delivery_service_products
   SET platform_commission_percent = 15
 WHERE code = 'food_delivery';

DROP FUNCTION IF EXISTS merchant_food_commission_intro_eligible(UUID, JSONB);

-- Restore the pre-program trigger implementation from
-- 20260907000016_merchant_commission_contracts.sql.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION snapshot_food_merchant_commercial_terms()
RETURNS TRIGGER AS $$
DECLARE
  v_market TEXT;
  v_contract merchant_commission_contracts%ROWTYPE;
  v_contract_id UUID;
  v_version TEXT;
  v_basis TEXT;
  v_percent NUMERIC;
  v_fixed BIGINT;
  v_effective_from TIMESTAMPTZ;
  v_effective_to TIMESTAMPTZ;
  v_source TEXT;
  v_base BIGINT;
  v_commission BIGINT;
  v_snapshot JSONB;
BEGIN
  IF COALESCE(NEW.service_sub_type, '') <> 'food_delivery' OR NEW.merchant_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_market := UPPER(COALESCE(NULLIF(btrim(NEW.pricing_snapshot->>'market'), ''), 'ID-JK'));
  SELECT * INTO v_contract
    FROM merchant_commission_contracts c
   WHERE c.merchant_id = NEW.merchant_id
     AND c.market_code = v_market
     AND c.service_code = 'food_delivery'
     AND c.status = 'approved'
     AND COALESCE(NEW.created_at, NOW()) >= c.effective_from
     AND (c.effective_to IS NULL OR COALESCE(NEW.created_at, NOW()) < c.effective_to)
   ORDER BY c.effective_from DESC, c.created_at DESC
   LIMIT 1;

  IF v_contract.id IS NOT NULL THEN
    v_contract_id := v_contract.id;
    v_version := v_contract.contract_version;
    v_basis := v_contract.commission_basis;
    v_percent := v_contract.commission_percent;
    v_fixed := v_contract.fixed_fee_idr;
    v_effective_from := v_contract.effective_from;
    v_effective_to := v_contract.effective_to;
    v_source := 'approved_merchant_contract';
  ELSE
    v_percent := 2.5;
    SELECT COALESCE(NULLIF(platform_commission_percent, 0), 2.5)
      INTO v_percent
      FROM delivery_service_products
     WHERE code = 'food_delivery'
     LIMIT 1;
    v_contract_id := NULL;
    v_version := 'service-default-food_delivery-v1';
    v_basis := 'item_subtotal';
    v_fixed := 0;
    v_effective_from := COALESCE(NEW.created_at, NOW());
    v_effective_to := NULL;
    v_source := 'service_default';
  END IF;

  v_base := GREATEST(0, COALESCE(NULLIF(NEW.pricing_snapshot->>'subtotal_idr', '')::BIGINT, NEW.base_price_idr, 0));
  v_commission := GREATEST(0, ROUND(v_base * v_percent / 100.0)::BIGINT + v_fixed);
  v_snapshot := jsonb_build_object(
    'contract_id', v_contract_id,
    'contract_version', v_version,
    'merchant_id', NEW.merchant_id,
    'market_code', v_market,
    'service_code', 'food_delivery',
    'commission_basis', v_basis,
    'commission_percent', v_percent,
    'fixed_fee_idr', v_fixed,
    'commission_base_idr', v_base,
    'commission_idr', v_commission,
    'effective_from', v_effective_from,
    'effective_to', v_effective_to,
    'source', v_source,
    'ads_spend_idr', 0,
    'snapshotted_at', COALESCE(NEW.created_at, NOW())
  );

  NEW.settlement_snapshot := jsonb_set(
    COALESCE(NEW.settlement_snapshot, '{}'::jsonb),
    '{merchant_commercial_terms}', v_snapshot, TRUE
  );
  NEW.platform_commission_idr := v_commission;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd
