-- +goose Up
-- LANCAR — Tambal Ban: katalog material yang dapat ditagihkan.
-- Harga adalah konfigurasi operasional di database, bukan nilai dari client.

CREATE TABLE IF NOT EXISTS tambal_ban_materials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_code VARCHAR(50) NOT NULL,
    code VARCHAR(80) NOT NULL,
    name VARCHAR(160) NOT NULL,
    description VARCHAR(300) NOT NULL DEFAULT '',
    vehicle_type VARCHAR(20) NOT NULL CHECK (vehicle_type IN ('motor', 'mobil')),
    price_idr BIGINT NOT NULL CHECK (price_idr >= 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (service_code, code)
);

CREATE INDEX IF NOT EXISTS idx_tambal_ban_materials_service_active
    ON tambal_ban_materials (service_code, is_active, name);

INSERT INTO tambal_ban_materials
    (service_code, code, name, description, vehicle_type, price_idr)
VALUES
    ('tambal_ban_motor', 'tambal_tubeless', 'Tambal ban tubeless', 'Jasa dan material tambal ban tubeless', 'motor', 15000),
    ('tambal_ban_motor', 'tambal_ban_dalam', 'Tambal ban dalam', 'Jasa dan material tambal ban dalam', 'motor', 20000),
    ('tambal_ban_motor', 'pentil_ban_motor', 'Pentil ban motor', 'Penggantian pentil ban motor', 'motor', 5000),
    ('tambal_ban_mobil', 'tambal_ban_mobil', 'Tambal ban mobil', 'Jasa dan material tambal ban mobil', 'mobil', 30000),
    ('tambal_ban_mobil', 'tambal_ban_dalam_mobil', 'Tambal ban dalam mobil', 'Jasa dan material tambal ban dalam mobil', 'mobil', 40000),
    ('tambal_ban_mobil', 'pentil_ban_mobil', 'Pentil ban mobil', 'Penggantian pentil ban mobil', 'mobil', 10000)
ON CONFLICT (service_code, code) DO NOTHING;

-- +goose Down
DROP TABLE IF EXISTS tambal_ban_materials;
