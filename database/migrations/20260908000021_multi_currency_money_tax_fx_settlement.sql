-- +goose Up
-- GLOB-2026-002: canonical multi-currency money, tax context, FX locks and
-- currency-safe ledger settlement. Legacy *_idr columns remain readable for
-- existing integrations, but new canonical minor-unit columns are authoritative.

-- Core transaction amounts. IDR is the compatibility default for historical
-- rows; non-IDR rows must use the canonical *_minor columns.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS currency_code VARCHAR(3) NOT NULL DEFAULT 'IDR',
  ADD COLUMN IF NOT EXISTS currency_minor_unit SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS base_price_minor BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS distance_fee_minor BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS volumetric_surcharge_minor BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dynamic_price_minor BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_minor BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS insurance_premium_minor BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS platform_fee_minor BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS promo_subsidy_minor BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_price_minor BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dpp_minor BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ppn_minor BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_rule_version VARCHAR(160),
  ADD COLUMN IF NOT EXISTS tax_jurisdiction VARCHAR(80);

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS currency_code VARCHAR(3) NOT NULL DEFAULT 'IDR',
  ADD COLUMN IF NOT EXISTS currency_minor_unit SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amount_minor BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mdr_amount_minor BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ppn_amount_minor BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS weather_reserve_minor BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS insurance_reserve_minor BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_operational_minor BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_rule_version VARCHAR(160),
  ADD COLUMN IF NOT EXISTS tax_jurisdiction VARCHAR(80);

ALTER TABLE refunds
  ADD COLUMN IF NOT EXISTS currency_code VARCHAR(3) NOT NULL DEFAULT 'IDR',
  ADD COLUMN IF NOT EXISTS currency_minor_unit SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amount_minor BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_reversal_minor BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS platform_fee_reversal_minor BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cancellation_fee_minor BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_rule_version VARCHAR(160),
  ADD COLUMN IF NOT EXISTS tax_jurisdiction VARCHAR(80);

ALTER TABLE payout_records
  ADD COLUMN IF NOT EXISTS currency_code VARCHAR(3) NOT NULL DEFAULT 'IDR',
  ADD COLUMN IF NOT EXISTS currency_minor_unit SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gross_minor BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS penalty_minor BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS idle_compensation_minor BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_minor BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pph21_minor BIGINT NOT NULL DEFAULT 0;

ALTER TABLE ledger_journals
  ADD COLUMN IF NOT EXISTS currency_code VARCHAR(3) NOT NULL DEFAULT 'IDR',
  ADD COLUMN IF NOT EXISTS currency_minor_unit SMALLINT NOT NULL DEFAULT 0;

ALTER TABLE ledger_entries
  ADD COLUMN IF NOT EXISTS currency_code VARCHAR(3) NOT NULL DEFAULT 'IDR',
  ADD COLUMN IF NOT EXISTS currency_minor_unit SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS debit_minor BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credit_minor BIGINT NOT NULL DEFAULT 0;

-- Ledger tables are append-only, so their checks are installed before the
-- one-time backfill. NOT VALID permits the old zero-filled canonical columns
-- during the same migration; the backfill establishes validity for all
-- existing rows and PostgreSQL enforces the checks for every future write.
ALTER TABLE ledger_journals DROP CONSTRAINT IF EXISTS ledger_journals_currency_code_ck;
ALTER TABLE ledger_journals ADD CONSTRAINT ledger_journals_currency_code_ck CHECK (currency_code ~ '^[A-Z]{3}$') NOT VALID;
ALTER TABLE ledger_journals DROP CONSTRAINT IF EXISTS ledger_journals_currency_minor_unit_ck;
ALTER TABLE ledger_journals ADD CONSTRAINT ledger_journals_currency_minor_unit_ck CHECK (currency_minor_unit BETWEEN 0 AND 3) NOT VALID;
ALTER TABLE ledger_entries DROP CONSTRAINT IF EXISTS ledger_entries_currency_code_ck;
ALTER TABLE ledger_entries ADD CONSTRAINT ledger_entries_currency_code_ck CHECK (currency_code ~ '^[A-Z]{3}$') NOT VALID;
ALTER TABLE ledger_entries DROP CONSTRAINT IF EXISTS ledger_entries_currency_minor_unit_ck;
ALTER TABLE ledger_entries ADD CONSTRAINT ledger_entries_currency_minor_unit_ck CHECK (currency_minor_unit BETWEEN 0 AND 3) NOT VALID;
ALTER TABLE ledger_entries DROP CONSTRAINT IF EXISTS ledger_entries_currency_amounts_ck;
ALTER TABLE ledger_entries ADD CONSTRAINT ledger_entries_currency_amounts_ck CHECK (
  currency_code <> 'IDR' OR (debit_minor = debit_idr AND credit_minor = credit_idr)
) NOT VALID;
CREATE INDEX IF NOT EXISTS idx_ledger_entries_currency_journal ON ledger_entries(journal_id, currency_code);

