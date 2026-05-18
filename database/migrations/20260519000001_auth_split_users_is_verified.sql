-- Keep split user tables compatible with auth-service user lookup.
-- Auth service reads is_verified from customers, couriers, and staff.

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS totp_secret TEXT,
  ADD COLUMN IF NOT EXISTS is_2fa_enabled BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS totp_backup_codes TEXT[];

ALTER TABLE couriers
  ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE customers SET is_verified = TRUE WHERE is_verified IS NULL;
UPDATE couriers SET is_verified = TRUE WHERE is_verified IS NULL;
UPDATE staff SET is_verified = TRUE WHERE is_verified IS NULL;
