-- +goose Up
INSERT INTO system_configs (key, value, description, category) VALUES
('payout_min_amount_idr', '25000', 'Minimum courier payout request amount in IDR', 'finance'),
('payout_daily_limit_idr', '1000000', 'Maximum courier payout request amount per calendar day in IDR', 'finance'),
('payout_account_cooldown_hours', '24', 'Cooldown after payout account verification or change before payout request is allowed', 'finance'),
('payout_max_pending_requests', '2', 'Maximum active courier payout requests before new requests are blocked', 'finance')
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  updated_at = NOW();

CREATE TABLE IF NOT EXISTS courier_payout_security_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  courier_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payout_request_id UUID REFERENCES courier_payout_requests(id) ON DELETE SET NULL,
  event_type VARCHAR(40) NOT NULL
    CHECK (event_type IN (
      'summary_viewed',
      'request_list_viewed',
      'step_up_failed',
      'request_blocked',
      'request_created'
    )),
  severity VARCHAR(16) NOT NULL DEFAULT 'info'
    CHECK (severity IN ('info', 'warning', 'critical')),
  ip_address INET,
  user_agent TEXT,
  device_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_courier_payout_security_events_courier
  ON courier_payout_security_events(courier_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_courier_payout_security_events_type
  ON courier_payout_security_events(event_type, created_at DESC);

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION get_system_config_int(p_key TEXT, p_default INT)
RETURNS INT AS $$
DECLARE
  v_value INT;
BEGIN
  SELECT (value #>> '{}')::int
  INTO v_value
  FROM system_configs
  WHERE key = p_key;

  RETURN COALESCE(v_value, p_default);
EXCEPTION WHEN OTHERS THEN
  RETURN p_default;
END;
$$ LANGUAGE plpgsql STABLE;
-- +goose StatementEnd

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
  v_daily_requested INT;
  v_pending_count INT;
  v_min_amount INT;
  v_daily_limit INT;
  v_cooldown_hours INT;
  v_max_pending INT;
  v_request_id UUID;
BEGIN
  v_min_amount := get_system_config_int('payout_min_amount_idr', 25000);
  v_daily_limit := get_system_config_int('payout_daily_limit_idr', 1000000);
  v_cooldown_hours := get_system_config_int('payout_account_cooldown_hours', 24);
  v_max_pending := get_system_config_int('payout_max_pending_requests', 2);

  IF p_amount_idr IS NULL OR p_amount_idr <= 0 THEN
    RAISE EXCEPTION 'Payout amount must be greater than zero';
  END IF;

  IF p_amount_idr < v_min_amount THEN
    RAISE EXCEPTION 'Payout amount is below the minimum policy';
  END IF;

  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) < 12 THEN
    RAISE EXCEPTION 'Idempotency key is required for payout request';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_courier_id::text));

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

  IF COALESCE(v_account.verified_at, v_account.created_at) > NOW() - make_interval(hours => v_cooldown_hours) THEN
    RAISE EXCEPTION 'Payout account is still in security cooldown';
  END IF;

  SELECT COUNT(*)::int
  INTO v_pending_count
  FROM courier_payout_requests
  WHERE courier_id = p_courier_id
    AND courier_payout_requests.status IN ('requested', 'under_review', 'approved', 'processing');

  IF v_pending_count >= v_max_pending THEN
    RAISE EXCEPTION 'Too many active payout requests';
  END IF;

  SELECT COALESCE(SUM(amount_idr), 0)::int
  INTO v_daily_requested
  FROM courier_payout_requests
  WHERE courier_id = p_courier_id
    AND requested_at >= date_trunc('day', NOW())
    AND courier_payout_requests.status NOT IN ('failed', 'rejected', 'cancelled');

  IF v_daily_requested + p_amount_idr > v_daily_limit THEN
    RAISE EXCEPTION 'Daily payout limit exceeded';
  END IF;

  SELECT COALESCE(SUM(
    CASE
      WHEN cel.direction = 'credit'
        AND cel.settlement_status = 'available'
        AND NOT EXISTS (
          SELECT 1
          FROM disputes d
          WHERE d.order_id = cel.order_id
            AND d.status IN ('open', 'investigating', 'pending')
        )
      THEN cel.amount_idr
      WHEN cel.direction = 'debit'
        AND cel.settlement_status IN ('requested', 'processing', 'paid')
      THEN -cel.amount_idr
      ELSE 0
    END
  ), 0)::int
  INTO v_available_balance
  FROM courier_earnings_ledger cel
  WHERE cel.courier_id = p_courier_id;

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
    trim(p_idempotency_key),
    jsonb_build_object(
      'bank_code', v_account.bank_code,
      'account_name', v_account.account_name,
      'account_number_last4', v_account.account_number_last4,
      'account_number_vault_ref', v_account.account_number_vault_ref
    ),
    jsonb_build_object(
      'guardrail', 'db_transaction_advisory_lock',
      'min_amount_idr', v_min_amount,
      'daily_limit_idr', v_daily_limit,
      'daily_requested_before_idr', v_daily_requested,
      'pending_request_count', v_pending_count,
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
DROP FUNCTION IF EXISTS get_system_config_int(TEXT, INT);
DROP INDEX IF EXISTS idx_courier_payout_security_events_type;
DROP INDEX IF EXISTS idx_courier_payout_security_events_courier;
DROP TABLE IF EXISTS courier_payout_security_events;
DELETE FROM system_configs
WHERE key IN (
  'payout_min_amount_idr',
  'payout_daily_limit_idr',
  'payout_account_cooldown_hours',
  'payout_max_pending_requests'
);
