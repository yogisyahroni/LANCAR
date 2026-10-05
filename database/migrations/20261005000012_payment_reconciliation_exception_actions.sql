-- +goose Up
-- Payment reconciliation exceptions are evidence, not editable financial truth.
-- Every operator decision is append-only and idempotent; the queue projection
-- may expose only the latest status and note.
CREATE TABLE IF NOT EXISTS payment_reconciliation_exception_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exception_id UUID NOT NULL REFERENCES payment_reconciliation_exceptions(id) ON DELETE CASCADE,
    actor_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    from_status VARCHAR(24) NOT NULL,
    to_status VARCHAR(24) NOT NULL,
    action_note TEXT NOT NULL,
    idempotency_key VARCHAR(180) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT payment_reconciliation_exception_actions_status_check
      CHECK (from_status IN ('OPEN','IN_REVIEW','RESOLVED','ACCEPTED')
         AND to_status IN ('OPEN','IN_REVIEW','RESOLVED','ACCEPTED')),
    CONSTRAINT payment_reconciliation_exception_actions_note_check
      CHECK (length(btrim(action_note)) BETWEEN 10 AND 2000),
    CONSTRAINT payment_reconciliation_exception_actions_idempotency_unique
      UNIQUE (exception_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_payment_reconciliation_exception_actions_history
  ON payment_reconciliation_exception_actions(exception_id, created_at ASC);

-- +goose Down
DROP INDEX IF EXISTS idx_payment_reconciliation_exception_actions_history;
DROP TABLE IF EXISTS payment_reconciliation_exception_actions;