-- Backfill canonical amounts from the existing IDR facts. This is deliberately
-- explicit instead of relying on application reads so old rows are safe for
-- reconciliation immediately after this migration.
UPDATE orders
SET currency_code = COALESCE(NULLIF(currency_code, ''), 'IDR'),
    currency_minor_unit = 0,
    base_price_minor = COALESCE(base_price_idr, 0),
    distance_fee_minor = COALESCE(distance_fee_idr, 0),
    volumetric_surcharge_minor = COALESCE(volumetric_surcharge_idr, 0),
    dynamic_price_minor = COALESCE(dynamic_price_idr, 0),
    discount_minor = COALESCE(discount_idr, 0),
    insurance_premium_minor = COALESCE(insurance_premium_idr, 0),
    platform_fee_minor = COALESCE(platform_fee_idr, 0),
    promo_subsidy_minor = COALESCE(promo_subsidy_idr, 0),
    total_price_minor = COALESCE(total_price_idr, 0),
    dpp_minor = COALESCE(dpp_idr, 0),
    ppn_minor = COALESCE(ppn_idr, 0),
    tax_jurisdiction = COALESCE(NULLIF(tax_jurisdiction, ''), 'ID-JK'),
    tax_rule_version = COALESCE(tax_rule_version, NULLIF(tax_rule_code, '') || '@legacy')
WHERE currency_code = 'IDR';

UPDATE payments
SET currency_code = COALESCE(NULLIF(currency_code, ''), 'IDR'),
    currency_minor_unit = 0,
    amount_minor = COALESCE(amount_idr, 0),
    mdr_amount_minor = COALESCE(mdr_amount_idr, 0),
    ppn_amount_minor = COALESCE(ppn_amount_idr, 0),
    weather_reserve_minor = COALESCE(weather_reserve_idr, 0),
    insurance_reserve_minor = COALESCE(insurance_reserve_idr, 0),
    net_operational_minor = COALESCE(net_operational_idr, 0),
    tax_jurisdiction = COALESCE(NULLIF(tax_jurisdiction, ''), 'ID-JK'),
    tax_rule_version = COALESCE(tax_rule_version, NULLIF(tax_rule_code, '') || '@legacy')
WHERE currency_code = 'IDR';

UPDATE refunds
SET currency_code = COALESCE(NULLIF(currency_code, ''), 'IDR'),
    currency_minor_unit = 0,
    amount_minor = COALESCE(amount_idr, 0),
    tax_reversal_minor = COALESCE(tax_reversal_idr, 0),
    platform_fee_reversal_minor = COALESCE(platform_fee_reversal_idr, 0),
    cancellation_fee_minor = COALESCE(cancellation_fee_idr, 0),
    tax_jurisdiction = COALESCE(NULLIF(tax_jurisdiction, ''), 'ID-JK')
WHERE currency_code = 'IDR';

