-- +goose Up
-- GLOB-2026-010: first-class support cases owned by admin-service.
-- The case stores references to authoritative aggregates; it deliberately does
-- not copy order, payment, courier, merchant or carrier state.
CREATE TABLE IF NOT EXISTS support_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_number VARCHAR(40) NOT NULL UNIQUE DEFAULT (
    'SUP-' || UPPER(SUBSTRING(REPLACE(gen_random_uuid()::text, '-', '') FROM 1 FOR 12))
  ),
  requester_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  requester_role VARCHAR(30) NOT NULL,
  category VARCHAR(80) NOT NULL,
  subject VARCHAR(180) NOT NULL,
  description TEXT NOT NULL,
  service_code VARCHAR(80) NOT NULL DEFAULT 'general',
  market_code VARCHAR(80) NOT NULL DEFAULT 'id-jk',
  priority VARCHAR(12) NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status VARCHAR(24) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'investigating', 'pending_customer', 'pending_internal', 'resolved', 'closed')),
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  escalation_level SMALLINT NOT NULL DEFAULT 0 CHECK (escalation_level BETWEEN 0 AND 5),
  sla_due_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  resolved_at TIMESTAMPTZ,
  reopened_at TIMESTAMPTZ,
  reopen_count INTEGER NOT NULL DEFAULT 0 CHECK (reopen_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_cases_queue
  ON support_cases(status, priority, sla_due_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_cases_requester
  ON support_cases(requester_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_cases_assignee
  ON support_cases(assigned_to, status, sla_due_at);
CREATE INDEX IF NOT EXISTS idx_support_cases_service_market
  ON support_cases(service_code, market_code, status, created_at DESC);

CREATE TABLE IF NOT EXISTS support_case_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES support_cases(id) ON DELETE CASCADE,
  reference_type VARCHAR(24) NOT NULL CHECK (
    reference_type IN ('order', 'payment', 'refund', 'courier', 'merchant', 'carrier', 'proof', 'claim', 'reconciliation')
  ),
  reference_id TEXT NOT NULL,
  reference_label VARCHAR(160),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (case_id, reference_type, reference_id)
);

CREATE INDEX IF NOT EXISTS idx_support_case_links_reference
  ON support_case_links(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_support_case_links_case
  ON support_case_links(case_id, created_at);

CREATE TABLE IF NOT EXISTS support_case_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES support_cases(id) ON DELETE CASCADE,
  event_type VARCHAR(64) NOT NULL,
  from_status VARCHAR(24),
  to_status VARCHAR(24),
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_role VARCHAR(30),
  note TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_case_events_case
  ON support_case_events(case_id, created_at, id);

CREATE TABLE IF NOT EXISTS support_case_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES support_cases(id) ON DELETE CASCADE,
  idempotency_key VARCHAR(200) NOT NULL,
  action_type VARCHAR(32) NOT NULL CHECK (
    action_type IN ('request_more_info', 'reassign', 'escalate', 'resolve', 'reopen', 'refund', 'compensate')
  ),
  status VARCHAR(16) NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'succeeded', 'failed')),
  requested_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  amount_idr BIGINT,
  external_reference VARCHAR(160),
  result_metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(result_metadata) = 'object'),
  error_code VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (case_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_support_case_actions_case
  ON support_case_actions(case_id, created_at);
CREATE INDEX IF NOT EXISTS idx_support_case_actions_status
  ON support_case_actions(status, updated_at)
  WHERE status = 'processing';

-- admin-service owns the case workflow. Event/action history is append-only at
-- application level; no DELETE/UPDATE grant is provided for the event table.
GRANT SELECT, INSERT, UPDATE ON support_cases TO tembus_admin;
GRANT SELECT, INSERT ON support_case_links TO tembus_admin;
GRANT SELECT, INSERT ON support_case_events TO tembus_admin;
GRANT SELECT, INSERT, UPDATE ON support_case_actions TO tembus_admin;

-- +goose Down
REVOKE ALL ON support_case_actions FROM tembus_admin;
REVOKE ALL ON support_case_events FROM tembus_admin;
REVOKE ALL ON support_case_links FROM tembus_admin;
REVOKE ALL ON support_cases FROM tembus_admin;
DROP INDEX IF EXISTS idx_support_case_actions_status;
DROP INDEX IF EXISTS idx_support_case_actions_case;
DROP TABLE IF EXISTS support_case_actions;
DROP INDEX IF EXISTS idx_support_case_events_case;
DROP TABLE IF EXISTS support_case_events;
DROP INDEX IF EXISTS idx_support_case_links_case;
DROP INDEX IF EXISTS idx_support_case_links_reference;
DROP TABLE IF EXISTS support_case_links;
DROP INDEX IF EXISTS idx_support_cases_service_market;
DROP INDEX IF EXISTS idx_support_cases_assignee;
DROP INDEX IF EXISTS idx_support_cases_requester;
DROP INDEX IF EXISTS idx_support_cases_queue;
DROP TABLE IF EXISTS support_cases;
