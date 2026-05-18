-- +goose Up
-- +goose StatementBegin

-- Customer password credential step before OTP challenge.
ALTER TABLE IF EXISTS users
  ADD COLUMN IF NOT EXISTS password_hash TEXT;

ALTER TABLE IF EXISTS customers
  ADD COLUMN IF NOT EXISTS password_hash TEXT;

ALTER TABLE IF EXISTS customers
  ADD COLUMN IF NOT EXISTS totp_secret TEXT,
  ADD COLUMN IF NOT EXISTS is_2fa_enabled BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS totp_backup_codes TEXT[];

DO $$
BEGIN
  IF to_regclass('public.users') IS NOT NULL THEN
    UPDATE users
    SET is_2fa_enabled = FALSE
    WHERE is_2fa_enabled IS NULL;
  END IF;
  IF to_regclass('public.customers') IS NOT NULL THEN
    UPDATE customers
    SET totp_backup_codes = ARRAY[]::TEXT[]
    WHERE totp_backup_codes IS NULL;

    UPDATE customers
    SET is_2fa_enabled = FALSE
    WHERE is_2fa_enabled IS NULL;
  END IF;
END $$;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

ALTER TABLE IF EXISTS customers
  DROP COLUMN IF EXISTS password_hash,
  DROP COLUMN IF EXISTS totp_backup_codes,
  DROP COLUMN IF EXISTS is_2fa_enabled,
  DROP COLUMN IF EXISTS totp_secret;

ALTER TABLE IF EXISTS users
  DROP COLUMN IF EXISTS password_hash;

-- +goose StatementEnd
