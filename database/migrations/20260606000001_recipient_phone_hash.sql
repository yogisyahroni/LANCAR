-- +goose Up
-- +goose StatementBegin

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS recipient_phone_hash VARCHAR(128);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS phone_number_hash VARCHAR(128);

CREATE INDEX IF NOT EXISTS idx_orders_recipient_phone_hash_active
  ON orders(recipient_phone_hash, status, created_at DESC)
  WHERE recipient_phone_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_phone_number_hash
  ON users(phone_number_hash)
  WHERE phone_number_hash IS NOT NULL
    AND deleted_at IS NULL;

ALTER TABLE customer_receiver_location_requests
  ADD COLUMN IF NOT EXISTS submitted_contact_phone_hash VARCHAR(128);

CREATE INDEX IF NOT EXISTS idx_customer_receiver_location_requests_phone_hash
  ON customer_receiver_location_requests(submitted_contact_phone_hash, status, submitted_at DESC)
  WHERE submitted_contact_phone_hash IS NOT NULL;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DROP INDEX IF EXISTS idx_customer_receiver_location_requests_phone_hash;
ALTER TABLE customer_receiver_location_requests
  DROP COLUMN IF EXISTS submitted_contact_phone_hash;

DROP INDEX IF EXISTS idx_users_phone_number_hash;
ALTER TABLE users
  DROP COLUMN IF EXISTS phone_number_hash;

DROP INDEX IF EXISTS idx_orders_recipient_phone_hash_active;
ALTER TABLE orders
  DROP COLUMN IF EXISTS recipient_phone_hash;

-- +goose StatementEnd
