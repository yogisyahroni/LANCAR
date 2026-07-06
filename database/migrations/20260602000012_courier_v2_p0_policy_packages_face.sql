-- +goose Up
-- +goose StatementBegin
ALTER TABLE delivery_service_products
  ADD COLUMN IF NOT EXISTS max_packages_per_order INT NOT NULL DEFAULT 1 CHECK (max_packages_per_order BETWEEN 1 AND 100),
  ADD COLUMN IF NOT EXISTS max_active_orders_regular INT NOT NULL DEFAULT 3 CHECK (max_active_orders_regular BETWEEN 1 AND 50),
  ADD COLUMN IF NOT EXISTS max_active_orders_on_demand INT NOT NULL DEFAULT 1 CHECK (max_active_orders_on_demand BETWEEN 1 AND 20),
  ADD COLUMN IF NOT EXISTS same_customer_batching_required BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS allow_new_offer_while_pickup BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS allow_new_offer_while_delivery BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS max_pickup_detour_km NUMERIC(8,2) NOT NULL DEFAULT 1 CHECK (max_pickup_detour_km >= 0),
  ADD COLUMN IF NOT EXISTS max_delivery_detour_km NUMERIC(8,2) NOT NULL DEFAULT 2 CHECK (max_delivery_detour_km >= 0),
  ADD COLUMN IF NOT EXISTS max_direction_deviation_degrees INT NOT NULL DEFAULT 45 CHECK (max_direction_deviation_degrees BETWEEN 0 AND 180),
  ADD COLUMN IF NOT EXISTS assignment_radius_pickup_km NUMERIC(8,2) NOT NULL DEFAULT 2 CHECK (assignment_radius_pickup_km >= 0),
  ADD COLUMN IF NOT EXISTS assignment_radius_delivery_km NUMERIC(8,2) NOT NULL DEFAULT 3 CHECK (assignment_radius_delivery_km >= 0),
  ADD COLUMN IF NOT EXISTS traffic_aware_assignment BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS proof_geofence_radius_m INT NOT NULL DEFAULT 10 CHECK (proof_geofence_radius_m BETWEEN 1 AND 100),
  ADD COLUMN IF NOT EXISTS proof_min_accuracy_m INT NOT NULL DEFAULT 50 CHECK (proof_min_accuracy_m BETWEEN 1 AND 500),
  ADD COLUMN IF NOT EXISTS proof_gps_override_policy JSONB NOT NULL DEFAULT '{"enabled":true,"soft_radius_m":25,"max_accuracy_m":100,"requires_reason":true,"manual_review_required":true}'::jsonb,
  ADD COLUMN IF NOT EXISTS face_verification_required BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS regular_max_reschedule_attempts INT NOT NULL DEFAULT 3 CHECK (regular_max_reschedule_attempts BETWEEN 0 AND 10),
  ADD COLUMN IF NOT EXISTS failed_delivery_policy VARCHAR(40) NOT NULL DEFAULT 'must_deliver'
    CHECK (failed_delivery_policy IN ('must_deliver', 'reschedule_then_return', 'admin_review')),
  ADD COLUMN IF NOT EXISTS pod_label VARCHAR(20) NOT NULL DEFAULT 'POD';

UPDATE delivery_service_products
SET
  max_packages_per_order = CASE
    WHEN batching_allowed THEN GREATEST(max_packages_per_order, 2)
    ELSE max_packages_per_order
  END,
  max_active_orders_regular = CASE
    WHEN service_category = 'regular' THEN GREATEST(max_active_orders_regular, 3)
    ELSE max_active_orders_regular
  END,
  max_active_orders_on_demand = CASE
    WHEN service_category = 'on_demand' AND batching_allowed THEN GREATEST(max_active_orders_on_demand, 2)
    ELSE max_active_orders_on_demand
  END,
  allow_new_offer_while_pickup = CASE
    WHEN service_category = 'on_demand' AND batching_allowed THEN TRUE
    ELSE allow_new_offer_while_pickup
  END,
  allow_new_offer_while_delivery = CASE
    WHEN service_category = 'on_demand' AND batching_allowed THEN TRUE
    ELSE allow_new_offer_while_delivery
  END,
  failed_delivery_policy = CASE
    WHEN service_category = 'regular' THEN 'reschedule_then_return'
    ELSE 'must_deliver'
  END,
  pod_label = 'POD'