UPDATE payout_records
SET currency_code = COALESCE(NULLIF(currency_code, ''), 'IDR'),
    currency_minor_unit = 0,
    gross_minor = COALESCE(gross_idr, 0),
    penalty_minor = COALESCE(penalty_idr, 0),
    idle_compensation_minor = COALESCE(idle_compensation_idr, 0),
    net_minor = COALESCE(net_idr, 0),
    pph21_minor = COALESCE(pph21_idr, 0)
WHERE currency_code = 'IDR';

-- Existing ledger rows are append-only. The migration lock plus transaction
-- makes this one-time schema backfill safe; the protection trigger is restored
-- before the migration commits.
DROP TRIGGER IF EXISTS trg_prevent_ledger_entries_mutation ON ledger_entries;
DROP TRIGGER IF EXISTS trg_prevent_ledger_journals_mutation ON ledger_journals;
-- Backfill DML would otherwise leave deferred balance events pending, which
-- PostgreSQL correctly refuses to combine with ALTER TABLE in one transaction.
DROP TRIGGER IF EXISTS trg_check_journal_balance ON ledger_entries;

UPDATE ledger_journals
SET currency_code = COALESCE(NULLIF(currency_code, ''), 'IDR'), currency_minor_unit = 0
WHERE currency_code = 'IDR';

UPDATE ledger_entries
SET currency_code = COALESCE(NULLIF(currency_code, ''), 'IDR'),
    currency_minor_unit = 0,
    debit_minor = COALESCE(debit_idr, 0),
    credit_minor = COALESCE(credit_idr, 0)
WHERE currency_code = 'IDR';

CREATE TRIGGER trg_prevent_ledger_journals_mutation
  BEFORE UPDATE OR DELETE ON ledger_journals
  FOR EACH ROW EXECUTE FUNCTION prevent_ledger_mutation();
CREATE TRIGGER trg_prevent_ledger_entries_mutation
  BEFORE UPDATE OR DELETE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION prevent_ledger_mutation();

-- A single compatibility trigger keeps direct legacy IDR writes consistent
-- with canonical values. It does not reinterpret non-IDR rows as IDR.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION sync_money_legacy_compatibility()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_TABLE_NAME = 'orders' AND COALESCE(NEW.currency_code, 'IDR') = 'IDR' THEN
    NEW.currency_code := 'IDR'; NEW.currency_minor_unit := 0;
    NEW.base_price_minor := COALESCE(NEW.base_price_idr, 0);
    NEW.distance_fee_minor := COALESCE(NEW.distance_fee_idr, 0);
    NEW.volumetric_surcharge_minor := COALESCE(NEW.volumetric_surcharge_idr, 0);
    NEW.dynamic_price_minor := COALESCE(NEW.dynamic_price_idr, 0);
    NEW.discount_minor := COALESCE(NEW.discount_idr, 0);
    NEW.insurance_premium_minor := COALESCE(NEW.insurance_premium_idr, 0);
    NEW.platform_fee_minor := COALESCE(NEW.platform_fee_idr, 0);
    NEW.promo_subsidy_minor := COALESCE(NEW.promo_subsidy_idr, 0);
    NEW.total_price_minor := COALESCE(NEW.total_price_idr, 0);
    NEW.dpp_minor := COALESCE(NEW.dpp_idr, 0);
    NEW.ppn_minor := COALESCE(NEW.ppn_idr, 0);
  ELSIF TG_TABLE_NAME = 'payments' AND COALESCE(NEW.currency_code, 'IDR') = 'IDR' THEN
    NEW.currency_code := 'IDR'; NEW.currency_minor_unit := 0;
    NEW.amount_minor := COALESCE(NEW.amount_idr, 0);
    NEW.mdr_amount_minor := COALESCE(NEW.mdr_amount_idr, 0);
    NEW.ppn_amount_minor := COALESCE(NEW.ppn_amount_idr, 0);
    NEW.weather_reserve_minor := COALESCE(NEW.weather_reserve_idr, 0);
    NEW.insurance_reserve_minor := COALESCE(NEW.insurance_reserve_idr, 0);
    NEW.net_operational_minor := COALESCE(NEW.net_operational_idr, 0);
  ELSIF TG_TABLE_NAME = 'refunds' AND COALESCE(NEW.currency_code, 'IDR') = 'IDR' THEN
    NEW.currency_code := 'IDR'; NEW.currency_minor_unit := 0;
    NEW.amount_minor := COALESCE(NEW.amount_idr, 0);
    NEW.tax_reversal_minor := COALESCE(NEW.tax_reversal_idr, 0);
    NEW.platform_fee_reversal_minor := COALESCE(NEW.platform_fee_reversal_idr, 0);
    NEW.cancellation_fee_minor := COALESCE(NEW.cancellation_fee_idr, 0);
  ELSIF TG_TABLE_NAME = 'payout_records' AND COALESCE(NEW.currency_code, 'IDR') = 'IDR' THEN
    NEW.currency_code := 'IDR'; NEW.currency_minor_unit := 0;
    NEW.gross_minor := COALESCE(NEW.gross_idr, 0);
    NEW.penalty_minor := COALESCE(NEW.penalty_idr, 0);
    NEW.idle_compensation_minor := COALESCE(NEW.idle_compensation_idr, 0);
    NEW.net_minor := COALESCE(NEW.net_idr, 0);
    NEW.pph21_minor := COALESCE(NEW.pph21_idr, 0);
  ELSIF TG_TABLE_NAME = 'ledger_entries' AND COALESCE(NEW.currency_code, 'IDR') = 'IDR' THEN
    NEW.currency_code := 'IDR'; NEW.currency_minor_unit := 0;
    NEW.debit_minor := COALESCE(NEW.debit_idr, 0);
    NEW.credit_minor := COALESCE(NEW.credit_idr, 0);
  END IF;
  RETURN NEW;
