-- +goose Up
INSERT INTO system_configs (key, value, category, description)
VALUES ('sla_config', '{
    "P2P": [
      { "stage": "Pickup Window", "target": "10m", "critical": "15m" },
      { "stage": "Direct Delivery", "target": "30m", "critical": "45m" }
    ],
    "2-Leg": [
      { "stage": "Pickup Window", "target": "12m", "critical": "20m" },
      { "stage": "Leg 1 (Origin to Relay)", "target": "35m", "critical": "50m" },
      { "stage": "Final Delivery", "target": "25m", "critical": "40m" }
    ],
    "3-Leg": [
      { "stage": "Pickup Window", "target": "15m", "critical": "25m" },
      { "stage": "Leg 1 (Origin to Relay)", "target": "45m", "critical": "60m" },
      { "stage": "Relay Processing", "target": "10m", "critical": "20m" },
      { "stage": "Final Leg Delivery", "target": "30m", "critical": "45m" }
    ]
}', 'logistics', 'System-wide SLA thresholds')
ON CONFLICT (key) DO NOTHING;

-- +goose Down
DELETE FROM system_configs WHERE key = 'sla_config';
