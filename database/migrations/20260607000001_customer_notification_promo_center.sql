-- +goose Up

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS category VARCHAR(30) NOT NULL DEFAULT 'activity',
  ADD COLUMN IF NOT EXISTS priority VARCHAR(20) NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS conversation_id UUID,
  ADD COLUMN IF NOT EXISTS promo_id UUID;

UPDATE notifications
SET category = CASE
  WHEN type IN ('chat', 'order_chat_message', 'order_group_chat_message', 'missed_in_app_call') THEN 'message'
  WHEN type IN ('promo', 'promo_voucher_available', 'promo_expiring_soon') THEN 'promo'
  WHEN type IN ('support', 'support_reply', 'dispute_chat') THEN 'support'
  WHEN type IN ('system', 'flag_change') THEN 'system'
  ELSE COALESCE(NULLIF(category, ''), 'activity')
END
WHERE category = 'activity' OR category IS NULL;

ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_category_check,
  ADD CONSTRAINT notifications_category_check
    CHECK (category IN ('message', 'activity', 'promo', 'support', 'system'));

ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_priority_check,
  ADD CONSTRAINT notifications_priority_check
    CHECK (priority IN ('low', 'normal', 'high', 'urgent'));

CREATE INDEX IF NOT EXISTS idx_notifications_user_category_created
  ON notifications(user_id, category, created_at DESC)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread_category
  ON notifications(user_id, category, is_read)
  WHERE is_read = FALSE AND archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_expires
  ON notifications(expires_at)
  WHERE expires_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category VARCHAR(30) NOT NULL,
  push_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  in_app_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  marketing_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, category),
  CONSTRAINT notification_preferences_category_check
    CHECK (category IN ('message', 'activity', 'promo', 'support', 'system'))
);

CREATE INDEX IF NOT EXISTS idx_notification_preferences_user
  ON notification_preferences(user_id);

