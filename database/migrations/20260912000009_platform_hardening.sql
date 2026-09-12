-- +goose Up
-- PAYPLAT/REP/CRM hardening. These are additive records; financial and
-- moderation history is never overwritten to manufacture a new outcome.

-- Link the new orchestration intent to the existing order payment projection
-- without moving legacy order/payment ownership into this migration.
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS payment_intent_id UUID REFERENCES payment_intents(id);
CREATE INDEX IF NOT EXISTS idx_payments_payment_intent ON payments(payment_intent_id);

CREATE TABLE IF NOT EXISTS payment_refund_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    refund_id UUID NOT NULL REFERENCES payment_refunds(id),
    event_id VARCHAR(255) NOT NULL,
    provider_raw_status VARCHAR(128) NOT NULL,
    normalized_status VARCHAR(32) NOT NULL CHECK (normalized_status IN ('REQUESTED','PROCESSING','SUCCEEDED','FAILED','UNKNOWN')),
    provider_reference VARCHAR(255),
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    occurred_at TIMESTAMPTZ NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (refund_id, event_id)
);
CREATE INDEX IF NOT EXISTS idx_payment_refund_events_refund ON payment_refund_events(refund_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS payment_refund_ledger_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    refund_id UUID NOT NULL REFERENCES payment_refunds(id),
    intent_id UUID NOT NULL REFERENCES payment_intents(id),
    entry_type VARCHAR(16) NOT NULL CHECK (entry_type IN ('REFUND','REVERSAL')),
    provider_reference VARCHAR(255) NOT NULL,
    amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
    currency CHAR(3) NOT NULL,
    idempotency_key VARCHAR(180) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (refund_id, entry_type)
);
CREATE INDEX IF NOT EXISTS idx_payment_refund_ledger_intent ON payment_refund_ledger_entries(intent_id, created_at DESC);

-- The internal ledger method is explicitly market-configured. External
-- methods must be inserted only after their provider/vendor is approved.
INSERT INTO payment_method_catalog (market_code, currency, payment_method, provider, enabled, risk_context)
VALUES ('id-jk', 'IDR', 'lapay', 'internal_ledger', TRUE, '{"provider_type":"internal_ledger"}'::jsonb)
ON CONFLICT (market_code, currency, payment_method, provider) DO NOTHING;

CREATE TABLE IF NOT EXISTS payment_chargebacks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    intent_id UUID NOT NULL REFERENCES payment_intents(id),
    provider VARCHAR(64) NOT NULL,
    provider_case_reference VARCHAR(255) NOT NULL,
    amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
    currency CHAR(3) NOT NULL,
    state VARCHAR(24) NOT NULL DEFAULT 'RECEIVED' CHECK (state IN (
      'RECEIVED','UNDER_REVIEW','EVIDENCE_SUBMITTED','WON','LOST','CLOSED'
    )),
    evidence_deadline TIMESTAMPTZ,
    liability_owner VARCHAR(24) NOT NULL CHECK (liability_owner IN ('MERCHANT','PLATFORM','SHARED')),
    provider_raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (provider, provider_case_reference)
);
CREATE INDEX IF NOT EXISTS idx_payment_chargebacks_queue
    ON payment_chargebacks(state, evidence_deadline, updated_at DESC);