END;
$$;
-- +goose StatementEnd

DROP TRIGGER IF EXISTS trg_orders_money_compatibility ON orders;
CREATE TRIGGER trg_orders_money_compatibility
  BEFORE INSERT OR UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION sync_money_legacy_compatibility();
DROP TRIGGER IF EXISTS trg_payments_money_compatibility ON payments;
CREATE TRIGGER trg_payments_money_compatibility
  BEFORE INSERT OR UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION sync_money_legacy_compatibility();
DROP TRIGGER IF EXISTS trg_refunds_money_compatibility ON refunds;
CREATE TRIGGER trg_refunds_money_compatibility
  BEFORE INSERT OR UPDATE ON refunds
  FOR EACH ROW EXECUTE FUNCTION sync_money_legacy_compatibility();
DROP TRIGGER IF EXISTS trg_payout_records_money_compatibility ON payout_records;
CREATE TRIGGER trg_payout_records_money_compatibility
  BEFORE INSERT OR UPDATE ON payout_records
  FOR EACH ROW EXECUTE FUNCTION sync_money_legacy_compatibility();
DROP TRIGGER IF EXISTS trg_ledger_entries_money_compatibility ON ledger_entries;
CREATE TRIGGER trg_ledger_entries_money_compatibility
  BEFORE INSERT OR UPDATE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION sync_money_legacy_compatibility();

-- The legacy ledger constraints and deferred balance trigger used *_idr
-- columns, which would reject or miscompare a valid non-IDR journal. Keep the
-- old columns as an IDR compatibility view, but make canonical minor units the
-- accounting source of truth.
ALTER TABLE ledger_entries DROP CONSTRAINT IF EXISTS chk_not_both_zero;
ALTER TABLE ledger_entries ADD CONSTRAINT chk_not_both_zero CHECK (debit_minor > 0 OR credit_minor > 0);
ALTER TABLE ledger_entries DROP CONSTRAINT IF EXISTS chk_positive_amounts;
ALTER TABLE ledger_entries ADD CONSTRAINT chk_positive_amounts CHECK (debit_minor >= 0 AND credit_minor >= 0);

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION check_journal_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  journal_currency TEXT;
  journal_minor_unit INTEGER;
  total_debit BIGINT;
  total_credit BIGINT;
