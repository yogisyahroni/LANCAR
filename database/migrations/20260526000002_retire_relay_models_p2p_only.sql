-- +goose Up
-- Retire 2-Kaki/3-Kaki as active production models while preserving historical rows.

UPDATE feature_flags
SET is_enabled = TRUE,
    config = COALESCE(config, '{}'::jsonb) || jsonb_build_object('rollout_pct', 100),
    updated_at = NOW()
WHERE key = 'model_p2p';

UPDATE feature_flags
SET is_enabled = FALSE,
    require_checklist = TRUE,
    config = COALESCE(config, '{}'::jsonb) || jsonb_build_object(
      'rollout_pct', 0,
      'retired', TRUE,
      'retired_reason', 'TEMBUS now accepts only P2P as the active delivery model.'
    ),
    updated_at = NOW()
WHERE key IN ('model_two_legs', 'model_three_legs', 'three_legs_relay');

UPDATE pricing_configs
SET is_active = FALSE,
    updated_at = NOW()
WHERE model IN ('two_legs', 'three_legs');

UPDATE pricing_configs
SET is_active = TRUE,
    updated_at = NOW()
WHERE model = 'p2p';

UPDATE delivery_service_products
SET route_model = 'p2p',
    service_category = CASE
      WHEN service_category = 'on_demand' THEN 'on_demand'
      ELSE 'regular'
    END,
    availability_rules = COALESCE(availability_rules, '{}'::jsonb) || jsonb_build_object(
      'delivery_model', 'p2p_only',
      'retired_relay_models', jsonb_build_array('two_legs', 'three_legs', 'hub_and_spoke')
    ),
    updated_at = NOW()
WHERE route_model <> 'p2p'
   OR service_category NOT IN ('on_demand', 'regular');

ALTER TABLE delivery_service_products
  DROP CONSTRAINT IF EXISTS delivery_service_products_route_model_check,
  ADD CONSTRAINT delivery_service_products_route_model_check
    CHECK (route_model = 'p2p');

UPDATE courier_profiles
SET application_channel = 'regular',
    updated_at = NOW()
WHERE application_channel IN ('pickup_only', 'delivery_only');

UPDATE courier_registration_links
SET application_channel = 'regular',
    title = regexp_replace(title, '(Pickup Only|Delivery Only|non on-demand)', 'Regular', 'gi'),
    updated_at = NOW()
WHERE application_channel IN ('pickup_only', 'delivery_only');

ALTER TABLE courier_registration_links
  DROP CONSTRAINT IF EXISTS courier_registration_links_application_channel_check,
  ADD CONSTRAINT courier_registration_links_application_channel_check
    CHECK (application_channel IN ('on_demand', 'regular'));

UPDATE courier_service_capabilities
SET application_channel = 'regular',
    updated_at = NOW()
WHERE application_channel IN ('pickup_only', 'delivery_only');

ALTER TABLE courier_service_capabilities
  DROP CONSTRAINT IF EXISTS courier_service_capabilities_application_channel_check,
  ADD CONSTRAINT courier_service_capabilities_application_channel_check
    CHECK (application_channel IN ('on_demand', 'regular'));

-- Rebuild regular courier capabilities so one regular courier can cover pickup and delivery products.
INSERT INTO courier_service_capabilities (
  courier_profile_id,
  vehicle_id,
  service_code,
  application_channel,
  status,
  eligibility_reason,
  max_weight_kg,
  approved_at,
  updated_at
)
SELECT
  cp.id,
  cv.id,
  dsp.code,
  cp.application_channel,
  CASE WHEN cp.is_verified = TRUE THEN 'enabled' ELSE 'pending_review' END,
  CASE
    WHEN cp.application_channel = 'on_demand' THEN 'Eligible for on-demand P2P product based on active vehicle profile.'
    ELSE 'Eligible for regular P2P pickup and delivery product based on active vehicle profile.'
  END,
  COALESCE(dsp.max_weight_kg, cv.max_weight_kg),
  CASE WHEN cp.is_verified = TRUE THEN COALESCE(cp.reviewed_at, NOW()) ELSE NULL END,
  NOW()
