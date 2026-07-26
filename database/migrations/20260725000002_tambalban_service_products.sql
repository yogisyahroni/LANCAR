-- +goose Up
-- ============================================================
-- LANCAR — Tambal Ban & Towing: Service Products & Pricing
-- Migration: 20260725000002_tambalban_service_products.sql
-- ============================================================

-- Insert new delivery service products for tambal ban & towing
INSERT INTO delivery_service_products (
    code, name, description, service_family, service_category, route_model,
    base_fare_idr, per_km_idr, included_distance_km,
    uses_size_tier, max_distance_km, max_weight_kg,
    platform_fee_idr, platform_fee_pct, extra_dropoff_fee_idr,
    search_radii_km, is_enabled, display_order
) VALUES 
    -- Tambal Ban Motor
    ('tambal_ban_motor', 'Tambal Ban Motor', 
     'Perbaikan ban sepeda motor di lokasi customer', 
     'maintenance', 'tambal_ban', 'p2p',
     5000, 2000, 1.0,
     FALSE, 50.0, NULL,
     2500, 0.03, 0,
     '[5]', TRUE, 200),
    
    -- Tambal Ban Mobil
    ('tambal_ban_mobil', 'Tambal Ban Mobil', 
     'Perbaikan ban kendaraan roda empat di lokasi customer', 
     'maintenance', 'tambal_ban', 'p2p',
     10000, 3000, 1.0,
     FALSE, 50.0, NULL,
     2500, 0.03, 0,
     '[5]', TRUE, 201),
    
    -- Towing Motor
    ('towing_motor', 'Towing Motor', 
     'Derek sepeda motor ke lokasi tujuan (kendaraan kurir: pickup/van)', 
     'towing', 'towing', 'p2p',
     30000, 4000, 1.0,
     FALSE, 100.0, NULL,
     5000, 0.03, 0,
     '[10]', TRUE, 210),
    
    -- Towing Mobil
    ('towing_mobil', 'Towing Mobil', 
     'Derek kendaraan roda empat ke lokasi tujuan (kendaraan kurir: towing_truck)', 
     'towing', 'towing', 'p2p',
     75000, 6000, 1.0,
     FALSE, 100.0, NULL,
     5000, 0.03, 0,
     '[10]', TRUE, 211)
ON CONFLICT (code) DO NOTHING;

-- Insert pricing configs for new services
INSERT INTO system_configs (key, value, description, category, updated_at)
VALUES 
    ('base_fare_tambal_ban_motor', '5000', 'Base fare tambal ban motor (IDR)', 'pricing', NOW()),
    ('per_km_fee_tambal_ban_motor', '2000', 'Biaya per km tambal ban motor (IDR)', 'pricing', NOW()),
    ('base_fare_tambal_ban_mobil', '10000', 'Base fare tambal ban mobil (IDR)', 'pricing', NOW()),
    ('per_km_fee_tambal_ban_mobil', '3000', 'Biaya per km tambal ban mobil (IDR)', 'pricing', NOW()),
    ('base_fare_towing_motor', '30000', 'Base fare towing motor (IDR)', 'pricing', NOW()),
    ('per_km_fee_towing_motor', '4000', 'Biaya per km towing motor (IDR)', 'pricing', NOW()),
    ('base_fare_towing_mobil', '75000', 'Base fare towing mobil (IDR)', 'pricing', NOW()),
    ('per_km_fee_towing_mobil', '6000', 'Biaya per km towing mobil (IDR)', 'pricing', NOW()),
    ('toll_entry_fee_towing', '15000', 'Biaya masuk tol default untuk towing (IDR)', 'pricing', NOW()),
    ('min_courier_price_tambal_ban', '15000', 'Harga jasa minimum kurir tambal ban (IDR)', 'pricing', NOW()),
    ('max_courier_price_tambal_ban', '80000', 'Harga jasa maksimum kurir tambal ban (IDR)', 'pricing', NOW()),
    ('min_courier_price_towing', '25000', 'Harga jasa minimum kurir towing (IDR)', 'pricing', NOW()),
    ('max_courier_price_towing', '150000', 'Harga jasa maksimum kurir towing (IDR)', 'pricing', NOW())
ON CONFLICT (key) DO NOTHING;

-- +goose Down
DELETE FROM delivery_service_products WHERE code IN ('tambal_ban_motor', 'tambal_ban_mobil', 'towing_motor', 'towing_mobil');
DELETE FROM system_configs WHERE key IN (
    'base_fare_tambal_ban_motor', 'per_km_fee_tambal_ban_motor',
    'base_fare_tambal_ban_mobil', 'per_km_fee_tambal_ban_mobil',
    'base_fare_towing_motor', 'per_km_fee_towing_motor',
    'base_fare_towing_mobil', 'per_km_fee_towing_mobil',
    'toll_entry_fee_towing',
    'min_courier_price_tambal_ban', 'max_courier_price_tambal_ban',
    'min_courier_price_towing', 'max_courier_price_towing'
);