BEGIN
  SELECT currency_code, currency_minor_unit
    INTO journal_currency, journal_minor_unit
    FROM ledger_journals
   WHERE id = NEW.journal_id;

  IF journal_currency IS NULL THEN
    RAISE EXCEPTION 'Journal % does not exist', NEW.journal_id;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM ledger_entries
     WHERE journal_id = NEW.journal_id
       AND (currency_code <> journal_currency OR currency_minor_unit <> journal_minor_unit)
  ) THEN
    RAISE EXCEPTION 'Journal % contains mixed currency metadata', NEW.journal_id;
  END IF;

  SELECT COALESCE(SUM(debit_minor), 0), COALESCE(SUM(credit_minor), 0)
    INTO total_debit, total_credit
    FROM ledger_entries
   WHERE journal_id = NEW.journal_id;

  IF total_debit <> total_credit THEN
    RAISE EXCEPTION 'Journal % is unbalanced: Debit = %, Credit = %', NEW.journal_id, total_debit, total_credit;
  END IF;

  RETURN NEW;
END;
$$;
-- +goose StatementEnd
CREATE CONSTRAINT TRIGGER trg_check_journal_balance
  AFTER INSERT OR UPDATE ON ledger_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION check_journal_balance();

-- Currency metadata and amount invariants are enforced in the database as
-- well as in Go so ad-hoc jobs cannot compare currencies silently.
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_currency_code_ck;
ALTER TABLE orders ADD CONSTRAINT orders_currency_code_ck CHECK (currency_code ~ '^[A-Z]{3}$');
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_currency_minor_unit_ck;
ALTER TABLE orders ADD CONSTRAINT orders_currency_minor_unit_ck CHECK (currency_minor_unit BETWEEN 0 AND 3);
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_currency_amounts_ck;
ALTER TABLE orders ADD CONSTRAINT orders_currency_amounts_ck CHECK (
  currency_code <> 'IDR' OR (
    currency_minor_unit = 0 AND base_price_minor = COALESCE(base_price_idr, 0)
    AND distance_fee_minor = COALESCE(distance_fee_idr, 0)
    AND volumetric_surcharge_minor = COALESCE(volumetric_surcharge_idr, 0)
    AND dynamic_price_minor = COALESCE(dynamic_price_idr, 0)
    AND discount_minor = COALESCE(discount_idr, 0)
    AND insurance_premium_minor = COALESCE(insurance_premium_idr, 0)
    AND platform_fee_minor = COALESCE(platform_fee_idr, 0)
    AND promo_subsidy_minor = COALESCE(promo_subsidy_idr, 0)
    AND total_price_minor = COALESCE(total_price_idr, 0)
    AND dpp_minor = COALESCE(dpp_idr, 0)
    AND ppn_minor = COALESCE(ppn_idr, 0)
  )
);

ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_currency_code_ck;
ALTER TABLE payments ADD CONSTRAINT payments_currency_code_ck CHECK (currency_code ~ '^[A-Z]{3}$');
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_currency_minor_unit_ck;
ALTER TABLE payments ADD CONSTRAINT payments_currency_minor_unit_ck CHECK (currency_minor_unit BETWEEN 0 AND 3);
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_currency_amounts_ck;
ALTER TABLE payments ADD CONSTRAINT payments_currency_amounts_ck CHECK (
  currency_code <> 'IDR' OR (
    currency_minor_unit = 0 AND amount_minor = amount_idr
    AND mdr_amount_minor = mdr_amount_idr AND ppn_amount_minor = ppn_amount_idr
    AND weather_reserve_minor = weather_reserve_idr
    AND insurance_reserve_minor = COALESCE(insurance_reserve_idr, 0)
    AND net_operational_minor = net_operational_idr
  )
);

