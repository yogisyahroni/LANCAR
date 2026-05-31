-- +goose Up
-- Development-safe admin identity: the email is seeded, but no default password
-- is stored in the database. Local development login is controlled by
-- DEV_ADMIN_LOGIN_PASSWORDS and is ignored by the API in production.
UPDATE users
SET
    email = 'admin@tembus.id',
    updated_at = NOW()
WHERE phone_number = '+628123456789'
  AND role = 'super_admin'
  AND deleted_at IS NULL
  AND (
      email IS NULL
      OR email = ''
      OR LOWER(email) IN ('admin@lancar.com', 'admin@lancar.id')
  );

-- +goose Down
UPDATE users
SET
    email = NULL,
    updated_at = NOW()
WHERE phone_number = '+628123456789'
  AND role = 'super_admin'
  AND LOWER(email) = 'admin@tembus.id'
  AND deleted_at IS NULL;