WHERE TRUE;

CREATE TABLE IF NOT EXISTS order_packages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  package_index INT NOT NULL CHECK (package_index >= 1),
  package_code VARCHAR(100) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  size_tier VARCHAR(50),
  weight_kg NUMERIC(8,2) NOT NULL DEFAULT 0 CHECK (weight_kg >= 0),
  length_cm NUMERIC(8,2),
  width_cm NUMERIC(8,2),
  height_cm NUMERIC(8,2),
  declared_value_idr INT NOT NULL DEFAULT 0 CHECK (declared_value_idr >= 0),
  status VARCHAR(40) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'pickup_scanned', 'pickup_verified', 'in_transit', 'pod_verified', 'delivered', 'issue_reported', 'returned')),
  pickup_scan_verified_at TIMESTAMPTZ,
  pickup_photo_verified_at TIMESTAMPTZ,
  delivery_pod_verified_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT order_packages_order_index_unique UNIQUE (order_id, package_index),
  CONSTRAINT order_packages_order_code_unique UNIQUE (order_id, package_code)
);

CREATE INDEX IF NOT EXISTS idx_order_packages_order_status
  ON order_packages(order_id, status, package_index);

ALTER TABLE package_scans
  ADD COLUMN IF NOT EXISTS package_id UUID REFERENCES order_packages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS face_verification_id UUID;

CREATE INDEX IF NOT EXISTS idx_package_scans_package_id
  ON package_scans(package_id);

