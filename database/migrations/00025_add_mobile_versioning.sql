-- +goose Up
-- ============================================================
-- Migration 00025: Mobile App Versioning Configurations
-- ============================================================

INSERT INTO system_configs (key, value, description, category) VALUES
('mobile_courier_version', '{"code": 1, "name": "1.0.0", "force": false}', 'Latest Courier App version info', 'mobile'),
('mobile_customer_version', '{"code": 1, "name": "1.0.0", "force": false}', 'Latest Customer App version info', 'mobile'),
('mobile_update_url', '"https://github.com/yogisyahroni/TEMBUS/releases"', 'URL to download latest APK', 'mobile')
ON CONFLICT (key) DO UPDATE SET 
    value = EXCLUDED.value,
    description = EXCLUDED.description,
    category = EXCLUDED.category;

-- +goose Down
DELETE FROM system_configs WHERE key IN ('mobile_courier_version', 'mobile_customer_version', 'mobile_update_url');
