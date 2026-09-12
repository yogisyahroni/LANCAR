-- +goose Up
-- PART U/V: derivative search index and canonical communication orchestration.
-- The source services remain authoritative; these tables only hold projections,
-- delivery evidence and policy/configuration.

CREATE TABLE IF NOT EXISTS search_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL,
  entity_type VARCHAR(32) NOT NULL CHECK (entity_type IN ('service','merchant','merchant_branch','food_item','food_category','promo_collection','address_place','help_support_topic')),
  market_code VARCHAR(40) NOT NULL,
  locale VARCHAR(16) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','suspended','deleted')),
  service_code VARCHAR(60),
  title TEXT NOT NULL,
  searchable_text TEXT NOT NULL DEFAULT '',
  canonical_route TEXT NOT NULL,
  geography GEOGRAPHY(POINT, 4326),
  serviceability JSONB NOT NULL DEFAULT '{}'::jsonb,
  open_now BOOLEAN,
  source_version BIGINT NOT NULL DEFAULT 1,
  index_version VARCHAR(40) NOT NULL,
  quality_score NUMERIC(6,4) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  indexed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  UNIQUE(entity_id, entity_type, market_code, locale, index_version)
);
CREATE INDEX IF NOT EXISTS idx_search_documents_lookup ON search_documents(index_version, market_code, locale, status, entity_type);
CREATE INDEX IF NOT EXISTS idx_search_documents_text ON search_documents USING GIN (to_tsvector('simple', title || ' ' || searchable_text));
CREATE INDEX IF NOT EXISTS idx_search_documents_geo ON search_documents USING GIST(geography);

