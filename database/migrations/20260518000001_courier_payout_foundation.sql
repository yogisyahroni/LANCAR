-- +goose Up
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS courier_payout_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  courier_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  courier_profile_id UUID REFERENCES courier_profiles(id) ON DELETE CASCADE,
  bank_code VARCHAR(30) NOT NULL,
  account_name VARCHAR(160) NOT NULL,
  account_number_last4 VARCHAR(4) NOT NULL,
  account_number_fingerprint TEXT,
  account_number_vault_ref TEXT NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'pending_review'
    CHECK (status IN ('pending_review', 'verified', 'rejected', 'suspended')),
  is_primary BOOLEAN NOT NULL DEFAULT TRUE,
  verified_by UUID REFERENCES users(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  rejected_reason TEXT,
  suspended_reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT courier_payout_accounts_fingerprint_unique UNIQUE (account_number_fingerprint)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_courier_payout_accounts_primary
  ON courier_payout_accounts(courier_id)
  WHERE is_primary = TRUE;

CREATE INDEX IF NOT EXISTS idx_courier_payout_accounts_review
  ON courier_payout_accounts(status, created_at DESC);

INSERT INTO courier_payout_accounts (
  courier_id,
  courier_profile_id,
  bank_code,
  account_name,
  account_number_last4,
  account_number_fingerprint,
  account_number_vault_ref,
  status,
  verified_at,
  metadata
)
SELECT
  cp.user_id,
  cp.id,
  upper(trim(cp.bank_code)),
  trim(cp.bank_account_name),
  right(regexp_replace(cp.bank_account_number, '\D', '', 'g'), 4),
  encode(digest(upper(trim(cp.bank_code)) || ':' || regexp_replace(cp.bank_account_number, '\D', '', 'g'), 'sha256'), 'hex'),
  'legacy:courier_profiles:' || cp.id::text,
  CASE WHEN cp.is_verified = TRUE THEN 'verified' ELSE 'pending_review' END,
  CASE WHEN cp.is_verified = TRUE THEN COALESCE(cp.reviewed_at, NOW()) ELSE NULL END,
  jsonb_build_object('source', 'courier_profiles_backfill')
FROM courier_profiles cp
WHERE NULLIF(trim(COALESCE(cp.bank_code, '')), '') IS NOT NULL
  AND NULLIF(trim(COALESCE(cp.bank_account_number, '')), '') IS NOT NULL
  AND NULLIF(trim(COALESCE(cp.bank_account_name, '')), '') IS NOT NULL
ON CONFLICT (account_number_fingerprint) DO UPDATE SET
  courier_id = EXCLUDED.courier_id,
  courier_profile_id = EXCLUDED.courier_profile_id,
  account_name = EXCLUDED.account_name,
  status = CASE
    WHEN courier_payout_accounts.status = 'verified' THEN courier_payout_accounts.status
    ELSE EXCLUDED.status
  END,
  verified_at = COALESCE(courier_payout_accounts.verified_at, EXCLUDED.verified_at),
  updated_at = NOW();

CREATE TABLE IF NOT EXISTS courier_payout_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_number VARCHAR(48) NOT NULL DEFAULT ('CPY-' || upper(replace(uuid_generate_v4()::text, '-', ''))),
  courier_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payout_account_id UUID NOT NULL REFERENCES courier_payout_accounts(id) ON DELETE RESTRICT,
  amount_idr INT NOT NULL CHECK (amount_idr > 0),
  fee_idr INT NOT NULL DEFAULT 0 CHECK (fee_idr >= 0),
  net_amount_idr INT GENERATED ALWAYS AS (amount_idr - fee_idr) STORED,
  status VARCHAR(24) NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'under_review', 'approved', 'processing', 'paid', 'failed', 'rejected', 'cancelled')),
  idempotency_key TEXT,
  destination_snapshot JSONB NOT NULL,
  risk_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  failure_reason TEXT,
  requested_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  processed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT courier_payout_requests_request_number_unique UNIQUE (request_number)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_courier_payout_requests_idempotency
  ON courier_payout_requests(courier_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_courier_payout_requests_courier
  ON courier_payout_requests(courier_id, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_courier_payout_requests_status
  ON courier_payout_requests(status, requested_at DESC);

ALTER TABLE courier_earnings_ledger
  ADD COLUMN IF NOT EXISTS transaction_type VARCHAR(32) NOT NULL DEFAULT 'earning_credit',
  ADD COLUMN IF NOT EXISTS payout_request_id UUID REFERENCES courier_payout_requests(id) ON DELETE SET NULL;

ALTER TABLE courier_earnings_ledger
  DROP CONSTRAINT IF EXISTS courier_earnings_ledger_source_check,
  ADD CONSTRAINT courier_earnings_ledger_source_check
    CHECK (source IN ('delivery', 'incentive', 'adjustment', 'reversal', 'payout'));

ALTER TABLE courier_earnings_ledger
  DROP CONSTRAINT IF EXISTS courier_earnings_ledger_settlement_status_check,
  ADD CONSTRAINT courier_earnings_ledger_settlement_status_check
    CHECK (settlement_status IN ('pending', 'available', 'paid', 'held', 'cancelled', 'requested', 'processing', 'failed'));

ALTER TABLE courier_earnings_ledger
  DROP CONSTRAINT IF EXISTS courier_earnings_ledger_transaction_type_check,
  ADD CONSTRAINT courier_earnings_ledger_transaction_type_check
    CHECK (transaction_type IN (
      'earning_credit',
      'payout_hold',
      'payout_requested',
      'payout_paid',
      'payout_failed',
      'adjustment',
      'reversal'
    ));

UPDATE courier_earnings_ledger
SET transaction_type = CASE
    WHEN source = 'delivery' AND direction = 'credit' THEN 'earning_credit'
    WHEN source = 'adjustment' THEN 'adjustment'
    WHEN source = 'reversal' THEN 'reversal'
    ELSE transaction_type
  END
WHERE transaction_type = 'earning_credit';

CREATE INDEX IF NOT EXISTS idx_courier_earnings_ledger_type
  ON courier_earnings_ledger(courier_id, transaction_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_courier_earnings_ledger_payout_request
  ON courier_earnings_ledger(payout_request_id)
  WHERE payout_request_id IS NOT NULL;

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION prevent_courier_earnings_ledger_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'courier_earnings_ledger is append-only; write compensating ledger entries instead';
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd

DROP TRIGGER IF EXISTS trg_courier_earnings_ledger_append_only ON courier_earnings_ledger;
CREATE TRIGGER trg_courier_earnings_ledger_append_only
BEFORE UPDATE OR DELETE ON courier_earnings_ledger
FOR EACH ROW
EXECUTE FUNCTION prevent_courier_earnings_ledger_mutation();

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION request_courier_payout(
  p_courier_id UUID,
  p_amount_idr INT,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS TABLE (
  payout_request_id UUID,
  status VARCHAR,
  available_balance_idr INT
) AS $$
DECLARE
  v_account courier_payout_accounts%ROWTYPE;
  v_existing courier_payout_requests%ROWTYPE;
  v_available_balance INT;
  v_request_id UUID;
BEGIN
  IF p_amount_idr IS NULL OR p_amount_idr <= 0 THEN
    RAISE EXCEPTION 'Payout amount must be greater than zero';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_courier_id::text));

  IF p_idempotency_key IS NOT NULL THEN
    SELECT *
    INTO v_existing
    FROM courier_payout_requests
    WHERE courier_id = p_courier_id
      AND idempotency_key = p_idempotency_key
    LIMIT 1;

    IF FOUND THEN
      SELECT COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount_idr ELSE -amount_idr END), 0)::int
      INTO v_available_balance
      FROM courier_earnings_ledger
      WHERE courier_id = p_courier_id
        AND settlement_status IN ('available', 'requested', 'processing', 'paid');

      payout_request_id := v_existing.id;
      status := v_existing.status;
      available_balance_idr := v_available_balance;
      RETURN NEXT;
      RETURN;
    END IF;
  END IF;

  SELECT *
  INTO v_account
  FROM courier_payout_accounts
  WHERE courier_id = p_courier_id
    AND is_primary = TRUE
    AND courier_payout_accounts.status = 'verified'
  ORDER BY verified_at DESC NULLS LAST, created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Verified payout account is required before requesting payout';
  END IF;

  SELECT COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount_idr ELSE -amount_idr END), 0)::int
  INTO v_available_balance
  FROM courier_earnings_ledger
  WHERE courier_id = p_courier_id
    AND settlement_status IN ('available', 'requested', 'processing', 'paid');

  IF v_available_balance < p_amount_idr THEN
    RAISE EXCEPTION 'Insufficient available payout balance';
  END IF;

  INSERT INTO courier_payout_requests (
    courier_id,
    payout_account_id,
    amount_idr,
    idempotency_key,
    destination_snapshot,
    risk_snapshot,
    requested_by
  ) VALUES (
    p_courier_id,
    v_account.id,
    p_amount_idr,
    p_idempotency_key,
    jsonb_build_object(
      'bank_code', v_account.bank_code,
      'account_name', v_account.account_name,
      'account_number_last4', v_account.account_number_last4,
      'account_number_vault_ref', v_account.account_number_vault_ref
    ),
    jsonb_build_object(
      'guardrail', 'db_transaction_advisory_lock',
      'balance_before_idr', v_available_balance
    ),
    p_courier_id
  )
  RETURNING id INTO v_request_id;

  INSERT INTO courier_earnings_ledger (
    courier_id,
    source,
    direction,
    amount_idr,
    settlement_status,
    transaction_type,
    payout_request_id,
    description,
    metadata
  ) VALUES (
    p_courier_id,
    'payout',
    'debit',
    p_amount_idr,
    'requested',
    'payout_requested',
    v_request_id,
    'Saldo diajukan untuk pencairan',
    jsonb_build_object('payout_request_id', v_request_id)
  );

  payout_request_id := v_request_id;
  status := 'requested';
  available_balance_idr := v_available_balance - p_amount_idr;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd

