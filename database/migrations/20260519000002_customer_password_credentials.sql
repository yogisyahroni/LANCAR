-- Customer password credential step before OTP challenge.
-- Password hashes use auth-service Argon2id format.

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS password_hash TEXT;

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS totp_secret TEXT,
  ADD COLUMN IF NOT EXISTS is_2fa_enabled BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS totp_backup_codes TEXT[];

UPDATE customers
SET totp_backup_codes = ARRAY[]::TEXT[]
WHERE totp_backup_codes IS NULL;

UPDATE customers
SET is_2fa_enabled = FALSE
WHERE is_2fa_enabled IS NULL;
