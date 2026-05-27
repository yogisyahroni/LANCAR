-- Seed Data for TEMBUS Platform (Jakarta Area)

-- 1. Zones (Jakarta Regions)
INSERT INTO zones (name, code, polygon, center) VALUES
('Jakarta Pusat', 'JKT-PST', 
 ST_GeogFromText('POLYGON((106.80 <ctrl63>database/seed/seed.sql
<ctrl60>-- Seed Data for TEMBUS Platform (Jakarta Area)

-- 1. Zones (Jakarta Regions)
INSERT INTO zones (name, code, polygon, center) VALUES
('Jakarta Pusat', 'JKT-PST', 
 ST_GeogFromText('POLYGON((106.80 -6.15, 106.85 -6.15, 106.85 -6.20, 106.80 -6.20, 106.80 -6.15))'),
 ST_GeogFromText('POINT(106.82 -6.17)')),
('Jakarta Selatan', 'JKT-SEL', 
 ST_GeogFromText('POLYGON((106.78 -6.22, 106.85 -6.22, 106.85 -6.30, 106.78 -6.30, 106.78 -6.22))'),
 ST_GeogFromText('POINT(106.81 -6.26)'));

-- 2. Meeting Points (Strategic Relay Points)
INSERT INTO meeting_points (name, address, location, zone_id, is_active) VALUES
('Hub Sudirman', 'Jl. Jend. Sudirman Kav 1, Jakarta Pusat', ST_GeogFromText('POINT(106.8227 -6.2023)'), 
 (SELECT id FROM zones WHERE code = 'JKT-PST'), TRUE),
('Hub Blok M', 'Jl. Melawai Raya, Jakarta Selatan', ST_GeogFromText('POINT(106.8015 -6.2444)'), 
 (SELECT id FROM zones WHERE code = 'JKT-SEL'), TRUE);

-- 3. Pricing Configs
INSERT INTO pricing_configs (model, base_fee, per_km_fee, min_distance_km, max_distance_km) VALUES
('p2p', 12000, 2500, 0, 15),
('two_legs', 18000, 2000, 10, 25),
('three_legs', 25000, 1800, 20, 50);

-- 4. Initial Feature Flags
INSERT INTO feature_flags (key, name, description, is_enabled, category) VALUES
('model_p2p', 'Point-to-Point Model', 'Standard single courier delivery', TRUE, 'model'),
('model_two_legs', 'Two-Legs Relay Model', 'Delivery with 1 meeting point', TRUE, 'model'),
('model_three_legs', 'Three-Legs Relay Model', 'Delivery with 2 meeting points (High Distance)', FALSE, 'model'),
('dynamic_pricing_weather', 'Weather-based Surge', 'Increase price during rain', TRUE, 'pricing'),
('dynamic_pricing_demand', 'Demand-based Surge', 'Increase price when low courier density', TRUE, 'pricing');

-- 5. Default Super Admin (For testing logic)
INSERT INTO users (phone_number, full_name, role, status) VALUES
('+628123456789', 'Master Administrator', 'super_admin', 'active');
