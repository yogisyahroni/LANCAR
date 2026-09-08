-- +goose Up
-- MERCH-2026-005: merchant finance statement, payout account cooldown, and
-- merchant-scoped settlement discrepancies.
--
-- The statement is an append-only projection of the existing canonical
-- settlement/refund/withdrawal sources. It does not replace ledger_journals,
-- merchant_settlements, refunds, or withdrawal requests as their sources of
-- truth. Corrections and external charges are represented by new statement
-- entries, never by mutating a historical row.

ALTER TABLE merchants
  ADD COLUMN IF NOT EXISTS bank_account_changed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bank_account_cooldown_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bank_account_version BIGINT NOT NULL DEFAULT 1;

ALTER TABLE merchants
  DROP CONSTRAINT IF EXISTS merchants_bank_account_version_positive_ck;
ALTER TABLE merchants
  ADD CONSTRAINT merchants_bank_account_version_positive_ck
  CHECK (bank_account_version > 0);

INSERT INTO system_configs (key, value, description, category, updated_at)
VALUES (
  'merchant_bank_account_cooldown_hours', '24',
  'Minimum cooldown after a merchant payout bank-account change.',
  'finance', NOW()
)
ON CONFLICT (key) DO NOTHING;

-- The global queue remains the canonical discrepancy queue. These nullable
-- dimensions let a merchant statement scope it without duplicating a queue.
ALTER TABLE finance_reconciliation_exceptions
  ADD COLUMN IF NOT EXISTS merchant_id UUID REFERENCES merchants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS market_code VARCHAR(40),
  ADD COLUMN IF NOT EXISTS currency_code VARCHAR(3),
  ADD COLUMN IF NOT EXISTS currency_minor_unit SMALLINT,
  ADD COLUMN IF NOT EXISTS expected_minor BIGINT,
  ADD COLUMN IF NOT EXISTS actual_minor BIGINT,
  ADD COLUMN IF NOT EXISTS difference_minor BIGINT;

UPDATE finance_reconciliation_exceptions fre
SET merchant_id = o.merchant_id
FROM orders o
WHERE fre.merchant_id IS NULL
  AND fre.reference_type = 'order'
  AND o.id::text = fre.reference_id;

UPDATE finance_reconciliation_exceptions fre
SET merchant_id = ms.merchant_id
FROM merchant_settlements ms
WHERE fre.merchant_id IS NULL
  AND fre.reference_type = 'merchant_settlement'
  AND ms.id::text = fre.reference_id;

UPDATE finance_reconciliation_exceptions
SET expected_minor = COALESCE(expected_minor, expected_idr),
    actual_minor = COALESCE(actual_minor, actual_idr),
    difference_minor = COALESCE(difference_minor, difference_idr),
    currency_code = COALESCE(currency_code, 'IDR'),
    currency_minor_unit = COALESCE(currency_minor_unit, 0)
WHERE expected_minor IS NULL
   OR actual_minor IS NULL
   OR difference_minor IS NULL
   OR currency_code IS NULL
   OR currency_minor_unit IS NULL;

-- Add the explicit minor-unit representation to settlement and withdrawal
-- records while preserving the IDR columns for legacy callers.
ALTER TABLE merchant_settlements
  ADD COLUMN IF NOT EXISTS market_code VARCHAR(40),
  ADD COLUMN IF NOT EXISTS currency_code VARCHAR(3),
  ADD COLUMN IF NOT EXISTS currency_minor_unit SMALLINT,
  ADD COLUMN IF NOT EXISTS gross_item_price_minor BIGINT,
  ADD COLUMN IF NOT EXISTS merchant_fee_minor BIGINT,
  ADD COLUMN IF NOT EXISTS disbursement_fee_minor BIGINT,
  ADD COLUMN IF NOT EXISTS merchant_promo_discount_minor BIGINT,
  ADD COLUMN IF NOT EXISTS net_payout_minor BIGINT;

UPDATE merchant_settlements ms
SET market_code = cfg.market_code,
    currency_code = cfg.currency_code,
    currency_minor_unit = cfg.currency_minor_unit,
    gross_item_price_minor = ms.gross_item_price_idr,
    merchant_fee_minor = ms.merchant_fee_idr,
    disbursement_fee_minor = ms.disbursement_fee_idr,
    merchant_promo_discount_minor = ms.merchant_promo_discount_idr,
    net_payout_minor = ms.net_payout_idr
FROM merchants m
JOIN LATERAL (
  SELECT lower(c.market_code) AS market_code, c.currency_code,
         c.currency_minor_unit
  FROM courier_market_configs c
  WHERE c.is_active
    AND (
      lower(c.market_code) = lower(m.market_code)
      OR c.metadata->'legacy_zone_market_codes' @> to_jsonb(ARRAY[upper(m.market_code)])
    )
  ORDER BY CASE WHEN lower(c.market_code) = lower(m.market_code) THEN 0 ELSE 1 END
  LIMIT 1
) cfg ON TRUE
WHERE ms.merchant_id = m.id;

