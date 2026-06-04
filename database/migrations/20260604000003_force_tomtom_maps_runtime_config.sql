-- +goose Up
-- ============================================================
-- Force TomTom Maps Runtime Config
-- Cleans environments where an older maps_provider_config row still
-- returns the removed google_maps provider to mobile clients.
-- ============================================================

INSERT INTO system_configs (key, value, description, category)
VALUES (
  'maps_provider_config',
  '{
    "enabled": true,
    "active_provider": "tomtom_maps",
    "fallback_provider": "openstreetmap",
    "tomtom_maps_enabled": true,
    "openstreetmap_enabled": true,
    "disabled_mode_enabled": true,
    "config_ttl_seconds": 300,
    "scopes": {
      "global": { "enabled": true, "provider": "tomtom_maps" },
      "customer_mobile": { "enabled": true, "provider": "tomtom_maps" },
      "courier_mobile": { "enabled": true, "provider": "tomtom_maps" },
      "web_customer": { "enabled": true, "provider": "tomtom_maps" },
      "tracking": { "enabled": true, "provider": "tomtom_maps" }
    },
    "providers": {
      "tomtom_maps": {
        "requires_server_key": true,
        "tiles_enabled": true,
        "routing_enabled": true,
        "geocoding_enabled": true,
        "traffic_enabled": true,
        "web_sdk_enabled": true,
        "mobile_sdk_enabled": true,
        "navigation_enabled": true
      },
      "openstreetmap": {
        "requires_server_key": false,
        "tile_url_template": "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        "attribution": "(c) OpenStreetMap contributors",
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

UPDATE maps_provider_credentials
   SET is_active = false,
       deactivated_at = COALESCE(deactivated_at, NOW()),
       deleted_at = COALESCE(deleted_at, NOW()),
       updated_at = NOW(),
       metadata = COALESCE(metadata, '{}'::jsonb) || '{"retired_reason":"google_maps_provider_removed"}'::jsonb
 WHERE provider = 'google_maps';

-- +goose Down
-- Keep rollback safe by leaving TomTom/OpenStreetMap runtime in place.
-- Reintroducing google_maps is intentionally unsupported after migration.
UPDATE system_configs
   SET value = jsonb_set(value, '{fallback_provider}', '"openstreetmap"'::jsonb, true),
       updated_at = NOW()
 WHERE key = 'maps_provider_config';