CREATE TABLE IF NOT EXISTS payment_chargeback_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chargeback_id UUID NOT NULL REFERENCES payment_chargebacks(id),
    event_id VARCHAR(255) NOT NULL,
    state VARCHAR(24) NOT NULL,
    provider_raw_status VARCHAR(128) NOT NULL,
    provider_raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    occurred_at TIMESTAMPTZ NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (chargeback_id, event_id)
);
CREATE INDEX IF NOT EXISTS idx_payment_chargeback_events_case
    ON payment_chargeback_events(chargeback_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS payment_balance_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_type VARCHAR(16) NOT NULL CHECK (owner_type IN ('CUSTOMER','MERCHANT','COURIER','PLATFORM','ADS')),
    owner_id UUID REFERENCES users(id),
    balance_type VARCHAR(32) NOT NULL CHECK (balance_type IN (
      'CUSTOMER_CREDIT','REFUND_CREDIT','MERCHANT_PAYABLE','COURIER_EARNINGS',
      'ADS_BALANCE','PROMOTIONAL_CREDIT'
    )),
    market_code VARCHAR(32) NOT NULL,
    currency CHAR(3) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (owner_type, owner_id, balance_type, market_code, currency)
);
CREATE TABLE IF NOT EXISTS payment_balance_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES payment_balance_accounts(id),
    entry_type VARCHAR(16) NOT NULL CHECK (entry_type IN ('CREDIT','DEBIT','HOLD','RELEASE','SETTLE','REVERSAL')),
    amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
    source_type VARCHAR(64) NOT NULL,
    source_id VARCHAR(128) NOT NULL,
    idempotency_key VARCHAR(180) NOT NULL UNIQUE,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payment_balance_entries_account
    ON payment_balance_entries(account_id, created_at DESC);

ALTER TABLE reputation_reviews
  ADD COLUMN IF NOT EXISTS source_type VARCHAR(32) NOT NULL DEFAULT 'customer_review',
  ADD COLUMN IF NOT EXISTS confidence NUMERIC(5,4) NOT NULL DEFAULT 1.0000,
  ADD COLUMN IF NOT EXISTS signal_version VARCHAR(64) NOT NULL DEFAULT 'reputation-v1';
ALTER TABLE reputation_reviews
  DROP CONSTRAINT IF EXISTS reputation_reviews_confidence_check;
ALTER TABLE reputation_reviews
  ADD CONSTRAINT reputation_reviews_confidence_check CHECK (confidence >= 0 AND confidence <= 1);

CREATE TABLE IF NOT EXISTS reputation_signal_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_id UUID NOT NULL REFERENCES users(id),
    service_code VARCHAR(64) NOT NULL,
    market_code VARCHAR(32) NOT NULL,
    window_start TIMESTAMPTZ NOT NULL,
    window_end TIMESTAMPTZ NOT NULL,
    signal_version VARCHAR(64) NOT NULL,
    aggregate JSONB NOT NULL DEFAULT '{}'::jsonb,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (subject_id, service_code, market_code, window_start, window_end, signal_version),
    CHECK (window_end > window_start)
);
CREATE INDEX IF NOT EXISTS idx_reputation_snapshots_subject
    ON reputation_signal_snapshots(subject_id, service_code, market_code, window_end DESC);

CREATE TABLE IF NOT EXISTS reputation_review_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    review_id UUID NOT NULL REFERENCES reputation_reviews(id),
    actor_id UUID NOT NULL REFERENCES users(id),
    body TEXT NOT NULL,
    state VARCHAR(16) NOT NULL DEFAULT 'PUBLISHED' CHECK (state IN ('PUBLISHED','HIDDEN')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (review_id)
);

CREATE TABLE IF NOT EXISTS crm_campaign_exposures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES crm_campaigns(id),
    customer_id UUID NOT NULL REFERENCES users(id),
    assignment VARCHAR(16) NOT NULL CHECK (assignment IN ('TREATMENT','HOLDOUT')),
    consent_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    first_conversion_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    UNIQUE (campaign_id, customer_id)
);
CREATE INDEX IF NOT EXISTS idx_crm_campaign_exposures_assignment
    ON crm_campaign_exposures(campaign_id, assignment, assigned_at);

CREATE TABLE IF NOT EXISTS loyalty_tier_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    market_code VARCHAR(32) NOT NULL,
    tier_code VARCHAR(32) NOT NULL,
    min_points BIGINT NOT NULL CHECK (min_points >= 0),
    discount_bps INTEGER NOT NULL DEFAULT 0 CHECK (discount_bps >= 0 AND discount_bps <= 10000),
    benefits JSONB NOT NULL DEFAULT '{}'::jsonb,
    version INTEGER NOT NULL CHECK (version > 0),
    active BOOLEAN NOT NULL DEFAULT FALSE,
    effective_from TIMESTAMPTZ NOT NULL,
    effective_to TIMESTAMPTZ,
    UNIQUE (market_code, tier_code, version),
    CHECK (effective_to IS NULL OR effective_to > effective_from)
);
CREATE INDEX IF NOT EXISTS idx_loyalty_tier_config_active
    ON loyalty_tier_configs(market_code, active, min_points DESC, effective_from DESC);