CREATE TABLE IF NOT EXISTS promo_margin_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_code VARCHAR(60) NOT NULL,
  vehicle_type VARCHAR(40),
  zone_code VARCHAR(80),
  min_margin_amount_idr INTEGER NOT NULL DEFAULT 0 CHECK (min_margin_amount_idr >= 0),
  min_margin_percent NUMERIC(6,3) NOT NULL DEFAULT 0 CHECK (min_margin_percent >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_promo_margin_policy_scope
  ON promo_margin_policies(service_code, COALESCE(vehicle_type, ''), COALESCE(zone_code, ''))
  WHERE is_active = TRUE;

CREATE TABLE IF NOT EXISTS promo_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(160) NOT NULL,
  description TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  discount_type VARCHAR(30) NOT NULL,
  discount_value_idr INTEGER NOT NULL DEFAULT 0 CHECK (discount_value_idr >= 0),
  discount_percent NUMERIC(6,3) NOT NULL DEFAULT 0 CHECK (discount_percent >= 0),
  max_discount_idr INTEGER NOT NULL DEFAULT 0 CHECK (max_discount_idr >= 0),
  min_order_idr INTEGER NOT NULL DEFAULT 0 CHECK (min_order_idr >= 0),
  service_codes TEXT[] NOT NULL DEFAULT '{}',
  component_scope VARCHAR(40) NOT NULL DEFAULT 'shipping',
  stacking_key VARCHAR(80) NOT NULL DEFAULT 'shipping',
  allow_stack_different_service BOOLEAN NOT NULL DEFAULT TRUE,
  total_budget_idr INTEGER NOT NULL DEFAULT 0 CHECK (total_budget_idr >= 0),
  daily_budget_idr INTEGER NOT NULL DEFAULT 0 CHECK (daily_budget_idr >= 0),
  reserved_budget_idr INTEGER NOT NULL DEFAULT 0 CHECK (reserved_budget_idr >= 0),
  redeemed_budget_idr INTEGER NOT NULL DEFAULT 0 CHECK (redeemed_budget_idr >= 0),
  max_redemptions INTEGER NOT NULL DEFAULT 0 CHECK (max_redemptions >= 0),
  per_user_limit INTEGER NOT NULL DEFAULT 1 CHECK (per_user_limit >= 0),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  audience_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  eligibility_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  notification_copy JSONB NOT NULL DEFAULT '{}'::jsonb,
  risk_campaign BOOLEAN NOT NULL DEFAULT FALSE,
  risk_reason TEXT,
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  published_by UUID REFERENCES users(id),
  published_at TIMESTAMPTZ,
  paused_by UUID REFERENCES users(id),
  paused_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT promo_campaigns_status_check
    CHECK (status IN ('draft', 'pending_approval', 'scheduled', 'active', 'paused', 'expired', 'archived')),
  CONSTRAINT promo_campaigns_discount_type_check
    CHECK (discount_type IN ('fixed', 'percentage', 'shipping_discount', 'free_insurance')),
  CONSTRAINT promo_campaigns_component_scope_check
    CHECK (component_scope IN ('shipping', 'insurance', 'service_fee', 'referral')),
  CONSTRAINT promo_campaigns_window_check
    CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_promo_campaigns_status_window
  ON promo_campaigns(status, starts_at, ends_at);

CREATE INDEX IF NOT EXISTS idx_promo_campaigns_service_codes
  ON promo_campaigns USING GIN(service_codes);

CREATE TABLE IF NOT EXISTS promo_budget_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES promo_campaigns(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  idempotency_key VARCHAR(160) NOT NULL,
  ledger_type VARCHAR(30) NOT NULL,
  amount_idr INTEGER NOT NULL CHECK (amount_idr >= 0),
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  expires_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT promo_budget_ledger_type_check
    CHECK (ledger_type IN ('reserve', 'release', 'redeem', 'adjustment')),
  CONSTRAINT promo_budget_ledger_status_check
    CHECK (status IN ('active', 'released', 'redeemed', 'expired', 'void'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_promo_budget_ledger_idempotency
  ON promo_budget_ledger(campaign_id, idempotency_key, ledger_type);

CREATE INDEX IF NOT EXISTS idx_promo_budget_ledger_campaign
  ON promo_budget_ledger(campaign_id, created_at DESC);

CREATE TABLE IF NOT EXISTS promo_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES promo_campaigns(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  idempotency_key VARCHAR(160) NOT NULL,
  service_code VARCHAR(60) NOT NULL,
  discount_idr INTEGER NOT NULL CHECK (discount_idr >= 0),
  gross_order_revenue_idr INTEGER NOT NULL CHECK (gross_order_revenue_idr >= 0),
  contribution_margin_idr INTEGER NOT NULL,
  margin_percent NUMERIC(8,3) NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'redeemed',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(campaign_id, idempotency_key),
  CONSTRAINT promo_redemptions_status_check
    CHECK (status IN ('reserved', 'redeemed', 'released', 'void'))
);

CREATE INDEX IF NOT EXISTS idx_promo_redemptions_campaign
  ON promo_redemptions(campaign_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_promo_redemptions_user
  ON promo_redemptions(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS promo_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES promo_campaigns(id) ON DELETE SET NULL,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_role VARCHAR(60),
  action VARCHAR(80) NOT NULL,
  reason TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_promo_audit_events_campaign
  ON promo_audit_events(campaign_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_promo_audit_events_action
  ON promo_audit_events(action, created_at DESC);

INSERT INTO promo_margin_policies (
  service_code,
  vehicle_type,
  min_margin_amount_idr,
  min_margin_percent,
  created_by
)
SELECT
  dsp.code,
  NULL,
  GREATEST(1500, CEIL(dsp.base_fare_idr * 0.08)::INTEGER),
  8.000,
  NULL
FROM delivery_service_products dsp
WHERE NOT EXISTS (
  SELECT 1
  FROM promo_margin_policies pmp
  WHERE pmp.service_code = dsp.code
    AND pmp.vehicle_type IS NULL
    AND pmp.zone_code IS NULL
    AND pmp.is_active = TRUE
);

-- +goose Down

DROP INDEX IF EXISTS idx_promo_audit_events_action;
DROP INDEX IF EXISTS idx_promo_audit_events_campaign;
DROP TABLE IF EXISTS promo_audit_events;

DROP INDEX IF EXISTS idx_promo_redemptions_user;
DROP INDEX IF EXISTS idx_promo_redemptions_campaign;
DROP TABLE IF EXISTS promo_redemptions;

DROP INDEX IF EXISTS idx_promo_budget_ledger_campaign;
DROP INDEX IF EXISTS idx_promo_budget_ledger_idempotency;
DROP TABLE IF EXISTS promo_budget_ledger;

DROP INDEX IF EXISTS idx_promo_campaigns_service_codes;
DROP INDEX IF EXISTS idx_promo_campaigns_status_window;
DROP TABLE IF EXISTS promo_campaigns;

DROP INDEX IF EXISTS idx_promo_margin_policy_scope;
DROP TABLE IF EXISTS promo_margin_policies;

DROP INDEX IF EXISTS idx_notification_preferences_user;
DROP TABLE IF EXISTS notification_preferences;

DROP INDEX IF EXISTS idx_notifications_expires;
DROP INDEX IF EXISTS idx_notifications_user_unread_category;
DROP INDEX IF EXISTS idx_notifications_user_category_created;

ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_priority_check,
  DROP CONSTRAINT IF EXISTS notifications_category_check,
  DROP COLUMN IF EXISTS promo_id,
  DROP COLUMN IF EXISTS conversation_id,
  DROP COLUMN IF EXISTS expires_at,
  DROP COLUMN IF EXISTS archived_at,
  DROP COLUMN IF EXISTS priority,
  DROP COLUMN IF EXISTS category;
