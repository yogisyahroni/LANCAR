-- +goose Up
-- Ensure legacy local/staging customer seed accounts can use the unified
-- customer password login across mobile and web. Real production users should
-- set credentials through registration or reset-password flows.
UPDATE customers
SET password_hash = '$argon2id$v=19$m=65536,t=3,p=2$WYID1WrJJf2UjFDrnrP/Xg$QS327ZhyYvWoFv9tZMwkhjE/QCv08fAQkdP7FfWXM1Y',
    status = CASE WHEN status = 'pending_verification' THEN 'active' ELSE status END,
    is_verified = true,
    updated_at = NOW()
WHERE email IN ('customer@lancar.id', 'customer.mobile@lancar.id')
  AND (password_hash IS NULL OR password_hash = '');

-- +goose Down
UPDATE customers
SET password_hash = NULL,
    updated_at = NOW()
WHERE email = 'customer@lancar.id'
  AND password_hash = '$argon2id$v=19$m=65536,t=3,p=2$WYID1WrJJf2UjFDrnrP/Xg$QS327ZhyYvWoFv9tZMwkhjE/QCv08fAQkdP7FfWXM1Y';
