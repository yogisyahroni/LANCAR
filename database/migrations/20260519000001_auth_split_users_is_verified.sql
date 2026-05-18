-- +goose Up
-- +goose StatementBegin

-- Keep auth user lookup compatible with both legacy users table and split user tables.
ALTER TABLE IF EXISTS users
  ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE IF EXISTS customers
  ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE IF EXISTS couriers
  ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE IF EXISTS staff
  ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT TRUE;

DO $$
BEGIN
  IF to_regclass('public.users') IS NOT NULL THEN
    UPDATE users SET is_verified = TRUE WHERE is_verified IS NULL;
  END IF;
  IF to_regclass('public.customers') IS NOT NULL THEN
    UPDATE customers SET is_verified = TRUE WHERE is_verified IS NULL;
  END IF;
  IF to_regclass('public.couriers') IS NOT NULL THEN
    UPDATE couriers SET is_verified = TRUE WHERE is_verified IS NULL;
  END IF;
  IF to_regclass('public.staff') IS NOT NULL THEN
    UPDATE staff SET is_verified = TRUE WHERE is_verified IS NULL;
  END IF;
END $$;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

ALTER TABLE IF EXISTS staff
  DROP COLUMN IF EXISTS is_verified;

ALTER TABLE IF EXISTS couriers
  DROP COLUMN IF EXISTS is_verified;

ALTER TABLE IF EXISTS customers
  DROP COLUMN IF EXISTS is_verified;

ALTER TABLE IF EXISTS users
  DROP COLUMN IF EXISTS is_verified;

-- +goose StatementEnd
