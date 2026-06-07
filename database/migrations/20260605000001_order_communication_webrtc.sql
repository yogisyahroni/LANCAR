-- +goose Up
-- +goose StatementBegin

ALTER TABLE customer_receiver_location_requests
  DROP CONSTRAINT IF EXISTS customer_receiver_location_requests_status_check;

ALTER TABLE customer_receiver_location_requests
  ADD CONSTRAINT customer_receiver_location_requests_status_check
  CHECK (status IN ('pending', 'submitted', 'expired', 'cancelled', 'revoked'));

CREATE TABLE IF NOT EXISTS order_conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status VARCHAR(24) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived', 'locked')),
  phase VARCHAR(32) NOT NULL DEFAULT 'customer_courier'
    CHECK (phase IN ('customer_courier', 'customer_courier_recipient')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(order_id)
);

CREATE TABLE IF NOT EXISTS order_conversation_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES order_conversations(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  member_type VARCHAR(24) NOT NULL
    CHECK (member_type IN ('customer', 'courier', 'recipient', 'admin')),
  member_id UUID REFERENCES users(id) ON DELETE SET NULL,
  receiver_location_request_id UUID REFERENCES customer_receiver_location_requests(id) ON DELETE SET NULL,
  display_name VARCHAR(160),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_read_message_id UUID,
  last_read_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_order_conversation_members_user_unique
  ON order_conversation_members(order_id, member_type, member_id)
  WHERE member_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_order_conversation_members_receiver_unique
  ON order_conversation_members(order_id, receiver_location_request_id)
  WHERE receiver_location_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_order_conversation_members_conversation
  ON order_conversation_members(conversation_id, member_type);

CREATE TABLE IF NOT EXISTS order_chat_read_receipts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES order_conversations(id) ON DELETE CASCADE,
  member_id UUID REFERENCES users(id) ON DELETE SET NULL,
  member_type VARCHAR(24) NOT NULL
    CHECK (member_type IN ('customer', 'courier', 'recipient', 'admin')),
  last_message_id UUID REFERENCES order_chats(id) ON DELETE SET NULL,
  read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_order_chat_read_receipts_member
  ON order_chat_read_receipts(order_id, member_type, member_id)
  WHERE member_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_order_chat_read_receipts_order
  ON order_chat_read_receipts(order_id, read_at DESC);

ALTER TABLE order_chats
  ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES order_conversations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS client_message_id VARCHAR(120),
  ADD COLUMN IF NOT EXISTS sender_role_snapshot VARCHAR(32),
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS idx_order_chats_client_message_unique
  ON order_chats(order_id, sender_id, client_message_id)
  WHERE client_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_order_chats_conversation_created
  ON order_chats(conversation_id, created_at ASC);

CREATE TABLE IF NOT EXISTS order_call_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES order_conversations(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  caller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_id UUID REFERENCES users(id) ON DELETE SET NULL,
  target_type VARCHAR(24) NOT NULL
    CHECK (target_type IN ('customer', 'courier', 'recipient')),
  status VARCHAR(24) NOT NULL DEFAULT 'ringing'
    CHECK (status IN ('ringing', 'accepted', 'rejected', 'missed', 'ended', 'failed', 'expired')),
  join_token_hash TEXT NOT NULL,
  ice_servers JSONB NOT NULL DEFAULT '[]'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  answered_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  ended_by UUID REFERENCES users(id) ON DELETE SET NULL,
  failure_code VARCHAR(64),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_call_sessions_order_status
  ON order_call_sessions(order_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_order_call_sessions_expiry
  ON order_call_sessions(expires_at)
  WHERE status IN ('ringing', 'accepted');

CREATE INDEX IF NOT EXISTS idx_order_call_sessions_caller
  ON order_call_sessions(caller_id, created_at DESC);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DROP INDEX IF EXISTS idx_order_call_sessions_caller;
DROP INDEX IF EXISTS idx_order_call_sessions_expiry;
DROP INDEX IF EXISTS idx_order_call_sessions_order_status;
DROP TABLE IF EXISTS order_call_sessions;

DROP INDEX IF EXISTS idx_order_chats_conversation_created;
DROP INDEX IF EXISTS idx_order_chats_client_message_unique;
ALTER TABLE order_chats
  DROP COLUMN IF EXISTS metadata,
  DROP COLUMN IF EXISTS sender_role_snapshot,
  DROP COLUMN IF EXISTS client_message_id,
  DROP COLUMN IF EXISTS conversation_id;

DROP INDEX IF EXISTS idx_order_chat_read_receipts_order;
DROP INDEX IF EXISTS idx_order_chat_read_receipts_member;
DROP TABLE IF EXISTS order_chat_read_receipts;

DROP INDEX IF EXISTS idx_order_conversation_members_conversation;
DROP INDEX IF EXISTS idx_order_conversation_members_receiver_unique;
DROP INDEX IF EXISTS idx_order_conversation_members_user_unique;
DROP TABLE IF EXISTS order_conversation_members;
DROP TABLE IF EXISTS order_conversations;

ALTER TABLE customer_receiver_location_requests
  DROP CONSTRAINT IF EXISTS customer_receiver_location_requests_status_check;

ALTER TABLE customer_receiver_location_requests
  ADD CONSTRAINT customer_receiver_location_requests_status_check
  CHECK (status IN ('pending', 'submitted', 'expired', 'cancelled'));

-- +goose StatementEnd