CREATE TABLE IF NOT EXISTS courier_face_enrollments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  courier_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(40) NOT NULL DEFAULT 'pending_review'
    CHECK (status IN ('pending_review', 'enrolled', 'verified', 'rejected', 'revoked')),
  provider VARCHAR(80) NOT NULL DEFAULT 'manual_review',
  provider_reference TEXT,
  liveness_score NUMERIC(5,4),
  image_url TEXT NOT NULL,
  image_checksum_sha256 VARCHAR(64) NOT NULL,
  challenge_code_hash VARCHAR(64),
  consent_accepted BOOLEAN NOT NULL DEFAULT TRUE,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_courier_face_enrollments_active
  ON courier_face_enrollments(courier_id, status, created_at DESC)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS courier_face_verifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  courier_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  verification_type VARCHAR(40) NOT NULL
    CHECK (verification_type IN ('registration', 'pickup', 'delivery')),
  status VARCHAR(40) NOT NULL
    CHECK (status IN ('verified', 'rejected', 'provider_required', 'pending_review')),
  provider VARCHAR(80) NOT NULL DEFAULT 'manual_review',
  provider_reference TEXT,
  liveness_score NUMERIC(5,4),
  image_url TEXT,
  image_checksum_sha256 VARCHAR(64),
  challenge_code_hash VARCHAR(64),
  failure_reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_courier_face_verifications_order
  ON courier_face_verifications(order_id, courier_id, verification_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_courier_face_verifications_courier
  ON courier_face_verifications(courier_id, status, created_at DESC);

ALTER TABLE courier_profiles
  ADD COLUMN IF NOT EXISTS face_enrolled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS face_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS face_liveness_score NUMERIC(5,4);

ALTER TABLE courier_documents
  DROP CONSTRAINT IF EXISTS courier_documents_doc_type_check;

ALTER TABLE courier_documents
  ADD CONSTRAINT courier_documents_doc_type_check
    CHECK (doc_type IN ('ktp','sim','stnk','skpd','selfie','skck','vehicle_photo','bank_account','face_enrollment'));

ALTER TABLE courier_proof_attempts
  ADD COLUMN IF NOT EXISTS service_code VARCHAR(50),
  ADD COLUMN IF NOT EXISTS face_verification_id UUID REFERENCES courier_face_verifications(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS override_reason TEXT,
  ADD COLUMN IF NOT EXISTS manual_review_required BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS policy_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_courier_proof_attempts_face
  ON courier_proof_attempts(face_verification_id)
  WHERE face_verification_id IS NOT NULL;

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
  ('regular', 'assigned', 'delivery_rescheduled', 'Reschedule pengiriman', 'Delivery regular gagal dan dijadwalkan ulang sesuai batas service.', FALSE, FALSE, 91),
  ('regular', 'in_transit', 'delivery_rescheduled', 'Reschedule pengiriman', 'Delivery regular gagal saat perjalanan dan dijadwalkan ulang sesuai batas service.', FALSE, FALSE, 101),
  ('regular', 'delivery_rescheduled', 'delivery_rescheduled', 'Reschedule pengiriman', 'Delivery regular kembali gagal dan tetap dijadwalkan ulang sesuai batas service.', FALSE, FALSE, 111),
  ('regular', 'assigned', 'return_required', 'Return required', 'Delivery regular melewati batas gagal dan wajib return.', FALSE, FALSE, 92),
  ('regular', 'in_transit', 'return_required', 'Return required', 'Delivery regular melewati batas gagal dan wajib return.', FALSE, FALSE, 102),
  ('regular', 'delivery_rescheduled', 'return_required', 'Return required', 'Delivery regular melewati batas gagal dan wajib return.', FALSE, FALSE, 112)
ON CONFLICT (workflow_role, from_status, to_status) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  requires_proof = EXCLUDED.requires_proof,
  requires_admin = EXCLUDED.requires_admin,
  is_active = TRUE,
  display_order = EXCLUDED.display_order,
  version = status_transition_policies.version + 1,
  updated_at = NOW();
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DELETE FROM status_transition_policies
WHERE workflow_role = 'regular'
  AND to_status IN ('delivery_rescheduled', 'return_required');

DROP INDEX IF EXISTS idx_courier_proof_attempts_face;

ALTER TABLE courier_proof_attempts
  DROP COLUMN IF EXISTS policy_snapshot,
  DROP COLUMN IF EXISTS manual_review_required,
  DROP COLUMN IF EXISTS override_reason,
  DROP COLUMN IF EXISTS face_verification_id,
  DROP COLUMN IF EXISTS service_code;

ALTER TABLE courier_documents
  DROP CONSTRAINT IF EXISTS courier_documents_doc_type_check,
  ADD CONSTRAINT courier_documents_doc_type_check
    CHECK (doc_type IN ('ktp','sim','stnk','skpd','selfie','skck','vehicle_photo','bank_account'));

ALTER TABLE courier_profiles
  DROP COLUMN IF EXISTS face_liveness_score,
  DROP COLUMN IF EXISTS face_verified_at,
  DROP COLUMN IF EXISTS face_enrolled;

DROP INDEX IF EXISTS idx_courier_face_verifications_courier;
DROP INDEX IF EXISTS idx_courier_face_verifications_order;
DROP TABLE IF EXISTS courier_face_verifications;

DROP INDEX IF EXISTS idx_courier_face_enrollments_active;
DROP TABLE IF EXISTS courier_face_enrollments;

DROP INDEX IF EXISTS idx_package_scans_package_id;
ALTER TABLE package_scans
  DROP COLUMN IF EXISTS face_verification_id,
  DROP COLUMN IF EXISTS package_id;

DROP INDEX IF EXISTS idx_order_packages_order_status;
DROP TABLE IF EXISTS order_packages;

ALTER TABLE delivery_service_products
  DROP COLUMN IF EXISTS pod_label,
  DROP COLUMN IF EXISTS failed_delivery_policy,
  DROP COLUMN IF EXISTS regular_max_reschedule_attempts,
  DROP COLUMN IF EXISTS face_verification_required,
  DROP COLUMN IF EXISTS proof_gps_override_policy,
  DROP COLUMN IF EXISTS proof_min_accuracy_m,
  DROP COLUMN IF EXISTS proof_geofence_radius_m,
  DROP COLUMN IF EXISTS traffic_aware_assignment,
  DROP COLUMN IF EXISTS assignment_radius_delivery_km,
  DROP COLUMN IF EXISTS assignment_radius_pickup_km,
  DROP COLUMN IF EXISTS max_direction_deviation_degrees,
  DROP COLUMN IF EXISTS max_delivery_detour_km,
  DROP COLUMN IF EXISTS max_pickup_detour_km,
  DROP COLUMN IF EXISTS allow_new_offer_while_delivery,
  DROP COLUMN IF EXISTS allow_new_offer_while_pickup,
  DROP COLUMN IF EXISTS same_customer_batching_required,
  DROP COLUMN IF EXISTS max_active_orders_on_demand,
  DROP COLUMN IF EXISTS max_active_orders_regular,
  DROP COLUMN IF EXISTS max_packages_per_order;
-- +goose StatementEnd
