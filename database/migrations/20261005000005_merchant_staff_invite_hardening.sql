-- +goose Up

ALTER TABLE merchant_staff
    ADD COLUMN IF NOT EXISTS invite_email TEXT,
    ADD COLUMN IF NOT EXISTS invite_phone TEXT,
    ADD COLUMN IF NOT EXISTS invite_expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS invite_attempts INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS invite_last_attempt_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;

UPDATE merchant_staff
SET invite_expires_at = created_at + INTERVAL '7 days'
WHERE invite_expires_at IS NULL;

UPDATE merchant_staff
SET status = 'revoked', updated_at = NOW()
WHERE status = 'pending' AND invite_expires_at <= NOW();

ALTER TABLE merchant_staff
    ADD CONSTRAINT merchant_staff_invite_attempts_nonnegative
    CHECK (invite_attempts >= 0);

CREATE INDEX IF NOT EXISTS idx_merchant_staff_pending_invite_expiry
    ON merchant_staff(merchant_id, invite_expires_at)
    WHERE status = 'pending';

-- +goose Down

DROP INDEX IF EXISTS idx_merchant_staff_pending_invite_expiry;
ALTER TABLE merchant_staff DROP CONSTRAINT IF EXISTS merchant_staff_invite_attempts_nonnegative;
ALTER TABLE merchant_staff
    DROP COLUMN IF EXISTS accepted_at,
    DROP COLUMN IF EXISTS invite_last_attempt_at,
    DROP COLUMN IF EXISTS invite_attempts,
    DROP COLUMN IF EXISTS invite_expires_at,
    DROP COLUMN IF EXISTS invite_phone,
    DROP COLUMN IF EXISTS invite_email;
