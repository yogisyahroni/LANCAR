-- +goose Up
-- +goose StatementBegin
-- Ensure legacy local/staging customer seed accounts can use the unified
-- customer password login across mobile and web. Real production users should
-- set credentials through registration or reset-password flows.
DO $$
DECLARE
  customer_password_hash TEXT := '$argon2id$v=19$m=65536,t=3,p=2$WYID1WrJJf2UjFDrnrP/Xg$QS327ZhyYvWoFv9tZMwkhjE/QCv08fAQkdP7FfWXM1Y';
BEGIN
  IF to_regclass('public.customers') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'customers'
         AND column_name = 'password_hash'
     ) THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'customers'
        AND column_name = 'is_verified'
    ) THEN
      UPDATE customers
      SET password_hash = customer_password_hash,
          status = CASE WHEN status = 'pending_verification' THEN 'active' ELSE status END,
          is_verified = true,
          updated_at = NOW()
      WHERE email IN ('customer@lancar.id', 'customer.mobile@lancar.id')
        AND (password_hash IS NULL OR password_hash = '');
    ELSE
      UPDATE customers
      SET password_hash = customer_password_hash,
          status = CASE WHEN status = 'pending_verification' THEN 'active' ELSE status END,
          updated_at = NOW()
      WHERE email IN ('customer@lancar.id', 'customer.mobile@lancar.id')
        AND (password_hash IS NULL OR password_hash = '');
    END IF;
  END IF;

  IF to_regclass('public.users') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'users'
         AND column_name = 'password_hash'
     ) THEN
    UPDATE users
    SET password_hash = customer_password_hash,
        status = CASE WHEN status = 'pending_verification' THEN 'active' ELSE status END,
        updated_at = NOW()
    WHERE email IN ('customer@lancar.id', 'customer.mobile@lancar.id')
      AND role = 'customer'
      AND (password_hash IS NULL OR password_hash = '');
  END IF;
END $$;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DO $$
DECLARE
  customer_password_hash TEXT := '$argon2id$v=19$m=65536,t=3,p=2$WYID1WrJJf2UjFDrnrP/Xg$QS327ZhyYvWoFv9tZMwkhjE/QCv08fAQkdP7FfWXM1Y';
BEGIN
  IF to_regclass('public.customers') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'customers'
         AND column_name = 'password_hash'
     ) THEN
    UPDATE customers
    SET password_hash = NULL,
        updated_at = NOW()
    WHERE email IN ('customer@lancar.id', 'customer.mobile@lancar.id')
      AND password_hash = customer_password_hash;
  END IF;

  IF to_regclass('public.users') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'users'
         AND column_name = 'password_hash'
     ) THEN
    UPDATE users
    SET password_hash = NULL,
        updated_at = NOW()
    WHERE email IN ('customer@lancar.id', 'customer.mobile@lancar.id')
      AND role = 'customer'
      AND password_hash = customer_password_hash;
  END IF;
END $$;
-- +goose StatementEnd