-- +goose Down
DROP FUNCTION IF EXISTS request_courier_payout(UUID, INT, TEXT);
DROP TRIGGER IF EXISTS trg_courier_earnings_ledger_append_only ON courier_earnings_ledger;
DROP FUNCTION IF EXISTS prevent_courier_earnings_ledger_mutation();
DROP INDEX IF EXISTS idx_courier_earnings_ledger_payout_request;
DROP INDEX IF EXISTS idx_courier_earnings_ledger_type;
ALTER TABLE courier_earnings_ledger
  DROP CONSTRAINT IF EXISTS courier_earnings_ledger_transaction_type_check,
  DROP COLUMN IF EXISTS payout_request_id,
  DROP COLUMN IF EXISTS transaction_type;
ALTER TABLE courier_earnings_ledger
  DROP CONSTRAINT IF EXISTS courier_earnings_ledger_settlement_status_check,
  ADD CONSTRAINT courier_earnings_ledger_settlement_status_check
    CHECK (settlement_status IN ('pending', 'available', 'paid', 'held', 'cancelled'));
ALTER TABLE courier_earnings_ledger
  DROP CONSTRAINT IF EXISTS courier_earnings_ledger_source_check,
  ADD CONSTRAINT courier_earnings_ledger_source_check
    CHECK (source IN ('delivery', 'incentive', 'adjustment', 'reversal'));
DROP INDEX IF EXISTS idx_courier_payout_requests_status;
DROP INDEX IF EXISTS idx_courier_payout_requests_courier;
DROP INDEX IF EXISTS idx_courier_payout_requests_idempotency;
DROP TABLE IF EXISTS courier_payout_requests;
DROP INDEX IF EXISTS idx_courier_payout_accounts_review;
DROP INDEX IF EXISTS idx_courier_payout_accounts_primary;
DROP TABLE IF EXISTS courier_payout_accounts;