-- +goose StatementBegin
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM merchant_settlements
    WHERE market_code IS NULL OR currency_code IS NULL
       OR currency_minor_unit IS NULL OR gross_item_price_minor IS NULL
       OR merchant_fee_minor IS NULL OR disbursement_fee_minor IS NULL
       OR merchant_promo_discount_minor IS NULL OR net_payout_minor IS NULL
  ) THEN
    RAISE EXCEPTION 'merchant settlement has no active market financial configuration';
  END IF;
END
$$;
-- +goose StatementEnd

ALTER TABLE merchant_settlements
  ALTER COLUMN market_code SET NOT NULL,
  ALTER COLUMN currency_code SET NOT NULL,
  ALTER COLUMN currency_minor_unit SET NOT NULL,
  ALTER COLUMN gross_item_price_minor SET NOT NULL,
  ALTER COLUMN merchant_fee_minor SET NOT NULL,
  ALTER COLUMN disbursement_fee_minor SET NOT NULL,
  ALTER COLUMN merchant_promo_discount_minor SET NOT NULL,
  ALTER COLUMN net_payout_minor SET NOT NULL;

ALTER TABLE merchant_settlements
  DROP CONSTRAINT IF EXISTS merchant_settlements_gross_item_price_idr_check;
ALTER TABLE merchant_settlements
  ADD CONSTRAINT merchant_settlements_gross_item_price_idr_check
  CHECK (
    gross_item_price_idr > 0
    OR (currency_code <> 'IDR' AND gross_item_price_minor > 0)
  );

ALTER TABLE merchant_settlements
  DROP CONSTRAINT IF EXISTS merchant_settlements_currency_amounts_ck;
ALTER TABLE merchant_settlements
  ADD CONSTRAINT merchant_settlements_currency_amounts_ck
  CHECK (
    currency_minor_unit BETWEEN 0 AND 3
    AND (currency_code <> 'IDR' OR (
      gross_item_price_minor = gross_item_price_idr
      AND merchant_fee_minor = merchant_fee_idr
      AND disbursement_fee_minor = disbursement_fee_idr
      AND merchant_promo_discount_minor = merchant_promo_discount_idr
      AND net_payout_minor = net_payout_idr
    ))
  );

ALTER TABLE merchant_withdrawal_requests
  ADD COLUMN IF NOT EXISTS market_code VARCHAR(40),
  ADD COLUMN IF NOT EXISTS currency_code VARCHAR(3),
  ADD COLUMN IF NOT EXISTS currency_minor_unit SMALLINT,
  ADD COLUMN IF NOT EXISTS amount_minor BIGINT;

UPDATE merchant_withdrawal_requests wr
SET market_code = cfg.market_code,
    currency_code = cfg.currency_code,
    currency_minor_unit = cfg.currency_minor_unit,
    amount_minor = wr.amount_idr
FROM merchants m
JOIN LATERAL (
  SELECT lower(c.market_code) AS market_code, c.currency_code,
         c.currency_minor_unit
  FROM courier_market_configs c
  WHERE c.is_active
    AND (
      lower(c.market_code) = lower(m.market_code)
      OR c.metadata->'legacy_zone_market_codes' @> to_jsonb(ARRAY[upper(m.market_code)])
    )
  ORDER BY CASE WHEN lower(c.market_code) = lower(m.market_code) THEN 0 ELSE 1 END
  LIMIT 1
) cfg ON TRUE
WHERE wr.merchant_id = m.id;

-- +goose StatementBegin
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM merchant_withdrawal_requests
    WHERE market_code IS NULL OR currency_code IS NULL
       OR currency_minor_unit IS NULL OR amount_minor IS NULL
  ) THEN
    RAISE EXCEPTION 'merchant withdrawal has no active market financial configuration';
  END IF;
END
$$;
-- +goose StatementEnd

ALTER TABLE merchant_withdrawal_requests
  ALTER COLUMN market_code SET NOT NULL,
  ALTER COLUMN currency_code SET NOT NULL,
  ALTER COLUMN currency_minor_unit SET NOT NULL,
  ALTER COLUMN amount_minor SET NOT NULL,
  DROP CONSTRAINT IF EXISTS merchant_withdrawal_currency_amount_ck;
ALTER TABLE merchant_withdrawal_requests
  DROP CONSTRAINT IF EXISTS merchant_withdrawal_requests_amount_idr_check;
ALTER TABLE merchant_withdrawal_requests
  ADD CONSTRAINT merchant_withdrawal_requests_amount_idr_check
  CHECK (
    amount_idr > 0
    OR (currency_code <> 'IDR' AND amount_minor > 0)
  );
ALTER TABLE merchant_withdrawal_requests
  ADD CONSTRAINT merchant_withdrawal_currency_amount_ck
  CHECK (currency_minor_unit BETWEEN 0 AND 3 AND (currency_code <> 'IDR' OR amount_minor = amount_idr));