FROM courier_profiles cp
JOIN courier_vehicles cv ON cv.courier_profile_id = cp.id AND cv.is_primary = TRUE
JOIN delivery_service_products dsp ON dsp.is_enabled = TRUE
WHERE dsp.route_model = 'p2p'
  AND (
    (cp.application_channel = 'on_demand' AND dsp.service_category = 'on_demand')
    OR (cp.application_channel = 'regular' AND dsp.service_category = 'regular')
  )
ON CONFLICT (courier_profile_id, service_code) DO UPDATE SET
  vehicle_id = EXCLUDED.vehicle_id,
  application_channel = EXCLUDED.application_channel,
  eligibility_reason = EXCLUDED.eligibility_reason,
  max_weight_kg = EXCLUDED.max_weight_kg,
  updated_at = NOW();

INSERT INTO status_transition_policies (
  workflow_role,
  from_status,
  to_status,
  label,
  description,
  requires_proof,
  requires_admin,
  display_order
) VALUES
  ('regular', 'pending', 'assigned', 'Assignment regular', 'Order regular P2P ditugaskan ke kurir.', FALSE, FALSE, 10),
  ('regular', 'assigned', 'picked_up', 'Pickup selesai', 'Barang berhasil diambil dari pengirim.', TRUE, FALSE, 20),
  ('regular', 'picked_up', 'in_transit', 'Mulai pengantaran', 'Barang mulai diantar ke penerima.', FALSE, FALSE, 30),
  ('regular', 'in_transit', 'delivered', 'Pengiriman selesai', 'Delivery regular wajib diselesaikan lewat bukti POD.', TRUE, FALSE, 40),
  ('regular', 'assigned', 'failed', 'Laporkan gagal pickup', 'Pickup regular gagal dilakukan.', FALSE, FALSE, 90),
  ('regular', 'in_transit', 'failed', 'Laporkan gagal antar', 'Pengiriman regular gagal saat perjalanan.', FALSE, FALSE, 100)
ON CONFLICT (workflow_role, from_status, to_status) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  requires_proof = EXCLUDED.requires_proof,
  requires_admin = EXCLUDED.requires_admin,
  is_active = TRUE,
  display_order = EXCLUDED.display_order,
  version = status_transition_policies.version + 1,
  updated_at = NOW();

-- +goose Down
ALTER TABLE courier_service_capabilities
  DROP CONSTRAINT IF EXISTS courier_service_capabilities_application_channel_check;

UPDATE courier_service_capabilities
SET application_channel = 'pickup_only',
    updated_at = NOW()
WHERE application_channel = 'regular';

ALTER TABLE courier_service_capabilities
  ADD CONSTRAINT courier_service_capabilities_application_channel_check
    CHECK (application_channel IN ('on_demand', 'pickup_only', 'delivery_only'));

ALTER TABLE courier_registration_links
  DROP CONSTRAINT IF EXISTS courier_registration_links_application_channel_check;

UPDATE courier_registration_links
SET application_channel = 'pickup_only',
    updated_at = NOW()
WHERE application_channel = 'regular';

ALTER TABLE courier_registration_links
  ADD CONSTRAINT courier_registration_links_application_channel_check
    CHECK (application_channel IN ('on_demand', 'pickup_only', 'delivery_only'));

UPDATE courier_profiles
SET application_channel = 'pickup_only',
    updated_at = NOW()
WHERE application_channel = 'regular';

DELETE FROM status_transition_policies
WHERE workflow_role = 'regular';

ALTER TABLE delivery_service_products
  DROP CONSTRAINT IF EXISTS delivery_service_products_route_model_check,
  ADD CONSTRAINT delivery_service_products_route_model_check
    CHECK (route_model IN ('p2p', 'two_legs', 'three_legs', 'hub_and_spoke'));

UPDATE pricing_configs
SET is_active = TRUE,
    updated_at = NOW()
WHERE model IN ('two_legs', 'three_legs');

UPDATE feature_flags
SET config = COALESCE(config, '{}'::jsonb) - 'retired' - 'retired_reason',
    updated_at = NOW()
WHERE key IN ('model_two_legs', 'model_three_legs', 'three_legs_relay');
