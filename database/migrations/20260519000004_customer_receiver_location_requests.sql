-- +goose Up
-- +goose StatementBegin

CREATE TABLE IF NOT EXISTS customer_receiver_location_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  pickup_address TEXT NOT NULL,
  pickup_location GEOGRAPHY(POINT, 4326),
  recipient_name VARCHAR(255),
  recipient_phone_masked VARCHAR(40),
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'submitted', 'expired', 'cancelled')),
  requested_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  submitted_address TEXT,
  submitted_location GEOGRAPHY(POINT, 4326),
  submitted_contact_name VARCHAR(255),
  submitted_contact_phone_masked VARCHAR(40),
  submitted_notes TEXT,
  submitted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_receiver_location_requests_customer
  ON customer_receiver_location_requests(customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_customer_receiver_location_requests_status_expiry
  ON customer_receiver_location_requests(status, expires_at);

CREATE INDEX IF NOT EXISTS idx_customer_receiver_location_requests_submitted_location
  ON customer_receiver_location_requests USING GIST(submitted_location);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DROP INDEX IF EXISTS idx_customer_receiver_location_requests_submitted_location;
DROP INDEX IF EXISTS idx_customer_receiver_location_requests_status_expiry;
DROP INDEX IF EXISTS idx_customer_receiver_location_requests_customer;
DROP TABLE IF EXISTS customer_receiver_location_requests;

-- +goose StatementEnd
