-- ADS-2026-002/003/006/007/009/010/011/015/016
-- The existing promo_campaigns registry remains the canonical campaign row.
-- These append-only/event tables are Ads execution evidence, not a second
-- campaign source of truth.

-- +goose Up

ALTER TABLE promo_campaigns
  ADD COLUMN IF NOT EXISTS owner_account_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS city_code VARCHAR(80),
  ADD COLUMN IF NOT EXISTS branch_ids UUID[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS objective VARCHAR(40) NOT NULL DEFAULT 'visibility',
  ADD COLUMN IF NOT EXISTS placement_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS bid_strategy JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS schedule_timezone VARCHAR(80) NOT NULL DEFAULT 'Asia/Jakarta',
  ADD COLUMN IF NOT EXISTS daypart_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS creative_alt_text VARCHAR(240) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS moderation_status VARCHAR(30) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS campaign_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS attribution_model VARCHAR(40) NOT NULL DEFAULT 'last_touch',
  ADD COLUMN IF NOT EXISTS attribution_window_minutes INTEGER NOT NULL DEFAULT 10080,
  ADD COLUMN IF NOT EXISTS attribution_version VARCHAR(80) NOT NULL DEFAULT 'ads-last-touch-v1',
  ADD COLUMN IF NOT EXISTS total_budget_minor BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS daily_budget_minor BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS spent_minor BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS currency_code VARCHAR(3) NOT NULL DEFAULT 'IDR',
  ADD COLUMN IF NOT EXISTS billing_model VARCHAR(20) NOT NULL DEFAULT 'cpc',
  ADD COLUMN IF NOT EXISTS suspension_reason TEXT,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS last_policy_evaluation JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE promo_campaigns DROP CONSTRAINT IF EXISTS promo_campaigns_status_check;
ALTER TABLE promo_campaigns ADD CONSTRAINT promo_campaigns_status_check CHECK (
  status IN (
    'draft', 'validating', 'review', 'pending_approval', 'scheduled', 'active',
    'paused', 'ended', 'expired', 'rejected', 'budget_exhausted',
    'payment_hold', 'suspended', 'archived'
  )
);

ALTER TABLE promo_campaigns DROP CONSTRAINT IF EXISTS ads_campaign_budget_bounds_ck;
ALTER TABLE promo_campaigns ADD CONSTRAINT ads_campaign_budget_bounds_ck CHECK (
  product_type <> 'ads'
  OR (
    total_budget_minor >= 0 AND daily_budget_minor >= 0 AND spent_minor >= 0
    AND spent_minor <= total_budget_minor
    AND currency_code ~ '^[A-Z]{3}$'
    AND attribution_window_minutes BETWEEN 1 AND 43200
    AND campaign_version >= 1
  )
);

CREATE INDEX IF NOT EXISTS idx_ads_campaign_delivery
  ON promo_campaigns(product_type, status, moderation_status, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_ads_campaign_owner
  ON promo_campaigns(product_type, owner_account_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ads_campaign_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES promo_campaigns(id) ON DELETE CASCADE,
  campaign_version INTEGER NOT NULL CHECK (campaign_version >= 1),
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(40) NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  request_fingerprint CHAR(64) NOT NULL DEFAULT '',
  idempotency_key VARCHAR(160) NOT NULL,
  snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_id, campaign_version),
  UNIQUE (campaign_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_ads_campaign_revisions_time
  ON ads_campaign_revisions(campaign_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ads_delivery_contexts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES promo_campaigns(id) ON DELETE RESTRICT,
  creative_id VARCHAR(160) NOT NULL DEFAULT '',
  placement VARCHAR(80) NOT NULL,
  campaign_version INTEGER NOT NULL,
  request_hash CHAR(43) NOT NULL,
  token_hash CHAR(43) NOT NULL UNIQUE,
  selected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  viewable_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ads_delivery_context_campaign
  ON ads_delivery_contexts(campaign_id, selected_at DESC);

CREATE TABLE IF NOT EXISTS ads_billing_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES promo_campaigns(id) ON DELETE RESTRICT,
  account_id UUID REFERENCES users(id) ON DELETE SET NULL,
  placement VARCHAR(80) NOT NULL,
  event_type VARCHAR(20) NOT NULL CHECK (event_type IN ('impression', 'viewable_impression', 'click', 'conversion', 'credit', 'reversal')),
  delivery_token_hash CHAR(43) NOT NULL,
  actor_hash CHAR(43) NOT NULL DEFAULT '',
  session_hash CHAR(43) NOT NULL DEFAULT '',
  cost_minor BIGINT NOT NULL CHECK (cost_minor >= 0),
  currency_code VARCHAR(3) NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
  billing_model VARCHAR(20) NOT NULL,
  campaign_version INTEGER NOT NULL,
  attribution_model VARCHAR(40) NOT NULL DEFAULT 'last_touch',
  attribution_version VARCHAR(80) NOT NULL DEFAULT 'ads-last-touch-v1',
  attribution_window_minutes INTEGER NOT NULL DEFAULT 10080 CHECK (attribution_window_minutes BETWEEN 1 AND 43200),
  status VARCHAR(20) NOT NULL DEFAULT 'charged' CHECK (status IN ('charged', 'deduped', 'rejected', 'credited', 'reversed')),
  reason TEXT NOT NULL DEFAULT '',
  idempotency_key VARCHAR(220) NOT NULL UNIQUE,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_ads_billing_campaign_time
  ON ads_billing_events(campaign_id, occurred_at DESC);
ALTER TABLE ads_billing_events
  ADD COLUMN IF NOT EXISTS attribution_window_minutes INTEGER NOT NULL DEFAULT 10080;
ALTER TABLE ads_billing_events
  DROP CONSTRAINT IF EXISTS ads_billing_events_attribution_window_ck;
ALTER TABLE ads_billing_events
  ADD CONSTRAINT ads_billing_events_attribution_window_ck
  CHECK (attribution_window_minutes BETWEEN 1 AND 43200);
CREATE INDEX IF NOT EXISTS idx_ads_billing_account_time
  ON ads_billing_events(account_id, occurred_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ads_conversion_order
  ON ads_billing_events(order_id)
  WHERE order_id IS NOT NULL AND event_type = 'conversion' AND status = 'charged';

CREATE TABLE IF NOT EXISTS ads_invalid_traffic_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES promo_campaigns(id) ON DELETE RESTRICT,
  billing_event_id UUID REFERENCES ads_billing_events(id) ON DELETE SET NULL,
  decision VARCHAR(20) NOT NULL CHECK (decision IN ('excluded', 'credited', 'rejected', 'cleared')),
  reason_code VARCHAR(80) NOT NULL,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  appeal_status VARCHAR(20) NOT NULL DEFAULT 'not_requested',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ads_invalid_traffic_campaign
  ON ads_invalid_traffic_reviews(campaign_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ads_experiment_exposures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_key VARCHAR(120) NOT NULL,
  assignment_key CHAR(43) NOT NULL,
  variant_key VARCHAR(120) NOT NULL,
  placement VARCHAR(80) NOT NULL,
  campaign_id UUID REFERENCES promo_campaigns(id) ON DELETE SET NULL,
  billable_event_id UUID REFERENCES ads_billing_events(id) ON DELETE SET NULL,
  exposed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (experiment_key, assignment_key, placement)
);

CREATE TABLE IF NOT EXISTS ads_policy_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(80) NOT NULL,
  scope VARCHAR(80) NOT NULL,
  reason TEXT NOT NULL,
  before_value JSONB NOT NULL DEFAULT '{}'::jsonb,
  after_value JSONB NOT NULL DEFAULT '{}'::jsonb,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ads_policy_audit_time
  ON ads_policy_audit_events(created_at DESC);

-- +goose Down

DROP TABLE IF EXISTS ads_policy_audit_events;
DROP TABLE IF EXISTS ads_experiment_exposures;
DROP TABLE IF EXISTS ads_invalid_traffic_reviews;
DROP TABLE IF EXISTS ads_billing_events;
DROP TABLE IF EXISTS ads_delivery_contexts;
DROP TABLE IF EXISTS ads_campaign_revisions;
DROP INDEX IF EXISTS idx_ads_campaign_owner;
DROP INDEX IF EXISTS idx_ads_campaign_delivery;
ALTER TABLE promo_campaigns DROP CONSTRAINT IF EXISTS ads_campaign_budget_bounds_ck;
ALTER TABLE promo_campaigns DROP CONSTRAINT IF EXISTS promo_campaigns_status_check;
ALTER TABLE promo_campaigns ADD CONSTRAINT promo_campaigns_status_check CHECK (
  status IN ('draft', 'pending_approval', 'scheduled', 'active', 'paused', 'expired', 'archived')
);
ALTER TABLE promo_campaigns
  DROP COLUMN IF EXISTS owner_account_id,
  DROP COLUMN IF EXISTS city_code,
  DROP COLUMN IF EXISTS branch_ids,
  DROP COLUMN IF EXISTS objective,
  DROP COLUMN IF EXISTS placement_rules,
  DROP COLUMN IF EXISTS bid_strategy,
  DROP COLUMN IF EXISTS schedule_timezone,
  DROP COLUMN IF EXISTS daypart_rules,
  DROP COLUMN IF EXISTS creative_alt_text,
  DROP COLUMN IF EXISTS moderation_status,
  DROP COLUMN IF EXISTS campaign_version,
  DROP COLUMN IF EXISTS attribution_model,
  DROP COLUMN IF EXISTS attribution_window_minutes,
  DROP COLUMN IF EXISTS attribution_version,
  DROP COLUMN IF EXISTS total_budget_minor,
  DROP COLUMN IF EXISTS daily_budget_minor,
  DROP COLUMN IF EXISTS spent_minor,
  DROP COLUMN IF EXISTS currency_code,
  DROP COLUMN IF EXISTS billing_model,
  DROP COLUMN IF EXISTS suspension_reason,
  DROP COLUMN IF EXISTS rejection_reason,
  DROP COLUMN IF EXISTS last_policy_evaluation;
