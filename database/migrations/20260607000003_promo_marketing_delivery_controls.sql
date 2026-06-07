-- +goose Up
CREATE TABLE IF NOT EXISTS promo_campaign_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES promo_campaigns(id) ON DELETE CASCADE,
  rule_type VARCHAR(60) NOT NULL,
  rule_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_promo_campaign_rules_campaign
  ON promo_campaign_rules(campaign_id, is_active);

CREATE TABLE IF NOT EXISTS promo_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES promo_campaigns(id) ON DELETE CASCADE,
  approver_id UUID REFERENCES users(id) ON DELETE SET NULL,
  approval_status VARCHAR(30) NOT NULL,
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT promo_approvals_status_check
    CHECK (approval_status IN ('submitted', 'approved', 'rejected', 'revoked'))
);

CREATE INDEX IF NOT EXISTS idx_promo_approvals_campaign
  ON promo_approvals(campaign_id, created_at DESC);

CREATE TABLE IF NOT EXISTS promo_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(120) NOT NULL,
  description TEXT,
  segment_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  estimated_user_count INTEGER NOT NULL DEFAULT 0 CHECK (estimated_user_count >= 0),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_promo_segments_created
  ON promo_segments(created_at DESC);

CREATE TABLE IF NOT EXISTS promo_notification_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES promo_campaigns(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_id UUID REFERENCES notifications(id) ON DELETE SET NULL,
  channel VARCHAR(40) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'queued',
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  failure_reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT promo_notification_deliveries_channel_check
    CHECK (channel IN ('in_app', 'push_in_app', 'scheduled_push')),
  CONSTRAINT promo_notification_deliveries_status_check
    CHECK (status IN ('queued', 'sent', 'skipped', 'failed', 'cancelled'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_promo_notification_unique_user
  ON promo_notification_deliveries(campaign_id, user_id, channel);

CREATE INDEX IF NOT EXISTS idx_promo_notification_user_sent
  ON promo_notification_deliveries(user_id, created_at DESC)
  WHERE status = 'sent';

-- +goose Down
DROP TABLE IF EXISTS promo_notification_deliveries;
DROP TABLE IF EXISTS promo_segments;
DROP TABLE IF EXISTS promo_approvals;
DROP TABLE IF EXISTS promo_campaign_rules;
