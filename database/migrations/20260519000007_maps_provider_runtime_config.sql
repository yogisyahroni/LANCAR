-- +goose Up
-- ============================================================
-- Runtime Maps Provider Configuration
-- Allows admin to switch Google Maps / OpenStreetMap / disabled
-- without rebuilding customer or courier mobile apps.
-- ============================================================

INSERT INTO system_configs (key, value, description, category)
VALUES (
  'maps_provider_config',
  '{
    "enabled": true,
    "active_provider": "openstreetmap",
    "fallback_provider": "openstreetmap",
    "google_maps_enabled": false,
    "openstreetmap_enabled": true,
    "disabled_mode_enabled": true,
    "config_ttl_seconds": 300,
    "scopes": {
      "global": { "enabled": true, "provider": "openstreetmap" },
      "customer_mobile": { "enabled": true, "provider": "openstreetmap" },
      "courier_mobile": { "enabled": true, "provider": "openstreetmap" },
      "web_customer": { "enabled": true, "provider": "openstreetmap" }
    },
    "providers": {
      "google_maps": {
        "requires_server_key": true,
        "tiles_enabled": true,
        "routing_enabled": true,
        "geocoding_enabled": true
      },
      "openstreetmap": {
        "requires_server_key": false,
        "tile_url_template": "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        "attribution": "© OpenStreetMap contributors",
        "routing_enabled": true,
        "geocoding_enabled": true
      }
    }
  }'::jsonb,
  'Runtime maps provider policy for web, customer mobile, and courier mobile clients.',
  'maps'
)
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  updated_at = NOW();

-- +goose Down
DELETE FROM system_configs WHERE key = 'maps_provider_config';
