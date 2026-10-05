-- +goose Up

-- MWEB-PORTAL-P0-007: durable maker-checker decision metadata for merchant payout changes.
-- The approval request remains the source of truth; these fields only preserve
-- who rejected it and why so the decision is auditable and replay-safe.

ALTER TABLE merchant_security_approvals
    ADD COLUMN IF NOT EXISTS rejected_by UUID REFERENCES users(id),
    ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
    ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_merchant_security_approvals_decided
    ON merchant_security_approvals (merchant_id, status, created_at DESC);

-- +goose Down
DROP INDEX IF EXISTS idx_merchant_security_approvals_decided;
ALTER TABLE merchant_security_approvals
    DROP COLUMN IF EXISTS rejected_at,
    DROP COLUMN IF EXISTS rejection_reason,
    DROP COLUMN IF EXISTS rejected_by;