CREATE TABLE IF NOT EXISTS merchant_bank_account_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  account_version BIGINT NOT NULL,
  old_bank_name VARCHAR(60),
  new_bank_name VARCHAR(60),
  old_account_last4 CHAR(4),
  new_account_last4 CHAR(4),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT merchant_bank_account_events_version_ck CHECK (account_version > 0)
);

CREATE INDEX IF NOT EXISTS idx_merchant_bank_account_events_merchant
  ON merchant_bank_account_events (merchant_id, changed_at DESC);

CREATE TABLE IF NOT EXISTS merchant_statement_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  market_code VARCHAR(40) NOT NULL,
  currency_code VARCHAR(3) NOT NULL,
  currency_minor_unit SMALLINT NOT NULL,
  entry_type VARCHAR(24) NOT NULL,
  direction VARCHAR(8) NOT NULL,
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  affects_balance BOOLEAN NOT NULL DEFAULT TRUE,
  source_type VARCHAR(40) NOT NULL,
  source_id VARCHAR(160) NOT NULL,
  order_id UUID REFERENCES orders(id) ON DELETE RESTRICT,
  settlement_id UUID REFERENCES merchant_settlements(id) ON DELETE RESTRICT,
  refund_id UUID REFERENCES refunds(id) ON DELETE RESTRICT,
  withdrawal_id UUID REFERENCES merchant_withdrawal_requests(id) ON DELETE RESTRICT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  description TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key VARCHAR(220) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT merchant_statement_currency_code_ck CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT merchant_statement_minor_unit_ck CHECK (currency_minor_unit BETWEEN 0 AND 3),
  CONSTRAINT merchant_statement_entry_type_ck CHECK (entry_type IN (
    'sale', 'commission', 'tax', 'promo_subsidy', 'refund', 'fee',
    'ads_spend', 'adjustment', 'payout'
  )),
  CONSTRAINT merchant_statement_direction_ck CHECK (direction IN ('credit', 'debit'))
);

