-- +goose Up
-- Provider-side verification that the vehicle at the service location matches
-- the vehicle details submitted by the customer. Evidence is immutable per
-- order/service and is kept server-side for audit and dispute handling.
CREATE TABLE IF NOT EXISTS roadside_vehicle_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    courier_id UUID NOT NULL REFERENCES users(id),
    service_category VARCHAR(30) NOT NULL CHECK (service_category IN ('tambal_ban', 'towing')),
    match_status VARCHAR(20) NOT NULL CHECK (match_status IN ('matched', 'mismatch')),
    observed_type TEXT NOT NULL,
    observed_make TEXT NOT NULL,
    observed_model TEXT NOT NULL,
    observed_plate TEXT,
    notes TEXT,
    customer_vehicle_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    photo_url TEXT NOT NULL,
    photo_checksum_sha256 TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (order_id, service_category)
);

CREATE INDEX IF NOT EXISTS idx_roadside_vehicle_verifications_courier
    ON roadside_vehicle_verifications(courier_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_roadside_vehicle_verifications_order
    ON roadside_vehicle_verifications(order_id, service_category);

-- +goose Down
DROP TABLE IF EXISTS roadside_vehicle_verifications;
