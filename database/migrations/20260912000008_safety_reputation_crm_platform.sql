-- +goose Up
-- SAFE/REP/CRM: shared durable aggregates. These tables are additive to the
-- existing courier safety, food membership and voucher tables; they do not
-- create a second order/payment source of truth.
CREATE TABLE IF NOT EXISTS safety_incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id UUID NOT NULL REFERENCES users(id),
    counterparty_id UUID REFERENCES users(id),
    order_id UUID REFERENCES orders(id),
    service_code VARCHAR(64),
    market_code VARCHAR(32) NOT NULL,
    category VARCHAR(64) NOT NULL,
    severity VARCHAR(16) NOT NULL CHECK (severity IN ('LOW','MEDIUM','HIGH','CRITICAL')),
    state VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (state IN ('OPEN','ACKNOWLEDGED','ESCALATED','RESOLVED','REOPENED','DISMISSED')),
    escalation_state VARCHAR(32) NOT NULL DEFAULT 'NOT_ESCALATED',
    latitude NUMERIC(9,6),
    longitude NUMERIC(9,6),
    location_accuracy_m NUMERIC(10,2),
    location_recorded_at TIMESTAMPTZ,
    context JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    CHECK ((latitude IS NULL AND longitude IS NULL) OR (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180))
);
CREATE INDEX IF NOT EXISTS idx_safety_incidents_queue ON safety_incidents(state, severity, created_at);
CREATE INDEX IF NOT EXISTS idx_safety_incidents_actor_order ON safety_incidents(reporter_id, order_id, created_at DESC);

CREATE TABLE IF NOT EXISTS safety_evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id UUID NOT NULL REFERENCES safety_incidents(id),
    actor_id UUID NOT NULL REFERENCES users(id),
    object_key TEXT NOT NULL,
    sha256 CHAR(64) NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
    content_type VARCHAR(128) NOT NULL,
    size_bytes BIGINT NOT NULL CHECK (size_bytes > 0),
    redacted_object_key TEXT,
    retention_until TIMESTAMPTZ NOT NULL,
    legal_hold BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_safety_evidence_incident ON safety_evidence(incident_id, created_at);

CREATE TABLE IF NOT EXISTS safety_share_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id),
    issuer_id UUID NOT NULL REFERENCES users(id),
    token_hash CHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS idx_safety_share_active ON safety_share_tokens(order_id, expires_at) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS safety_emergency_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    display_name VARCHAR(120) NOT NULL,
    channel VARCHAR(16) NOT NULL CHECK (channel IN ('PHONE','EMAIL')),
    contact_ciphertext BYTEA NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_safety_contacts_user ON safety_emergency_contacts(user_id, is_active);

CREATE TABLE IF NOT EXISTS reputation_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reviewer_id UUID NOT NULL REFERENCES users(id),
    subject_id UUID NOT NULL REFERENCES users(id),
    order_id UUID NOT NULL REFERENCES orders(id),
    service_code VARCHAR(64) NOT NULL,
    market_code VARCHAR(32) NOT NULL,
    stars SMALLINT NOT NULL CHECK (stars BETWEEN 1 AND 5),
    dimensions JSONB NOT NULL DEFAULT '{}'::jsonb,
    body TEXT,
    state VARCHAR(20) NOT NULL DEFAULT 'PUBLISHED' CHECK (state IN ('PUBLISHED','REPORTED','IN_REVIEW','HIDDEN')),
    moderation_reason TEXT,
    quality_rule_version VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (reviewer_id, subject_id, order_id, service_code)
);
CREATE INDEX IF NOT EXISTS idx_reputation_reviews_moderation ON reputation_reviews(state, created_at);
CREATE INDEX IF NOT EXISTS idx_reputation_reviews_subject ON reputation_reviews(subject_id, service_code, created_at DESC);

CREATE TABLE IF NOT EXISTS reputation_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    review_id UUID REFERENCES reputation_reviews(id),
    subject_id UUID NOT NULL REFERENCES users(id),
    action VARCHAR(32) NOT NULL CHECK (action IN ('REPORT','HIDE','RESTORE','QUALITY_RECALCULATE','APPEAL_REVERSE')),
    reason TEXT NOT NULL,
    evidence_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    rule_version VARCHAR(64),
    actor_id UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reputation_appeals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    review_id UUID REFERENCES reputation_reviews(id),
    subject_id UUID NOT NULL REFERENCES users(id),
    state VARCHAR(20) NOT NULL DEFAULT 'SUBMITTED' CHECK (state IN ('SUBMITTED','IN_REVIEW','UPHELD','REVERSED','REJECTED')),
    submitted_reason TEXT NOT NULL,
    reviewer_id UUID REFERENCES users(id),
    outcome_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS loyalty_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES users(id),
    market_code VARCHAR(32) NOT NULL,
    points_balance BIGINT NOT NULL DEFAULT 0 CHECK (points_balance >= 0),
    benefit_balance JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (owner_id, market_code)
);