ALTER TABLE refunds DROP CONSTRAINT IF EXISTS refunds_currency_code_ck;
ALTER TABLE refunds ADD CONSTRAINT refunds_currency_code_ck CHECK (currency_code ~ '^[A-Z]{3}$');
ALTER TABLE refunds DROP CONSTRAINT IF EXISTS refunds_currency_minor_unit_ck;
ALTER TABLE refunds ADD CONSTRAINT refunds_currency_minor_unit_ck CHECK (currency_minor_unit BETWEEN 0 AND 3);
ALTER TABLE refunds DROP CONSTRAINT IF EXISTS refunds_currency_amounts_ck;
ALTER TABLE refunds ADD CONSTRAINT refunds_currency_amounts_ck CHECK (
  currency_code <> 'IDR' OR (
    currency_minor_unit = 0 AND amount_minor = amount_idr
    AND tax_reversal_minor = tax_reversal_idr
    AND platform_fee_reversal_minor = platform_fee_reversal_idr
    AND cancellation_fee_minor = cancellation_fee_idr
  )
);

ALTER TABLE payout_records DROP CONSTRAINT IF EXISTS payout_records_currency_code_ck;
ALTER TABLE payout_records ADD CONSTRAINT payout_records_currency_code_ck CHECK (currency_code ~ '^[A-Z]{3}$');
ALTER TABLE payout_records DROP CONSTRAINT IF EXISTS payout_records_currency_minor_unit_ck;
ALTER TABLE payout_records ADD CONSTRAINT payout_records_currency_minor_unit_ck CHECK (currency_minor_unit BETWEEN 0 AND 3);
ALTER TABLE payout_records DROP CONSTRAINT IF EXISTS payout_records_currency_amounts_ck;
ALTER TABLE payout_records ADD CONSTRAINT payout_records_currency_amounts_ck CHECK (
  currency_code <> 'IDR' OR (
    currency_minor_unit = 0 AND gross_minor = gross_idr AND penalty_minor = penalty_idr
    AND idle_compensation_minor = idle_compensation_idr AND net_minor = net_idr
    AND pph21_minor = pph21_idr
  )
);

-- Cross-currency conversion is an auditable, immutable record. The locked
-- rate reference is mandatory so later reconciliation can replay the exact
-- conversion context.
CREATE TABLE IF NOT EXISTS fx_conversion_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_type VARCHAR(50) NOT NULL,
  reference_id VARCHAR(160) NOT NULL,
  source_currency VARCHAR(3) NOT NULL,
  source_minor_unit SMALLINT NOT NULL,
  source_amount_minor BIGINT NOT NULL,
  target_currency VARCHAR(3) NOT NULL,
  target_minor_unit SMALLINT NOT NULL,
  target_amount_minor BIGINT NOT NULL,
  fx_rate TEXT NOT NULL,
  rate_source VARCHAR(100) NOT NULL,
  rate_timestamp TIMESTAMPTZ NOT NULL,
  spread_minor BIGINT NOT NULL DEFAULT 0,
  fee_minor BIGINT NOT NULL DEFAULT 0,
  locked_rate_reference VARCHAR(160) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fx_conversion_currency_distinct_ck CHECK (source_currency <> target_currency),
  CONSTRAINT fx_conversion_currency_code_ck CHECK (source_currency ~ '^[A-Z]{3}$' AND target_currency ~ '^[A-Z]{3}$'),
  CONSTRAINT fx_conversion_minor_unit_ck CHECK (source_minor_unit BETWEEN 0 AND 3 AND target_minor_unit BETWEEN 0 AND 3),
  CONSTRAINT fx_conversion_amounts_ck CHECK (source_amount_minor >= 0 AND target_amount_minor >= 0 AND spread_minor >= 0 AND fee_minor >= 0),
  CONSTRAINT fx_conversion_rate_format_ck CHECK (fx_rate ~ '^[0-9]+(\\.[0-9]+)?$')
);

