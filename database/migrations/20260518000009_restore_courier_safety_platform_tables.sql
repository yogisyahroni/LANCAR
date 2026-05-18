-- +goose Up
CREATE TABLE IF NOT EXISTS courier_safety_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  courier_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type VARCHAR(40) NOT NULL CHECK (event_type IN ('sos', 'report_sender', 'report_recipient', 'prohibited_goods', 'road_incident', 'support_request')),
  severity VARCHAR(20) NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved', 'dismissed')),
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  accuracy_m DOUBLE PRECISION,
  message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_courier_safety_events_open
  ON courier_safety_events(status, severity, created_at DESC)
  WHERE status IN ('open', 'acknowledged');

CREATE INDEX IF NOT EXISTS idx_courier_safety_events_courier
  ON courier_safety_events(courier_id, created_at DESC);

CREATE TABLE IF NOT EXISTS courier_incentive_campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(80) UNIQUE NOT NULL,
  title VARCHAR(160) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  target_deliveries INT NOT NULL DEFAULT 0,
  reward_idr INT NOT NULL DEFAULT 0,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_courier_incentive_campaigns_active
  ON courier_incentive_campaigns(is_active, starts_at, ends_at);

CREATE TABLE IF NOT EXISTS courier_tier_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tier_code VARCHAR(40) UNIQUE NOT NULL,
  tier_name VARCHAR(80) NOT NULL,
  min_rating NUMERIC(3,2) NOT NULL DEFAULT 0,
  min_completion_rate INT NOT NULL DEFAULT 0,
  min_deliveries_30d INT NOT NULL DEFAULT 0,
  benefit_summary TEXT NOT NULL DEFAULT '',
  display_order INT NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO courier_tier_configs (tier_code, tier_name, min_rating, min_completion_rate, min_deliveries_30d, benefit_summary, display_order)
VALUES
  ('starter', 'Starter', 0, 0, 0, 'Akses pekerjaan on-demand reguler.', 10),
  ('reliable', 'Reliable', 4.60, 90, 30, 'Prioritas dispatch lebih tinggi dan akses campaign harian.', 20),
  ('elite', 'Elite', 4.80, 95, 80, 'Prioritas dispatch tertinggi, campaign premium, dan support cepat.', 30)
ON CONFLICT (tier_code) DO UPDATE SET
  tier_name = EXCLUDED.tier_name,
  min_rating = EXCLUDED.min_rating,
  min_completion_rate = EXCLUDED.min_completion_rate,
  min_deliveries_30d = EXCLUDED.min_deliveries_30d,
  benefit_summary = EXCLUDED.benefit_summary,
  display_order = EXCLUDED.display_order,
  updated_at = NOW();

INSERT INTO courier_incentive_campaigns (code, title, description, target_deliveries, reward_idr, starts_at, ends_at, metadata)
VALUES (
  'daily_on_demand_5',
  'Target Harian On Demand',
  'Selesaikan 5 pekerjaan on-demand hari ini untuk bonus operasional.',
  5,
  25000,
  date_trunc('day', NOW()),
  date_trunc('day', NOW()) + INTERVAL '1 day' - INTERVAL '1 second',
  '{"scope":"on_demand"}'::jsonb
)
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  target_deliveries = EXCLUDED.target_deliveries,
  reward_idr = EXCLUDED.reward_idr,
  starts_at = EXCLUDED.starts_at,
  ends_at = EXCLUDED.ends_at,
  is_active = TRUE,
  updated_at = NOW();

-- +goose Down
DELETE FROM courier_incentive_campaigns WHERE code = 'daily_on_demand_5';
DELETE FROM courier_tier_configs WHERE tier_code IN ('starter', 'reliable', 'elite');
