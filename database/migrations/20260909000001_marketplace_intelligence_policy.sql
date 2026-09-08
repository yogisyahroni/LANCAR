-- +goose Up
-- GLOB-2026-006: versioned deterministic dispatch policy. Values are
-- operator-tunable scalar config; the matching service remains safe when a
-- key is absent or malformed by using its compiled defaults.
INSERT INTO system_configs (key, value, description, category) VALUES
('marketplace_intelligence_model_version', '"marketplace-intelligence-2026-v1"', 'Dispatch model version recorded with each decision', 'marketplace_intelligence'),
('marketplace_intelligence_rule_version', '"dispatch-rules-2026-v1"', 'Deterministic dispatch rule version recorded with each decision', 'marketplace_intelligence'),
('marketplace_dispatch_eta_weight', '0.16', 'Dispatch ETA score weight', 'marketplace_intelligence'),
('marketplace_dispatch_distance_weight', '0.10', 'Dispatch distance score weight', 'marketplace_intelligence'),
('marketplace_dispatch_vehicle_weight', '0.09', 'Vehicle fit score weight', 'marketplace_intelligence'),
('marketplace_dispatch_capability_weight', '0.11', 'Capability fit score weight', 'marketplace_intelligence'),
('marketplace_dispatch_workload_weight', '0.10', 'Courier workload score weight', 'marketplace_intelligence'),
('marketplace_dispatch_acceptance_weight', '0.09', 'Acceptance probability score weight', 'marketplace_intelligence'),
('marketplace_dispatch_completion_weight', '0.09', 'Completion probability score weight', 'marketplace_intelligence'),
('marketplace_dispatch_marketplace_weight', '0.10', 'Marketplace constraint score weight', 'marketplace_intelligence'),
('marketplace_dispatch_reliability_weight', '0.06', 'Relay and rating reliability score weight', 'marketplace_intelligence'),
('marketplace_dispatch_food_weight', '0.10', 'Food readiness and batching score weight', 'marketplace_intelligence'),
('marketplace_dispatch_average_speed_kmph', '25', 'Deterministic courier travel speed fallback', 'marketplace_intelligence'),
('marketplace_dispatch_max_eta_minutes', '240', 'Maximum dispatch ETA accepted by policy', 'marketplace_intelligence'),
('marketplace_dispatch_max_distance_km', '20', 'Maximum dispatch distance accepted by policy', 'marketplace_intelligence'),
('marketplace_dispatch_max_food_wait_minutes', '10', 'Food courier waiting-risk normalization window', 'marketplace_intelligence'),
('marketplace_dispatch_max_batch_detour_minutes', '5', 'Maximum food batch detour used for compatibility scoring', 'marketplace_intelligence')
ON CONFLICT (key) DO NOTHING;

-- +goose Down
DELETE FROM system_configs
WHERE key IN (
  'marketplace_intelligence_model_version',
  'marketplace_intelligence_rule_version',
  'marketplace_dispatch_eta_weight',
  'marketplace_dispatch_distance_weight',
  'marketplace_dispatch_vehicle_weight',
  'marketplace_dispatch_capability_weight',
  'marketplace_dispatch_workload_weight',
  'marketplace_dispatch_acceptance_weight',
  'marketplace_dispatch_completion_weight',
  'marketplace_dispatch_marketplace_weight',
  'marketplace_dispatch_reliability_weight',
  'marketplace_dispatch_food_weight',
  'marketplace_dispatch_average_speed_kmph',
  'marketplace_dispatch_max_eta_minutes',
  'marketplace_dispatch_max_distance_km',
  'marketplace_dispatch_max_food_wait_minutes',
  'marketplace_dispatch_max_batch_detour_minutes'
);