CREATE TABLE IF NOT EXISTS crm_referral_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    market_code VARCHAR(32) NOT NULL,
    policy_version VARCHAR(64) NOT NULL,
    reward_type VARCHAR(24) NOT NULL CHECK (reward_type IN ('POINTS','CREDIT')),
    reward_points BIGINT NOT NULL DEFAULT 0 CHECK (reward_points >= 0),
    reward_liability_minor BIGINT NOT NULL DEFAULT 0 CHECK (reward_liability_minor >= 0),
    qualifying_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
    active BOOLEAN NOT NULL DEFAULT FALSE,
    effective_from TIMESTAMPTZ NOT NULL,
    effective_to TIMESTAMPTZ,
    UNIQUE (market_code, policy_version),
    CHECK (effective_to IS NULL OR effective_to > effective_from),
    CHECK (reward_points > 0 OR reward_liability_minor > 0)
);
CREATE INDEX IF NOT EXISTS idx_crm_referral_policy_active
    ON crm_referral_policies(market_code, active, effective_from DESC);

-- Append-only financial and provider evidence. Status changes are represented
-- as a new event, while the current projection may be updated transactionally.
CREATE OR REPLACE FUNCTION reject_platform_financial_history_update() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% rows are append-only; create a compensating record', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_payment_balance_entries_immutable ON payment_balance_entries;
CREATE TRIGGER trg_payment_balance_entries_immutable BEFORE UPDATE OR DELETE ON payment_balance_entries
FOR EACH ROW EXECUTE FUNCTION reject_platform_financial_history_update();
DROP TRIGGER IF EXISTS trg_payment_chargeback_events_immutable ON payment_chargeback_events;
CREATE TRIGGER trg_payment_chargeback_events_immutable BEFORE UPDATE OR DELETE ON payment_chargeback_events
FOR EACH ROW EXECUTE FUNCTION reject_platform_financial_history_update();

-- +goose Down
-- A reviewed compensating migration is required once any financial or
-- moderation record exists. Existing reputation columns are intentionally
-- retained during rollback to avoid destructive history changes.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM payment_balance_entries LIMIT 1)
     OR EXISTS (SELECT 1 FROM payment_chargeback_events LIMIT 1)
     OR EXISTS (SELECT 1 FROM reputation_signal_snapshots LIMIT 1)
     OR EXISTS (SELECT 1 FROM crm_campaign_exposures LIMIT 1)
  THEN RAISE EXCEPTION 'platform hardening migration contains history; use a compensating migration'; END IF;
END $$;
DROP TRIGGER IF EXISTS trg_payment_chargeback_events_immutable ON payment_chargeback_events;
DROP TRIGGER IF EXISTS trg_payment_balance_entries_immutable ON payment_balance_entries;
DROP FUNCTION IF EXISTS reject_platform_financial_history_update();
DROP TABLE IF EXISTS crm_campaign_exposures;
DROP TABLE IF EXISTS crm_referral_policies;
DROP TABLE IF EXISTS loyalty_tier_configs;
DROP TABLE IF EXISTS reputation_review_responses;
DROP TABLE IF EXISTS reputation_signal_snapshots;
DROP TABLE IF EXISTS payment_balance_entries;
DROP TABLE IF EXISTS payment_balance_accounts;
DROP TABLE IF EXISTS payment_chargeback_events;
DROP TABLE IF EXISTS payment_chargebacks;
DROP TABLE IF EXISTS payment_refund_ledger_entries;
DROP TABLE IF EXISTS payment_refund_events;
