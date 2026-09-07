-- +goose Up
-- ECON-2026-006: merchant-specific commercial terms for food settlement.
-- The contract is versioned and approved independently from customer promo/ad
-- spend. Orders receive an immutable commercial snapshot at INSERT time.

CREATE TABLE IF NOT EXISTS merchant_commission_contracts (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id           UUID NOT NULL REFERENCES merchants(id),
    market_code           VARCHAR(32) NOT NULL DEFAULT 'ID-JK',
    service_code          VARCHAR(80) NOT NULL DEFAULT 'food_delivery',
    contract_version      VARCHAR(100) NOT NULL,
    commission_basis      VARCHAR(40) NOT NULL DEFAULT 'item_subtotal'
                            CHECK (commission_basis IN ('item_subtotal', 'gross_item')),
    commission_percent    NUMERIC(7,4) NOT NULL DEFAULT 0
                            CHECK (commission_percent >= 0 AND commission_percent <= 100),
    fixed_fee_idr         BIGINT NOT NULL DEFAULT 0 CHECK (fixed_fee_idr >= 0),
    effective_from        TIMESTAMPTZ NOT NULL,
    effective_to          TIMESTAMPTZ,
    status                VARCHAR(20) NOT NULL DEFAULT 'draft'
                            CHECK (status IN ('draft', 'approved', 'retired')),
    approval_reference    VARCHAR(160),
    approved_by           UUID,
    approved_at           TIMESTAMPTZ,
    created_by            UUID,
    metadata              JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT merchant_commission_contracts_effective_range_check
      CHECK (effective_to IS NULL OR effective_to > effective_from),
    CONSTRAINT merchant_commission_contracts_approval_check
      CHECK (
        status <> 'approved'
        OR (approval_reference IS NOT NULL AND btrim(approval_reference) <> ''
            AND approved_by IS NOT NULL AND approved_at IS NOT NULL)
      ),
    CONSTRAINT merchant_commission_contracts_version_unique
      UNIQUE (merchant_id, market_code, service_code, contract_version)
);

CREATE INDEX IF NOT EXISTS idx_merchant_commission_contracts_lookup
    ON merchant_commission_contracts (merchant_id, market_code, service_code, effective_from DESC)
    WHERE status = 'approved';

-- An approved contract is the sole source for manual commercial changes. Do
-- not permit overlapping approved periods for the same merchant lane.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION validate_merchant_commission_contract()
RETURNS TRIGGER AS $$
BEGIN
  NEW.market_code := UPPER(NULLIF(btrim(COALESCE(NEW.market_code, '')), ''));
  NEW.service_code := lower(NULLIF(btrim(COALESCE(NEW.service_code, '')), ''));
  NEW.contract_version := NULLIF(btrim(COALESCE(NEW.contract_version, '')), '');
  NEW.commission_basis := lower(COALESCE(NULLIF(btrim(NEW.commission_basis), ''), 'item_subtotal'));

  IF NEW.market_code IS NULL OR NEW.service_code IS NULL OR NEW.contract_version IS NULL THEN
    RAISE EXCEPTION 'merchant commission contract scope and version are required';
  END IF;
  IF NEW.status = 'approved' AND (NEW.approval_reference IS NULL OR btrim(NEW.approval_reference) = '') THEN
    RAISE EXCEPTION 'approved merchant commission contract requires approval_reference';
  END IF;
  IF NEW.status = 'approved' AND (NEW.approved_by IS NULL OR NEW.approved_at IS NULL) THEN
    RAISE EXCEPTION 'approved merchant commission contract requires approver and approved_at';
  END IF;

  IF NEW.status = 'approved' AND EXISTS (
    SELECT 1
      FROM merchant_commission_contracts c
     WHERE c.id <> NEW.id
       AND c.status = 'approved'
       AND c.merchant_id = NEW.merchant_id
       AND c.market_code = NEW.market_code
       AND c.service_code = NEW.service_code
       AND tstzrange(c.effective_from, c.effective_to, '[)')
           && tstzrange(NEW.effective_from, NEW.effective_to, '[)')
  ) THEN
    RAISE EXCEPTION 'approved merchant commission contract effective range overlaps an existing contract';
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd

DROP TRIGGER IF EXISTS trg_validate_merchant_commission_contract ON merchant_commission_contracts;
CREATE TRIGGER trg_validate_merchant_commission_contract
  BEFORE INSERT OR UPDATE ON merchant_commission_contracts
  FOR EACH ROW EXECUTE FUNCTION validate_merchant_commission_contract();

-- Snapshot the selected contract before the order leaves checkout. This is
-- deliberately INSERT-only: later contract edits cannot reprice history.
-- A service default keeps legacy merchants operable until they receive an
-- explicit approved contract; it is marked as such and remains auditable.
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

DROP TRIGGER IF EXISTS trg_snapshot_food_merchant_commercial_terms ON orders;
CREATE TRIGGER trg_snapshot_food_merchant_commercial_terms
  BEFORE INSERT ON orders
  FOR EACH ROW EXECUTE FUNCTION snapshot_food_merchant_commercial_terms();

-- +goose Down
DROP TRIGGER IF EXISTS trg_snapshot_food_merchant_commercial_terms ON orders;
DROP FUNCTION IF EXISTS snapshot_food_merchant_commercial_terms();
DROP TRIGGER IF EXISTS trg_validate_merchant_commission_contract ON merchant_commission_contracts;
DROP FUNCTION IF EXISTS validate_merchant_commission_contract();
DROP INDEX IF EXISTS idx_merchant_commission_contracts_lookup;
DROP TABLE IF EXISTS merchant_commission_contracts;