CREATE INDEX IF NOT EXISTS idx_merchant_statement_merchant_time
  ON merchant_statement_entries (merchant_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_merchant_statement_merchant_type
  ON merchant_statement_entries (merchant_id, entry_type, occurred_at DESC);

-- Statement rows are accounting evidence. They can only be corrected by a
-- compensating entry, never by UPDATE/DELETE.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION prevent_merchant_statement_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'merchant statement is append-only; use a compensating entry';
END;
$$;
-- +goose StatementEnd

DROP TRIGGER IF EXISTS trg_prevent_merchant_statement_mutation ON merchant_statement_entries;
CREATE TRIGGER trg_prevent_merchant_statement_mutation
BEFORE UPDATE OR DELETE ON merchant_statement_entries
FOR EACH ROW EXECUTE FUNCTION prevent_merchant_statement_mutation();

-- Resolve legacy ID-JK/zone market codes to the canonical market config. An
-- unknown market fails closed instead of inheriting Indonesian assumptions.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION merchant_financial_context(p_merchant_id UUID)
RETURNS TABLE (
  market_code TEXT,
  currency_code TEXT,
  currency_minor_unit SMALLINT,
  timezone TEXT,
  display_locale TEXT
)
LANGUAGE SQL
STABLE
AS $$
  SELECT lower(c.market_code)::TEXT, c.currency_code::TEXT, c.currency_minor_unit,
         c.timezone::TEXT, c.display_locale::TEXT
  FROM merchants m
  JOIN courier_market_configs c ON c.is_active
    AND (
      lower(c.market_code) = lower(m.market_code)
      OR c.metadata->'legacy_zone_market_codes' @> to_jsonb(ARRAY[upper(m.market_code)])
    )
  WHERE m.id = p_merchant_id
  ORDER BY CASE WHEN lower(c.market_code) = lower(m.market_code) THEN 0 ELSE 1 END
  LIMIT 1;
$$;
-- +goose StatementEnd

-- Legacy writers still send *_idr/amount_idr. The boundary translates those
-- values only for IDR and refuses to silently treat IDR as another currency.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION populate_merchant_financial_context()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  ctx RECORD;
BEGIN
  SELECT * INTO ctx FROM merchant_financial_context(NEW.merchant_id);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'merchant % has no active market financial configuration', NEW.merchant_id;
  END IF;
  NEW.market_code := ctx.market_code;
  NEW.currency_code := ctx.currency_code;
  NEW.currency_minor_unit := ctx.currency_minor_unit;

  IF TG_TABLE_NAME = 'merchant_settlements' THEN
    IF ctx.currency_code <> 'IDR' AND (
      COALESCE(NEW.gross_item_price_idr, 0) <> 0 OR COALESCE(NEW.merchant_fee_idr, 0) <> 0
      OR COALESCE(NEW.disbursement_fee_idr, 0) <> 0
      OR COALESCE(NEW.merchant_promo_discount_idr, 0) <> 0
      OR COALESCE(NEW.net_payout_idr, 0) <> 0
    ) THEN
      RAISE EXCEPTION 'legacy IDR settlement writer cannot post to non-IDR market';
    END IF;
    NEW.gross_item_price_minor := COALESCE(NEW.gross_item_price_minor, NEW.gross_item_price_idr);
    NEW.merchant_fee_minor := COALESCE(NEW.merchant_fee_minor, NEW.merchant_fee_idr);
    NEW.disbursement_fee_minor := COALESCE(NEW.disbursement_fee_minor, NEW.disbursement_fee_idr);
    NEW.merchant_promo_discount_minor := COALESCE(NEW.merchant_promo_discount_minor, NEW.merchant_promo_discount_idr);
    NEW.net_payout_minor := COALESCE(NEW.net_payout_minor, NEW.net_payout_idr);
  ELSE
    IF ctx.currency_code <> 'IDR' AND COALESCE(NEW.amount_idr, 0) <> 0 THEN
      RAISE EXCEPTION 'legacy IDR withdrawal writer cannot post to non-IDR market';
    END IF;
    NEW.amount_minor := COALESCE(NEW.amount_minor, NEW.amount_idr);
  END IF;
  RETURN NEW;
END;
$$;
-- +goose StatementEnd

DROP TRIGGER IF EXISTS trg_populate_merchant_settlement_financial_context ON merchant_settlements;
CREATE TRIGGER trg_populate_merchant_settlement_financial_context
BEFORE INSERT ON merchant_settlements
FOR EACH ROW EXECUTE FUNCTION populate_merchant_financial_context();

DROP TRIGGER IF EXISTS trg_populate_merchant_withdrawal_financial_context ON merchant_withdrawal_requests;
CREATE TRIGGER trg_populate_merchant_withdrawal_financial_context
BEFORE INSERT ON merchant_withdrawal_requests
FOR EACH ROW EXECUTE FUNCTION populate_merchant_financial_context();

-- This is the single append boundary for Ads adapters and finance correction
-- flows. It validates market/currency context and gives every external source
-- an idempotent, append-only path without creating a second ledger.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION append_merchant_statement_entry(
  p_merchant_id UUID,
  p_market_code TEXT,
  p_currency_code TEXT,
  p_currency_minor_unit SMALLINT,
  p_entry_type TEXT,
  p_direction TEXT,
  p_amount_minor BIGINT,
  p_affects_balance BOOLEAN,
  p_source_type TEXT,
  p_source_id TEXT,
  p_order_id UUID,
  p_settlement_id UUID,
  p_refund_id UUID,
  p_withdrawal_id UUID,
  p_occurred_at TIMESTAMPTZ,
  p_description TEXT,
  p_metadata JSONB,
  p_idempotency_key TEXT
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  result_id UUID;
BEGIN
  IF p_amount_minor <= 0 THEN
    RAISE EXCEPTION 'merchant statement amount must be positive';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM courier_market_configs c
    WHERE c.is_active
      AND lower(c.market_code) = lower(p_market_code)
      AND c.currency_code = upper(p_currency_code)
      AND c.currency_minor_unit = p_currency_minor_unit
  ) THEN
    RAISE EXCEPTION 'merchant statement market/currency configuration is missing';
  END IF;

  INSERT INTO merchant_statement_entries (
    merchant_id, market_code, currency_code, currency_minor_unit,
    entry_type, direction, amount_minor, affects_balance,
    source_type, source_id, order_id, settlement_id, refund_id, withdrawal_id,
    occurred_at, description, metadata, idempotency_key
  ) VALUES (
    p_merchant_id, lower(p_market_code), upper(p_currency_code), p_currency_minor_unit,
    lower(p_entry_type), lower(p_direction), p_amount_minor, COALESCE(p_affects_balance, TRUE),
    p_source_type, p_source_id, p_order_id, p_settlement_id, p_refund_id, p_withdrawal_id,
    COALESCE(p_occurred_at, NOW()), COALESCE(NULLIF(p_description, ''), p_entry_type),
    COALESCE(p_metadata, '{}'::jsonb), p_idempotency_key
  ) ON CONFLICT (idempotency_key) DO NOTHING;

  SELECT id INTO result_id
  FROM merchant_statement_entries
  WHERE idempotency_key = p_idempotency_key;
  RETURN result_id;
END;
$$;
-- +goose StatementEnd

-- The settlement financial breakdown is snapshotted at settlement creation.
-- Tax is exposed separately but is informational for merchant balance because
-- the current order tax snapshot is not deducted from merchant net payout.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION materialize_merchant_settlement_statement(p_settlement_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  s merchant_settlements%ROWTYPE;
  ctx RECORD;
  tax_minor BIGINT := 0;
  cancellation_fee_minor BIGINT := 0;
  fee_minor BIGINT := 0;
  expected_minor BIGINT := 0;
  actual_minor BIGINT := 0;
  settlement_exception_key TEXT;
BEGIN
  SELECT * INTO s FROM merchant_settlements WHERE id = p_settlement_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT * INTO ctx FROM merchant_financial_context(s.merchant_id);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'merchant % has no active market financial configuration', s.merchant_id;
  END IF;

  IF s.market_code <> ctx.market_code OR s.currency_code <> ctx.currency_code
     OR s.currency_minor_unit <> ctx.currency_minor_unit THEN
    RAISE EXCEPTION 'merchant settlement market/currency context is not canonical';
  END IF;

  PERFORM append_merchant_statement_entry(
    s.merchant_id, s.market_code, s.currency_code, s.currency_minor_unit,
    'sale', 'credit', s.gross_item_price_minor, TRUE,
    'merchant_settlement', s.id::TEXT, s.order_id, s.id, NULL, NULL,
    s.created_at, 'Food/order sales', '{}'::jsonb,
    'merchant-settlement:' || s.id || ':sale'
  );

  IF s.merchant_fee_minor > 0 THEN
    PERFORM append_merchant_statement_entry(
      s.merchant_id, s.market_code, s.currency_code, s.currency_minor_unit,
      'commission', 'debit', s.merchant_fee_minor, TRUE,
      'merchant_settlement', s.id::TEXT, s.order_id, s.id, NULL, NULL,
      s.created_at, 'Merchant commission', '{}'::jsonb,
      'merchant-settlement:' || s.id || ':commission'
    );
  END IF;

  IF s.merchant_promo_discount_minor > 0 THEN
    PERFORM append_merchant_statement_entry(
      s.merchant_id, s.market_code, s.currency_code, s.currency_minor_unit,
      'promo_subsidy', 'debit', s.merchant_promo_discount_minor, TRUE,
      'merchant_settlement', s.id::TEXT, s.order_id, s.id, NULL, NULL,
      s.created_at, 'Merchant-funded promo subsidy', '{}'::jsonb,
      'merchant-settlement:' || s.id || ':promo_subsidy'
    );
  END IF;

  IF jsonb_typeof(s.metadata) = 'object'
     AND COALESCE(s.metadata->>'cancellation_fee_deducted_idr', '') ~ '^[0-9]+$' THEN
    cancellation_fee_minor := (s.metadata->>'cancellation_fee_deducted_idr')::BIGINT;
  END IF;
  fee_minor := s.disbursement_fee_minor + cancellation_fee_minor;
  IF fee_minor > 0 THEN
    PERFORM append_merchant_statement_entry(
      s.merchant_id, s.market_code, s.currency_code, s.currency_minor_unit,
      'fee', 'debit', fee_minor, TRUE,
      'merchant_settlement', s.id::TEXT, s.order_id, s.id, NULL, NULL,
      s.created_at, 'Disbursement/cancellation fee',
      jsonb_build_object('disbursement_fee_minor', s.disbursement_fee_minor,
                         'cancellation_fee_minor', cancellation_fee_minor),
      'merchant-settlement:' || s.id || ':fee'
    );
  END IF;

  IF s.currency_code = 'IDR' THEN
    SELECT COALESCE(o.ppn_idr, 0) INTO tax_minor FROM orders o WHERE o.id = s.order_id;
  END IF;
  IF tax_minor > 0 THEN
    PERFORM append_merchant_statement_entry(
      s.merchant_id, s.market_code, s.currency_code, s.currency_minor_unit,
      'tax', 'debit', tax_minor, FALSE,
      'order_tax_snapshot', s.order_id::TEXT, s.order_id, s.id, NULL, NULL,
      s.created_at, 'Order tax snapshot (informational)',
      (SELECT jsonb_build_object('tax_rule_code', COALESCE(o.tax_rule_code, ''),
                                 'tax_invoice_status', COALESCE(o.tax_invoice_status, 'unissued'))
       FROM orders o WHERE o.id = s.order_id),
      'merchant-settlement:' || s.id || ':tax'
    );
  END IF;

  expected_minor := s.net_payout_minor;
  actual_minor := s.gross_item_price_minor - s.merchant_fee_minor
    - s.merchant_promo_discount_minor - fee_minor;
  IF actual_minor <> expected_minor THEN
    settlement_exception_key := 'merchant-settlement:' || s.id || ':component-balance';
    INSERT INTO finance_reconciliation_exceptions (
      exception_key, merchant_id, market_code, currency_code, currency_minor_unit,
      reference_type, reference_id, expected_idr, actual_idr, difference_idr,
      expected_minor, actual_minor, difference_minor, reason, metadata,
      first_seen_at, last_seen_at
    ) VALUES (
      settlement_exception_key, s.merchant_id, s.market_code, s.currency_code, s.currency_minor_unit,
      'merchant_settlement', s.id::TEXT,
      CASE WHEN s.currency_code = 'IDR' THEN expected_minor ELSE 0 END,
      CASE WHEN s.currency_code = 'IDR' THEN actual_minor ELSE 0 END,
      CASE WHEN s.currency_code = 'IDR' THEN actual_minor - expected_minor ELSE 0 END,
      expected_minor, actual_minor, actual_minor - expected_minor,
      'Merchant settlement component total does not equal net payout',
      jsonb_build_object('order_id', s.order_id, 'status', s.status), NOW(), NOW()
    ) ON CONFLICT (exception_key) DO UPDATE SET
      expected_minor = EXCLUDED.expected_minor,
      actual_minor = EXCLUDED.actual_minor,
      difference_minor = EXCLUDED.difference_minor,
      expected_idr = EXCLUDED.expected_idr,
      actual_idr = EXCLUDED.actual_idr,
      difference_idr = EXCLUDED.difference_idr,
      last_seen_at = NOW(),
      metadata = EXCLUDED.metadata,
      status = CASE WHEN finance_reconciliation_exceptions.status = 'resolved'
        THEN finance_reconciliation_exceptions.status ELSE 'open' END;
  END IF;
END;
$$;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION materialize_merchant_refund_statement(p_refund_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  r refunds%ROWTYPE;
  merchant_row merchants%ROWTYPE;
  ctx RECORD;
BEGIN
  SELECT * INTO r FROM refunds WHERE id = p_refund_id;
  IF NOT FOUND OR r.amount_idr <= 0 THEN RETURN; END IF;
  SELECT merchant.* INTO merchant_row
  FROM merchants merchant JOIN orders o ON o.merchant_id = merchant.id
  WHERE o.id = r.order_id;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT * INTO ctx FROM merchant_financial_context(merchant_row.id);
  IF NOT FOUND THEN RAISE EXCEPTION 'merchant % has no active market financial configuration', merchant_row.id; END IF;
  IF ctx.currency_code <> 'IDR' THEN
    RAISE EXCEPTION 'legacy IDR refund cannot be posted to non-IDR merchant statement';
  END IF;
  PERFORM append_merchant_statement_entry(
    merchant_row.id, ctx.market_code, ctx.currency_code, ctx.currency_minor_unit,
    'refund', 'debit', r.amount_idr, TRUE,
    'refund', r.id::TEXT, r.order_id, NULL, r.id, NULL,
    r.updated_at, 'Customer refund',
    jsonb_build_object('status', r.status, 'reason', r.reason),
    'merchant-refund:' || r.id
  );
END;
$$;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION materialize_merchant_withdrawal_statement(p_withdrawal_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  w merchant_withdrawal_requests%ROWTYPE;
BEGIN
  SELECT * INTO w FROM merchant_withdrawal_requests WHERE id = p_withdrawal_id;
  IF NOT FOUND OR w.amount_minor <= 0 THEN RETURN; END IF;
  IF w.status <> 'completed' THEN RETURN; END IF;
  PERFORM append_merchant_statement_entry(
    w.merchant_id, w.market_code, w.currency_code, w.currency_minor_unit,
    'payout', 'debit', w.amount_minor, TRUE,
    'merchant_withdrawal', w.id::TEXT, NULL, NULL, NULL, w.id,
    w.updated_at, 'Merchant payout withdrawal',
    jsonb_build_object('disbursement_ref', COALESCE(w.disbursement_ref, '')),
    'merchant-withdrawal:' || w.id
  );
END;
$$;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION merchant_settlement_statement_after_insert()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM materialize_merchant_settlement_statement(NEW.id);
  RETURN NEW;
END;
$$;
-- +goose StatementEnd

DROP TRIGGER IF EXISTS trg_merchant_settlement_statement_after_insert ON merchant_settlements;
CREATE TRIGGER trg_merchant_settlement_statement_after_insert
AFTER INSERT ON merchant_settlements
FOR EACH ROW EXECUTE FUNCTION merchant_settlement_statement_after_insert();

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION merchant_refund_statement_after_change()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IN ('processed', 'refunded')
     AND (TG_OP = 'INSERT' OR OLD.status NOT IN ('processed', 'refunded')) THEN
    PERFORM materialize_merchant_refund_statement(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;
-- +goose StatementEnd

DROP TRIGGER IF EXISTS trg_merchant_refund_statement_after_change ON refunds;
CREATE TRIGGER trg_merchant_refund_statement_after_change
AFTER INSERT OR UPDATE OF status ON refunds
FOR EACH ROW EXECUTE FUNCTION merchant_refund_statement_after_change();

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION merchant_withdrawal_statement_after_change()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'completed'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    PERFORM materialize_merchant_withdrawal_statement(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;
-- +goose StatementEnd

DROP TRIGGER IF EXISTS trg_merchant_withdrawal_statement_after_change ON merchant_withdrawal_requests;
CREATE TRIGGER trg_merchant_withdrawal_statement_after_change
AFTER INSERT OR UPDATE OF status ON merchant_withdrawal_requests
FOR EACH ROW EXECUTE FUNCTION merchant_withdrawal_statement_after_change();

-- A settled settlement/refund cannot have its money facts rewritten. Workflow
-- status may still transition through the existing settlement state machine.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION guard_merchant_financial_history()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'merchant_settlements' THEN
    IF NEW.merchant_id IS DISTINCT FROM OLD.merchant_id
       OR NEW.order_id IS DISTINCT FROM OLD.order_id
       OR NEW.market_code IS DISTINCT FROM OLD.market_code
       OR NEW.currency_code IS DISTINCT FROM OLD.currency_code
       OR NEW.currency_minor_unit IS DISTINCT FROM OLD.currency_minor_unit
       OR NEW.gross_item_price_idr IS DISTINCT FROM OLD.gross_item_price_idr
       OR NEW.merchant_fee_idr IS DISTINCT FROM OLD.merchant_fee_idr
       OR NEW.disbursement_fee_idr IS DISTINCT FROM OLD.disbursement_fee_idr
       OR NEW.merchant_promo_discount_idr IS DISTINCT FROM OLD.merchant_promo_discount_idr
       OR NEW.net_payout_idr IS DISTINCT FROM OLD.net_payout_idr
       OR NEW.gross_item_price_minor IS DISTINCT FROM OLD.gross_item_price_minor
       OR NEW.merchant_fee_minor IS DISTINCT FROM OLD.merchant_fee_minor
       OR NEW.disbursement_fee_minor IS DISTINCT FROM OLD.disbursement_fee_minor
       OR NEW.merchant_promo_discount_minor IS DISTINCT FROM OLD.merchant_promo_discount_minor
       OR NEW.net_payout_minor IS DISTINCT FROM OLD.net_payout_minor THEN
      RAISE EXCEPTION 'merchant settlement financial facts are immutable; use a compensating entry';
    END IF;
  ELSIF TG_TABLE_NAME = 'refunds' AND OLD.status IN ('processed', 'refunded') THEN
    IF NEW.order_id IS DISTINCT FROM OLD.order_id
       OR NEW.amount_idr IS DISTINCT FROM OLD.amount_idr
       OR NEW.tax_reversal_idr IS DISTINCT FROM OLD.tax_reversal_idr
       OR NEW.platform_fee_reversal_idr IS DISTINCT FROM OLD.platform_fee_reversal_idr THEN
      RAISE EXCEPTION 'processed refund financial facts are immutable; use a compensating entry';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
-- +goose StatementEnd

DROP TRIGGER IF EXISTS trg_guard_merchant_settlement_financial_history ON merchant_settlements;
CREATE TRIGGER trg_guard_merchant_settlement_financial_history
BEFORE UPDATE ON merchant_settlements
FOR EACH ROW EXECUTE FUNCTION guard_merchant_financial_history();

DROP TRIGGER IF EXISTS trg_guard_refund_financial_history ON refunds;
CREATE TRIGGER trg_guard_refund_financial_history
BEFORE UPDATE ON refunds
FOR EACH ROW EXECUTE FUNCTION guard_merchant_financial_history();

-- Any bank-account change resets verification, bumps the version and starts a
-- configurable cooldown. Only last-four digits are retained in the event log.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION merchant_bank_account_lifecycle_guard()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  cooldown_hours INTEGER;
BEGIN
  IF NEW.bank_name IS DISTINCT FROM OLD.bank_name
     OR NEW.bank_account_number IS DISTINCT FROM OLD.bank_account_number
     OR NEW.bank_account_holder IS DISTINCT FROM OLD.bank_account_holder THEN
    SELECT COALESCE(
      CASE WHEN (value #>> '{}') ~ '^[0-9]+$'
        THEN (value #>> '{}')::INTEGER
      END,
      24
    ) INTO cooldown_hours
    FROM system_configs WHERE key = 'merchant_bank_account_cooldown_hours';
    cooldown_hours := COALESCE(cooldown_hours, 24);
    IF cooldown_hours < 1 OR cooldown_hours > 168 THEN cooldown_hours := 24; END IF;

    NEW.bank_account_verified := FALSE;
    NEW.bank_account_changed_at := NOW();
    NEW.bank_account_cooldown_until := NOW() + make_interval(hours => cooldown_hours);
    NEW.bank_account_version := OLD.bank_account_version + 1;

    INSERT INTO merchant_bank_account_events (
      merchant_id, account_version, old_bank_name, new_bank_name,
      old_account_last4, new_account_last4
    ) VALUES (
      NEW.id, NEW.bank_account_version, OLD.bank_name, NEW.bank_name,
      RIGHT(COALESCE(OLD.bank_account_number, ''), 4),
      RIGHT(COALESCE(NEW.bank_account_number, ''), 4)
    );
  END IF;
  RETURN NEW;
END;
$$;
-- +goose StatementEnd

DROP TRIGGER IF EXISTS trg_merchant_bank_account_lifecycle_guard ON merchants;
CREATE TRIGGER trg_merchant_bank_account_lifecycle_guard
BEFORE UPDATE ON merchants
FOR EACH ROW EXECUTE FUNCTION merchant_bank_account_lifecycle_guard();

-- Backfill statement evidence through the same idempotent functions used by
-- new writes. The loop is intentionally fail-closed for an unknown market.
-- +goose StatementBegin
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM merchant_settlements ORDER BY created_at LOOP
    PERFORM materialize_merchant_settlement_statement(r.id);
  END LOOP;
  FOR r IN SELECT id FROM refunds WHERE status IN ('processed', 'refunded') ORDER BY created_at LOOP
    PERFORM materialize_merchant_refund_statement(r.id);
  END LOOP;
  FOR r IN SELECT id FROM merchant_withdrawal_requests WHERE status = 'completed' ORDER BY created_at LOOP
    PERFORM materialize_merchant_withdrawal_statement(r.id);
  END LOOP;
END
$$;
-- +goose StatementEnd

-- +goose Down
DROP TRIGGER IF EXISTS trg_merchant_bank_account_lifecycle_guard ON merchants;
DROP FUNCTION IF EXISTS merchant_bank_account_lifecycle_guard();
DROP TRIGGER IF EXISTS trg_guard_refund_financial_history ON refunds;
DROP TRIGGER IF EXISTS trg_guard_merchant_settlement_financial_history ON merchant_settlements;
DROP FUNCTION IF EXISTS guard_merchant_financial_history();
DROP TRIGGER IF EXISTS trg_merchant_withdrawal_statement_after_change ON merchant_withdrawal_requests;
DROP FUNCTION IF EXISTS merchant_withdrawal_statement_after_change();
DROP TRIGGER IF EXISTS trg_merchant_refund_statement_after_change ON refunds;
DROP FUNCTION IF EXISTS merchant_refund_statement_after_change();
DROP TRIGGER IF EXISTS trg_merchant_settlement_statement_after_insert ON merchant_settlements;
DROP FUNCTION IF EXISTS merchant_settlement_statement_after_insert();
DROP FUNCTION IF EXISTS materialize_merchant_withdrawal_statement(UUID);
DROP FUNCTION IF EXISTS materialize_merchant_refund_statement(UUID);
DROP FUNCTION IF EXISTS materialize_merchant_settlement_statement(UUID);
DROP FUNCTION IF EXISTS append_merchant_statement_entry(UUID, TEXT, TEXT, SMALLINT, TEXT, TEXT, BIGINT, BOOLEAN, TEXT, TEXT, UUID, UUID, UUID, UUID, TIMESTAMPTZ, TEXT, JSONB, TEXT);
DROP FUNCTION IF EXISTS merchant_financial_context(UUID);
DROP TRIGGER IF EXISTS trg_populate_merchant_withdrawal_financial_context ON merchant_withdrawal_requests;
DROP TRIGGER IF EXISTS trg_populate_merchant_settlement_financial_context ON merchant_settlements;
DROP FUNCTION IF EXISTS populate_merchant_financial_context();
DROP TRIGGER IF EXISTS trg_prevent_merchant_statement_mutation ON merchant_statement_entries;
DROP FUNCTION IF EXISTS prevent_merchant_statement_mutation();
DROP TABLE IF EXISTS merchant_statement_entries;
DROP TABLE IF EXISTS merchant_bank_account_events;
ALTER TABLE merchant_withdrawal_requests
  DROP CONSTRAINT IF EXISTS merchant_withdrawal_currency_amount_ck,
  DROP CONSTRAINT IF EXISTS merchant_withdrawal_requests_amount_idr_check,
  DROP COLUMN IF EXISTS amount_minor,
  DROP COLUMN IF EXISTS currency_minor_unit,
  DROP COLUMN IF EXISTS currency_code,
  DROP COLUMN IF EXISTS market_code;
ALTER TABLE merchant_settlements
  DROP CONSTRAINT IF EXISTS merchant_settlements_currency_amounts_ck,
  DROP CONSTRAINT IF EXISTS merchant_settlements_gross_item_price_idr_check;
ALTER TABLE merchant_settlements
  ADD CONSTRAINT merchant_settlements_gross_item_price_idr_check
  CHECK (gross_item_price_idr > 0);
ALTER TABLE merchant_settlements
  DROP COLUMN IF EXISTS net_payout_minor,
  DROP COLUMN IF EXISTS merchant_promo_discount_minor,
  DROP COLUMN IF EXISTS disbursement_fee_minor,
  DROP COLUMN IF EXISTS merchant_fee_minor,
  DROP COLUMN IF EXISTS gross_item_price_minor,
  DROP COLUMN IF EXISTS currency_minor_unit,
  DROP COLUMN IF EXISTS currency_code,
  DROP COLUMN IF EXISTS market_code;
ALTER TABLE finance_reconciliation_exceptions
  DROP COLUMN IF EXISTS difference_minor,
  DROP COLUMN IF EXISTS actual_minor,
  DROP COLUMN IF EXISTS expected_minor,
  DROP COLUMN IF EXISTS currency_minor_unit,
  DROP COLUMN IF EXISTS currency_code,
  DROP COLUMN IF EXISTS market_code,
  DROP COLUMN IF EXISTS merchant_id;
DELETE FROM system_configs WHERE key = 'merchant_bank_account_cooldown_hours';
ALTER TABLE merchants
  DROP CONSTRAINT IF EXISTS merchants_bank_account_version_positive_ck,
  DROP COLUMN IF EXISTS bank_account_version,
  DROP COLUMN IF EXISTS bank_account_cooldown_until,
  DROP COLUMN IF EXISTS bank_account_changed_at;
