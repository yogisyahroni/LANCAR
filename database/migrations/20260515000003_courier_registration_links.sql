-- +goose Up
CREATE TABLE IF NOT EXISTS courier_registration_links (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  token_hash TEXT NOT NULL UNIQUE,
  application_channel VARCHAR(30) NOT NULL CHECK (application_channel IN ('on_demand', 'pickup_only', 'delivery_only')),
  title VARCHAR(120) NOT NULL,
  notes TEXT,
  max_uses INT,
  use_count INT NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'expired')),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_courier_registration_links_channel_status
  ON courier_registration_links(application_channel, status, created_at DESC);

-- +goose Down
DROP INDEX IF EXISTS idx_courier_registration_links_channel_status;
DROP TABLE IF EXISTS courier_registration_links;
