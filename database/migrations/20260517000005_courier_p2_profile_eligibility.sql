-- +goose Up
CREATE TABLE IF NOT EXISTS courier_vehicles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  courier_profile_id UUID NOT NULL REFERENCES courier_profiles(id) ON DELETE CASCADE,
  plate_number VARCHAR(20) NOT NULL,
  vehicle_type VARCHAR(30) NOT NULL DEFAULT 'motor',
  vehicle_category VARCHAR(30),
  brand VARCHAR(80),
  model VARCHAR(80),
  production_year INT,
  engine_cc INT,
  engine_type VARCHAR(30),
  max_weight_kg NUMERIC(8,2) NOT NULL DEFAULT 20,
  is_primary BOOLEAN NOT NULL DEFAULT TRUE,
  verification_status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending', 'approved', 'rejected', 'suspended')),
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(courier_profile_id, plate_number)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_courier_vehicles_primary
  ON courier_vehicles(courier_profile_id)
  WHERE is_primary = TRUE;

CREATE TABLE IF NOT EXISTS courier_service_capabilities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  courier_profile_id UUID NOT NULL REFERENCES courier_profiles(id) ON DELETE CASCADE,
  vehicle_id UUID REFERENCES courier_vehicles(id) ON DELETE SET NULL,
  service_code VARCHAR(60) NOT NULL REFERENCES delivery_service_products(code) ON UPDATE CASCADE ON DELETE CASCADE,
  application_channel VARCHAR(30) NOT NULL DEFAULT 'on_demand'
    CHECK (application_channel IN ('on_demand', 'pickup_only', 'delivery_only')),
  status VARCHAR(20) NOT NULL DEFAULT 'pending_review'
    CHECK (status IN ('pending_review', 'enabled', 'disabled', 'rejected')),
  eligibility_reason TEXT,
  max_weight_kg NUMERIC(8,2),
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(courier_profile_id, service_code)
);

CREATE INDEX IF NOT EXISTS idx_courier_service_capabilities_profile
  ON courier_service_capabilities(courier_profile_id, status);

CREATE TABLE IF NOT EXISTS courier_training_completions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  courier_profile_id UUID NOT NULL REFERENCES courier_profiles(id) ON DELETE CASCADE,
  training_key VARCHAR(80) NOT NULL,
  title VARCHAR(160) NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(courier_profile_id, training_key)
);

CREATE TABLE IF NOT EXISTS courier_earnings_ledger (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  courier_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  source VARCHAR(40) NOT NULL DEFAULT 'delivery'
    CHECK (source IN ('delivery', 'incentive', 'adjustment', 'reversal')),
  direction VARCHAR(10) NOT NULL DEFAULT 'credit'
    CHECK (direction IN ('credit', 'debit')),
  amount_idr INT NOT NULL CHECK (amount_idr >= 0),
  settlement_status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (settlement_status IN ('pending', 'available', 'paid', 'held', 'cancelled')),
  description TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_courier_earnings_ledger_courier
  ON courier_earnings_ledger(courier_id, created_at DESC);

INSERT INTO courier_vehicles (
  courier_profile_id,
  plate_number,
  vehicle_type,
  vehicle_category,
  brand,
  model,
  production_year,
  engine_cc,
  engine_type,
  max_weight_kg,
  verification_status,
  approved_at
)
SELECT
  cp.id,
  COALESCE(NULLIF(cp.vehicle_plate, ''), 'UNKNOWN-' || substr(cp.id::text, 1, 8)),
  CASE
    WHEN COALESCE(cp.vehicle_category, cp.vehicle_type, '') IN ('mobil', 'car', 'box') THEN 'car'
    ELSE 'motor'
  END,
  cp.vehicle_category,
  cp.vehicle_brand,
  cp.vehicle_model,
  cp.vehicle_year,
  cp.vehicle_cc,
  CASE
    WHEN (cp.onboarding_checklist->'summary'->>'engine_type') IS NOT NULL THEN cp.onboarding_checklist->'summary'->>'engine_type'
    ELSE NULL
  END,
  CASE
    WHEN COALESCE(cp.vehicle_category, cp.vehicle_type, '') IN ('mobil', 'car', 'box') THEN 200
    ELSE 20
  END,
  CASE WHEN cp.is_verified = TRUE THEN 'approved' ELSE 'pending' END,
  CASE WHEN cp.is_verified = TRUE THEN COALESCE(cp.reviewed_at, NOW()) ELSE NULL END
FROM courier_profiles cp
ON CONFLICT (courier_profile_id, plate_number) DO UPDATE SET
  vehicle_type = EXCLUDED.vehicle_type,
  vehicle_category = EXCLUDED.vehicle_category,
  brand = EXCLUDED.brand,
  model = EXCLUDED.model,
  production_year = EXCLUDED.production_year,
  engine_cc = EXCLUDED.engine_cc,
  max_weight_kg = EXCLUDED.max_weight_kg,
  verification_status = EXCLUDED.verification_status,
  updated_at = NOW();

INSERT INTO courier_service_capabilities (
  courier_profile_id,
  vehicle_id,
  service_code,
  application_channel,
  status,
  eligibility_reason,
  max_weight_kg,
  approved_at
)
SELECT
  cp.id,
  cv.id,
  dsp.code,
  cp.application_channel,
  CASE WHEN cp.is_verified = TRUE THEN 'enabled' ELSE 'pending_review' END,
  CASE
    WHEN dsp.service_category = 'on_demand' THEN 'Eligible for on-demand product based on active vehicle profile.'
    ELSE 'Eligible for non on-demand operational product based on active vehicle profile.'
  END,
  COALESCE(dsp.max_weight_kg, cv.max_weight_kg),
  CASE WHEN cp.is_verified = TRUE THEN COALESCE(cp.reviewed_at, NOW()) ELSE NULL END
FROM courier_profiles cp
JOIN courier_vehicles cv ON cv.courier_profile_id = cp.id AND cv.is_primary = TRUE
JOIN delivery_service_products dsp ON dsp.is_enabled = TRUE
WHERE (
    cp.application_channel = 'on_demand'
    AND dsp.service_category = 'on_demand'
  ) OR (
    cp.application_channel IN ('pickup_only', 'delivery_only')
    AND dsp.service_category <> 'on_demand'
  )
ON CONFLICT (courier_profile_id, service_code) DO NOTHING;

-- +goose Down
DROP INDEX IF EXISTS idx_courier_earnings_ledger_courier;
DROP TABLE IF EXISTS courier_earnings_ledger;
DROP TABLE IF EXISTS courier_training_completions;
DROP INDEX IF EXISTS idx_courier_service_capabilities_profile;
DROP TABLE IF EXISTS courier_service_capabilities;
DROP INDEX IF EXISTS idx_courier_vehicles_primary;
DROP TABLE IF EXISTS courier_vehicles;
