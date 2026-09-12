-- +goose Up

-- Safety/support reports keep only the minimum moderation metadata. Chat
-- contents, phone numbers, and attachment URLs are deliberately not copied.
CREATE TABLE IF NOT EXISTS communication_chat_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  reported_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_id UUID,
  reason VARCHAR(500) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','reviewing','resolved','dismissed')),
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_communication_chat_reports_queue
  ON communication_chat_reports(status, created_at);

-- +goose Down
DROP INDEX IF EXISTS idx_communication_chat_reports_queue;
DROP TABLE IF EXISTS communication_chat_reports;
