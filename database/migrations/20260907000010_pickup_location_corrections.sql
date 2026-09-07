-- +goose Up
-- GEO-2026-006: auditable customer/courier pickup pin corrections.
CREATE TABLE IF NOT EXISTS pickup_location_corrections (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id              UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    suggested_by          UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    suggested_by_role     VARCHAR(16) NOT NULL CHECK (suggested_by_role IN ('customer', 'courier')),
    previous_location     GEOGRAPHY(POINT, 4326) NOT NULL,
    proposed_location     GEOGRAPHY(POINT, 4326) NOT NULL,
    previous_address      TEXT NOT NULL,
    proposed_address      TEXT NOT NULL,
    reason                TEXT NOT NULL,
    status                VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'expired')),
    accepted_by           UUID REFERENCES users(id) ON DELETE RESTRICT,
    accepted_at           TIMESTAMPTZ,
    route_recalculation_required BOOLEAN NOT NULL DEFAULT TRUE,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pickup_corrections_order_status
  ON pickup_location_corrections(order_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pickup_corrections_actor
  ON pickup_location_corrections(suggested_by, created_at DESC);

-- +goose Down
DROP INDEX IF EXISTS idx_pickup_corrections_actor;
DROP INDEX IF EXISTS idx_pickup_corrections_order_status;
DROP TABLE IF EXISTS pickup_location_corrections;
