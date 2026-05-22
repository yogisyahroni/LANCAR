-- +goose Up
-- +goose StatementBegin
CREATE TABLE IF NOT EXISTS customer_addresses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID NOT NULL,
    label VARCHAR(80) NOT NULL,
    contact_name VARCHAR(160),
    contact_phone_masked VARCHAR(40),
    address TEXT NOT NULL,
    location GEOGRAPHY(Point, 4326) NOT NULL,
    notes TEXT,
    kind VARCHAR(20) NOT NULL DEFAULT 'receiver' CHECK (kind IN ('pickup', 'receiver', 'both')),
    is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
    usage_count INT NOT NULL DEFAULT 0,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

ALTER TABLE customer_addresses
    DROP CONSTRAINT IF EXISTS customer_addresses_customer_id_fkey;

DO $$
BEGIN
  IF to_regclass('public.customers') IS NOT NULL THEN
    ALTER TABLE customer_addresses
      ADD CONSTRAINT customer_addresses_customer_id_fkey
      FOREIGN KEY (customer_id)
      REFERENCES customers(id)
      ON DELETE CASCADE;
  ELSIF to_regclass('public.users') IS NOT NULL THEN
    ALTER TABLE customer_addresses
      ADD CONSTRAINT customer_addresses_customer_id_fkey
      FOREIGN KEY (customer_id)
      REFERENCES users(id)
      ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_customer_addresses_customer_active
    ON customer_addresses(customer_id)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_customer_addresses_customer_favorite
    ON customer_addresses(customer_id, is_favorite, kind)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_customer_addresses_location
    ON customer_addresses USING GIST(location)
    WHERE deleted_at IS NULL;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE customer_addresses
    DROP CONSTRAINT IF EXISTS customer_addresses_customer_id_fkey;

DO $$
BEGIN
  IF to_regclass('public.users') IS NOT NULL THEN
    ALTER TABLE customer_addresses
      ADD CONSTRAINT customer_addresses_customer_id_fkey
      FOREIGN KEY (customer_id)
      REFERENCES users(id)
      ON DELETE CASCADE;
  END IF;
END $$;
-- +goose StatementEnd