CREATE TABLE IF NOT EXISTS loyalty_ledger_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES loyalty_accounts(id),
    entry_type VARCHAR(24) NOT NULL CHECK (entry_type IN ('EARN','REDEEM','EXPIRE','REVERSE','ADJUSTMENT')),
    points BIGINT NOT NULL CHECK (points <> 0),
    source_type VARCHAR(64) NOT NULL,
    source_id VARCHAR(128) NOT NULL,
    idempotency_key VARCHAR(180) NOT NULL UNIQUE,
    liability_minor BIGINT CHECK (liability_minor IS NULL OR liability_minor >= 0),
    reason TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_loyalty_ledger_account ON loyalty_ledger_entries(account_id, created_at DESC);

CREATE TABLE IF NOT EXISTS crm_referral_attributions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referrer_id UUID NOT NULL REFERENCES users(id),
    referred_id UUID NOT NULL REFERENCES users(id),
    referral_code VARCHAR(64) NOT NULL,
    market_code VARCHAR(32) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','QUALIFIED','REWARDED','REVIEW','REJECTED','REVERSED')),
    reward_points BIGINT NOT NULL DEFAULT 0 CHECK (reward_points >= 0),
    reward_liability_minor BIGINT NOT NULL DEFAULT 0 CHECK (reward_liability_minor >= 0),
    qualifying_order_id UUID REFERENCES orders(id),
    abuse_signals JSONB NOT NULL DEFAULT '{}'::jsonb,
    attribution_locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (referred_id),
    CHECK (referrer_id <> referred_id)
);

CREATE TABLE IF NOT EXISTS crm_membership_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_code VARCHAR(64) NOT NULL,
    version INTEGER NOT NULL CHECK (version > 0),
    market_code VARCHAR(32) NOT NULL,
    currency CHAR(3) NOT NULL,
    price_minor BIGINT NOT NULL CHECK (price_minor >= 0),
    billing_cycle VARCHAR(16) NOT NULL CHECK (billing_cycle IN ('MONTHLY','YEARLY','ONE_TIME')),
    benefits JSONB NOT NULL DEFAULT '{}'::jsonb,
    active BOOLEAN NOT NULL DEFAULT FALSE,
    effective_from TIMESTAMPTZ NOT NULL,
    effective_to TIMESTAMPTZ,
    UNIQUE (plan_code, version, market_code)
);

CREATE TABLE IF NOT EXISTS crm_membership_entitlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES users(id),
    plan_id UUID NOT NULL REFERENCES crm_membership_plans(id),
    state VARCHAR(24) NOT NULL DEFAULT 'PENDING_PAYMENT' CHECK (state IN ('PENDING_PAYMENT','ACTIVE','GRACE','CANCELLED','EXPIRED','REFUNDED')),
    current_period_start TIMESTAMPTZ NOT NULL,
    current_period_end TIMESTAMPTZ NOT NULL,
    payment_intent_id UUID,
    idempotency_key VARCHAR(180) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (current_period_end > current_period_start)
);
CREATE INDEX IF NOT EXISTS idx_crm_membership_active ON crm_membership_entitlements(owner_id, state, current_period_end);

CREATE TABLE IF NOT EXISTS crm_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_code VARCHAR(80) NOT NULL UNIQUE,
    market_code VARCHAR(32) NOT NULL,
    state VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (state IN ('DRAFT','PENDING_APPROVAL','SCHEDULED','ACTIVE','PAUSED','STOPPED','COMPLETED')),
    audience_definition JSONB NOT NULL DEFAULT '{}'::jsonb,
    budget_minor BIGINT NOT NULL DEFAULT 0 CHECK (budget_minor >= 0),
    funding_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
    frequency_cap JSONB NOT NULL DEFAULT '{}'::jsonb,
    holdout_percent NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (holdout_percent >= 0 AND holdout_percent <= 100),
    starts_at TIMESTAMPTZ,
    ends_at TIMESTAMPTZ,
    created_by UUID NOT NULL REFERENCES users(id),
    approved_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm_campaign_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES crm_campaigns(id),
    order_id UUID NOT NULL REFERENCES orders(id),
    customer_id UUID NOT NULL REFERENCES users(id),
    amount_minor BIGINT NOT NULL CHECK (amount_minor >= 0),
    funding_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
    state VARCHAR(16) NOT NULL DEFAULT 'RESERVED' CHECK (state IN ('RESERVED','CONSUMED','RELEASED','REVERSED')),
    idempotency_key VARCHAR(180) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (campaign_id, order_id)
);