CREATE TABLE IF NOT EXISTS search_index_aliases (
  alias_name VARCHAR(64) PRIMARY KEY,
  index_version VARCHAR(40) NOT NULL,
  generation BIGINT NOT NULL DEFAULT 1,
  switched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO search_index_aliases(alias_name, index_version)
VALUES ('search-read', 'v1') ON CONFLICT (alias_name) DO NOTHING;

CREATE TABLE IF NOT EXISTS search_index_events (
  event_id UUID PRIMARY KEY,
  entity_id UUID NOT NULL,
  entity_type VARCHAR(32) NOT NULL,
  source_version BIGINT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS search_synonyms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_code VARCHAR(40) NOT NULL,
  locale VARCHAR(16) NOT NULL,
  term VARCHAR(120) NOT NULL,
  canonical_term VARCHAR(120) NOT NULL,
  kind VARCHAR(24) NOT NULL CHECK (kind IN ('synonym','misspelling','intent_alias')),
  reviewed BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(market_code, locale, term)
);

CREATE TABLE IF NOT EXISTS search_merchandising_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_code VARCHAR(40) NOT NULL,
  locale VARCHAR(16) NOT NULL,
  query_term VARCHAR(120) NOT NULL,
  entity_id UUID NOT NULL,
  action VARCHAR(16) NOT NULL CHECK (action IN ('pin','boost','exclude')),
  reason TEXT NOT NULL,
  scope JSONB NOT NULL DEFAULT '{}'::jsonb,
  expires_at TIMESTAMPTZ,
  reviewed BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_search_merchandising_active ON search_merchandising_rules(market_code, locale, query_term, active, expires_at);

CREATE TABLE IF NOT EXISTS search_query_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  query_hash CHAR(64) NOT NULL,
  market_code VARCHAR(40) NOT NULL,
  locale VARCHAR(16) NOT NULL,
  intent VARCHAR(60),
  result_count INT NOT NULL DEFAULT 0,
  organic_count INT NOT NULL DEFAULT 0,
  sponsored_count INT NOT NULL DEFAULT 0,
  ranking_version VARCHAR(40) NOT NULL,
  latency_ms INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_search_query_events_quality ON search_query_events(market_code, locale, created_at DESC);

CREATE TABLE IF NOT EXISTS search_history (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  query_hash CHAR(64) NOT NULL,
  query_label VARCHAR(120) NOT NULL,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(user_id, query_hash)
);

CREATE TABLE IF NOT EXISTS communication_events (
  event_id UUID PRIMARY KEY,
  semantic_type VARCHAR(120) NOT NULL,
  recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  market_code VARCHAR(40) NOT NULL,
  locale VARCHAR(16) NOT NULL,
  category VARCHAR(24) NOT NULL CHECK (category IN ('order','safety','security','support','system','marketing')),
  priority VARCHAR(16) NOT NULL CHECK (priority IN ('low','normal','high','critical')),
  entity_type VARCHAR(40),
  entity_id UUID,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  template_key VARCHAR(120) NOT NULL,
  template_version INT NOT NULL DEFAULT 1,
  correlation_id VARCHAR(120) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(24) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','completed','failed','suppressed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_communication_events_recipient ON communication_events(recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_communication_events_status ON communication_events(status, created_at);

CREATE TABLE IF NOT EXISTS communication_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES communication_events(event_id) ON DELETE CASCADE,
  channel VARCHAR(24) NOT NULL CHECK (channel IN ('in_app','push','sms','email','whatsapp','masked_call')),
  status VARCHAR(24) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','delivered','read','failed','suppressed','dead_letter')),
  attempts INT NOT NULL DEFAULT 0,
  provider_code VARCHAR(80),
  provider_error TEXT,
  next_attempt_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  cost_minor BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(event_id, channel)
);
CREATE INDEX IF NOT EXISTS idx_communication_deliveries_retry ON communication_deliveries(status, next_attempt_at);

CREATE TABLE IF NOT EXISTS communication_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key VARCHAR(120) NOT NULL,
  version INT NOT NULL,
  market_code VARCHAR(40) NOT NULL,
  locale VARCHAR(16) NOT NULL,
  channel VARCHAR(24) NOT NULL,
  category VARCHAR(24) NOT NULL,
  title_template TEXT,
  body_template TEXT NOT NULL,
  required_variables JSONB NOT NULL DEFAULT '[]'::jsonb,
  approval_status VARCHAR(24) NOT NULL DEFAULT 'draft' CHECK (approval_status IN ('draft','approved','retired')),
  protected_copy BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(template_key, version, market_code, locale, channel)
);

CREATE TABLE IF NOT EXISTS communication_preference_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category VARCHAR(24) NOT NULL,
  channel VARCHAR(24) NOT NULL,
  enabled BOOLEAN NOT NULL,
  timezone VARCHAR(64),
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  consent_source VARCHAR(80) NOT NULL,
  changed_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS communication_preferences (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category VARCHAR(24) NOT NULL CHECK (category IN ('order','safety','security','support','system','marketing')),
  channel VARCHAR(24) NOT NULL CHECK (channel IN ('in_app','push','sms','email','whatsapp','masked_call')),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Jakarta',
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  consent_source VARCHAR(80) NOT NULL DEFAULT 'market-compliance',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(user_id, category, channel)
);

ALTER TABLE user_device_tokens
  ADD COLUMN IF NOT EXISTS device_id VARCHAR(160),
  ADD COLUMN IF NOT EXISTS surface VARCHAR(40) NOT NULL DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS app_version VARCHAR(40),
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS invalid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invalid_reason VARCHAR(120);
CREATE INDEX IF NOT EXISTS idx_user_device_tokens_active ON user_device_tokens(user_id, invalid_at, last_seen_at DESC);

-- +goose Down
DROP INDEX IF EXISTS idx_user_device_tokens_active;
ALTER TABLE user_device_tokens DROP COLUMN IF EXISTS invalid_reason, DROP COLUMN IF EXISTS invalid_at, DROP COLUMN IF EXISTS last_seen_at, DROP COLUMN IF EXISTS app_version, DROP COLUMN IF EXISTS surface, DROP COLUMN IF EXISTS device_id;
DROP TABLE IF EXISTS communication_preference_audit;
DROP TABLE IF EXISTS communication_preferences;
DROP TABLE IF EXISTS communication_templates;
DROP INDEX IF EXISTS idx_communication_deliveries_retry;
DROP TABLE IF EXISTS communication_deliveries;
DROP INDEX IF EXISTS idx_communication_events_status;
DROP INDEX IF EXISTS idx_communication_events_recipient;
DROP TABLE IF EXISTS communication_events;
DROP TABLE IF EXISTS search_history;
DROP INDEX IF EXISTS idx_search_query_events_quality;
DROP TABLE IF EXISTS search_query_events;
DROP INDEX IF EXISTS idx_search_merchandising_active;
DROP TABLE IF EXISTS search_merchandising_rules;
DROP TABLE IF EXISTS search_synonyms;
DROP TABLE IF EXISTS search_index_events;
DROP TABLE IF EXISTS search_index_aliases;
DROP INDEX IF EXISTS idx_search_documents_geo;
DROP INDEX IF EXISTS idx_search_documents_text;
DROP INDEX IF EXISTS idx_search_documents_lookup;
DROP TABLE IF EXISTS search_documents;