CREATE INDEX IF NOT EXISTS idx_fx_conversion_reference
  ON fx_conversion_records(reference_type, reference_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_fx_conversion_locked_reference
  ON fx_conversion_records(locked_rate_reference);

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION prevent_fx_conversion_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'FX conversion records are immutable; create a compensating conversion instead';
END;
$$;
-- +goose StatementEnd

DROP TRIGGER IF EXISTS trg_fx_conversion_immutable ON fx_conversion_records;
CREATE TRIGGER trg_fx_conversion_immutable
  BEFORE UPDATE OR DELETE ON fx_conversion_records
  FOR EACH ROW EXECUTE FUNCTION prevent_fx_conversion_mutation();

CREATE INDEX IF NOT EXISTS idx_orders_currency_created ON orders(currency_code, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_currency_created ON payments(currency_code, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payout_records_currency_status ON payout_records(currency_code, disbursement_status);
-- +goose Down
DROP TRIGGER IF EXISTS trg_fx_conversion_immutable ON fx_conversion_records;
DROP FUNCTION IF EXISTS prevent_fx_conversion_mutation();
DROP INDEX IF EXISTS uq_fx_conversion_locked_reference;
DROP INDEX IF EXISTS idx_fx_conversion_reference;
DROP TABLE IF EXISTS fx_conversion_records;

DROP INDEX IF EXISTS idx_ledger_entries_currency_journal;
DROP INDEX IF EXISTS idx_payout_records_currency_status;
DROP INDEX IF EXISTS idx_payments_currency_created;
DROP INDEX IF EXISTS idx_orders_currency_created;

DROP TRIGGER IF EXISTS trg_ledger_entries_money_compatibility ON ledger_entries;
DROP TRIGGER IF EXISTS trg_payout_records_money_compatibility ON payout_records;
DROP TRIGGER IF EXISTS trg_refunds_money_compatibility ON refunds;
DROP TRIGGER IF EXISTS trg_payments_money_compatibility ON payments;
DROP TRIGGER IF EXISTS trg_orders_money_compatibility ON orders;
DROP FUNCTION IF EXISTS sync_money_legacy_compatibility();

ALTER TABLE ledger_entries DROP CONSTRAINT IF EXISTS chk_not_both_zero;
ALTER TABLE ledger_entries ADD CONSTRAINT chk_not_both_zero CHECK (debit_idr > 0 OR credit_idr > 0);
ALTER TABLE ledger_entries DROP CONSTRAINT IF EXISTS chk_positive_amounts;
ALTER TABLE ledger_entries ADD CONSTRAINT chk_positive_amounts CHECK (debit_idr >= 0 AND credit_idr >= 0);

-- Restore the legacy trigger function before removing canonical columns.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION check_journal_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    total_debit BIGINT;
    total_credit BIGINT;
BEGIN
    SELECT COALESCE(SUM(debit_idr), 0), COALESCE(SUM(credit_idr), 0)
    INTO total_debit, total_credit
    FROM ledger_entries
    WHERE journal_id = NEW.journal_id;

    IF total_debit <> total_credit THEN
        RAISE EXCEPTION 'Journal % is unbalanced: Debit = %, Credit = %', NEW.journal_id, total_debit, total_credit;
    END IF;

    RETURN NEW;
END;
$$;
-- +goose StatementEnd
DROP TRIGGER IF EXISTS trg_check_journal_balance ON ledger_entries;
CREATE CONSTRAINT TRIGGER trg_check_journal_balance
  AFTER INSERT OR UPDATE ON ledger_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION check_journal_balance();

ALTER TABLE ledger_entries
  DROP CONSTRAINT IF EXISTS ledger_entries_currency_amounts_ck,
  DROP CONSTRAINT IF EXISTS ledger_entries_currency_minor_unit_ck,
  DROP CONSTRAINT IF EXISTS ledger_entries_currency_code_ck,
  DROP COLUMN IF EXISTS credit_minor,
  DROP COLUMN IF EXISTS debit_minor,
  DROP COLUMN IF EXISTS currency_minor_unit,
  DROP COLUMN IF EXISTS currency_code;
ALTER TABLE ledger_journals
  DROP CONSTRAINT IF EXISTS ledger_journals_currency_minor_unit_ck,
  DROP CONSTRAINT IF EXISTS ledger_journals_currency_code_ck,
  DROP COLUMN IF EXISTS currency_minor_unit,
  DROP COLUMN IF EXISTS currency_code;
ALTER TABLE payout_records
  DROP CONSTRAINT IF EXISTS payout_records_currency_amounts_ck,
  DROP CONSTRAINT IF EXISTS payout_records_currency_minor_unit_ck,
  DROP CONSTRAINT IF EXISTS payout_records_currency_code_ck,
  DROP COLUMN IF EXISTS pph21_minor,
  DROP COLUMN IF EXISTS net_minor,
  DROP COLUMN IF EXISTS idle_compensation_minor,
  DROP COLUMN IF EXISTS penalty_minor,
  DROP COLUMN IF EXISTS gross_minor,
  DROP COLUMN IF EXISTS currency_minor_unit,
  DROP COLUMN IF EXISTS currency_code;
ALTER TABLE refunds
  DROP CONSTRAINT IF EXISTS refunds_currency_amounts_ck,
  DROP CONSTRAINT IF EXISTS refunds_currency_minor_unit_ck,
  DROP CONSTRAINT IF EXISTS refunds_currency_code_ck,
  DROP COLUMN IF EXISTS tax_jurisdiction,
  DROP COLUMN IF EXISTS tax_rule_version,
  DROP COLUMN IF EXISTS cancellation_fee_minor,
  DROP COLUMN IF EXISTS platform_fee_reversal_minor,
  DROP COLUMN IF EXISTS tax_reversal_minor,
  DROP COLUMN IF EXISTS amount_minor,
  DROP COLUMN IF EXISTS currency_minor_unit,
  DROP COLUMN IF EXISTS currency_code;
ALTER TABLE payments
  DROP CONSTRAINT IF EXISTS payments_currency_amounts_ck,
  DROP CONSTRAINT IF EXISTS payments_currency_minor_unit_ck,
  DROP CONSTRAINT IF EXISTS payments_currency_code_ck,
  DROP COLUMN IF EXISTS tax_jurisdiction,
  DROP COLUMN IF EXISTS tax_rule_version,
  DROP COLUMN IF EXISTS net_operational_minor,
  DROP COLUMN IF EXISTS insurance_reserve_minor,
  DROP COLUMN IF EXISTS weather_reserve_minor,
  DROP COLUMN IF EXISTS ppn_amount_minor,
  DROP COLUMN IF EXISTS mdr_amount_minor,
  DROP COLUMN IF EXISTS amount_minor,
  DROP COLUMN IF EXISTS currency_minor_unit,
  DROP COLUMN IF EXISTS currency_code;
ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS orders_currency_amounts_ck,
  DROP CONSTRAINT IF EXISTS orders_currency_minor_unit_ck,
  DROP CONSTRAINT IF EXISTS orders_currency_code_ck,
  DROP COLUMN IF EXISTS tax_jurisdiction,
  DROP COLUMN IF EXISTS tax_rule_version,
  DROP COLUMN IF EXISTS ppn_minor,
  DROP COLUMN IF EXISTS dpp_minor,
  DROP COLUMN IF EXISTS total_price_minor,
  DROP COLUMN IF EXISTS promo_subsidy_minor,
  DROP COLUMN IF EXISTS platform_fee_minor,
  DROP COLUMN IF EXISTS insurance_premium_minor,
  DROP COLUMN IF EXISTS discount_minor,
  DROP COLUMN IF EXISTS dynamic_price_minor,
  DROP COLUMN IF EXISTS volumetric_surcharge_minor,
  DROP COLUMN IF EXISTS distance_fee_minor,
  DROP COLUMN IF EXISTS base_price_minor,
  DROP COLUMN IF EXISTS currency_minor_unit,
  DROP COLUMN IF EXISTS currency_code;