CREATE TABLE IF NOT EXISTS crm_preferences (
    user_id UUID NOT NULL REFERENCES users(id),
    market_code VARCHAR(32) NOT NULL,
    channel VARCHAR(24) NOT NULL CHECK (channel IN ('PUSH','EMAIL','SMS','WHATSAPP','IN_APP')),
    marketing_allowed BOOLEAN NOT NULL DEFAULT FALSE,
    personalization_allowed BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, market_code, channel)
);

CREATE TABLE IF NOT EXISTS crm_reconciliation_exceptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_type VARCHAR(64) NOT NULL,
    source_id VARCHAR(128) NOT NULL,
    expected_minor BIGINT NOT NULL,
    actual_minor BIGINT NOT NULL,
    difference_minor BIGINT NOT NULL,
    reason TEXT NOT NULL,
    state VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (state IN ('OPEN','IN_REVIEW','RESOLVED','ACCEPTED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES users(id),
    resolution_note TEXT,
    UNIQUE (source_type, source_id)
);

-- Evidence and ledger rows are append-only. Corrections use a new entry/action.
CREATE OR REPLACE FUNCTION reject_immutable_marketplace_evidence() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% rows are append-only; create a compensating record', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_safety_evidence_immutable ON safety_evidence;
CREATE TRIGGER trg_safety_evidence_immutable BEFORE UPDATE OR DELETE ON safety_evidence
FOR EACH ROW EXECUTE FUNCTION reject_immutable_marketplace_evidence();
DROP TRIGGER IF EXISTS trg_loyalty_ledger_immutable ON loyalty_ledger_entries;
CREATE TRIGGER trg_loyalty_ledger_immutable BEFORE UPDATE OR DELETE ON loyalty_ledger_entries
FOR EACH ROW EXECUTE FUNCTION reject_immutable_marketplace_evidence();
DROP TRIGGER IF EXISTS trg_reputation_actions_immutable ON reputation_actions;
CREATE TRIGGER trg_reputation_actions_immutable BEFORE UPDATE OR DELETE ON reputation_actions
FOR EACH ROW EXECUTE FUNCTION reject_immutable_marketplace_evidence();

-- +goose Down
-- Do not drop marketplace financial/evidence history automatically.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM loyalty_ledger_entries LIMIT 1)
     OR EXISTS (SELECT 1 FROM crm_campaign_reservations LIMIT 1)
     OR EXISTS (SELECT 1 FROM safety_evidence LIMIT 1)
  THEN RAISE EXCEPTION 'safety/reputation/CRM migration contains history; use a reviewed compensating migration'; END IF;
END $$;
DROP TRIGGER IF EXISTS trg_reputation_actions_immutable ON reputation_actions;
DROP TRIGGER IF EXISTS trg_loyalty_ledger_immutable ON loyalty_ledger_entries;
DROP TRIGGER IF EXISTS trg_safety_evidence_immutable ON safety_evidence;
DROP FUNCTION IF EXISTS reject_immutable_marketplace_evidence();
DROP TABLE IF EXISTS crm_reconciliation_exceptions;
DROP TABLE IF EXISTS crm_preferences;
DROP TABLE IF EXISTS crm_campaign_reservations;
DROP TABLE IF EXISTS crm_campaigns;
DROP TABLE IF EXISTS crm_membership_entitlements;
DROP TABLE IF EXISTS crm_membership_plans;
DROP TABLE IF EXISTS crm_referral_attributions;
DROP TABLE IF EXISTS loyalty_ledger_entries;
DROP TABLE IF EXISTS loyalty_accounts;
DROP TABLE IF EXISTS reputation_appeals;
DROP TABLE IF EXISTS reputation_actions;
DROP TABLE IF EXISTS reputation_reviews;
DROP TABLE IF EXISTS safety_emergency_contacts;
DROP TABLE IF EXISTS safety_share_tokens;
DROP TABLE IF EXISTS safety_evidence;
DROP TABLE IF EXISTS safety_incidents;
