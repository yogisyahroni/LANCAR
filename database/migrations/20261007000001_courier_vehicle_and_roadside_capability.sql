-- +goose Up
-- COURIER-2026-013: vehicle-scoped capabilities and roadside equipment onboarding.
-- The capability row remains the canonical source for service eligibility. The
-- mobile client only renders the effective result returned by the server.

ALTER TABLE courier_service_capabilities
  ADD COLUMN IF NOT EXISTS supports_tubeless BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS supports_tube BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS has_tire_repair_kit BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS has_electric_pump BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS material_inventory JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE courier_service_capabilities
  DROP CONSTRAINT IF EXISTS courier_service_capabilities_material_inventory_object,
  ADD CONSTRAINT courier_service_capabilities_material_inventory_object
    CHECK (jsonb_typeof(material_inventory) = 'object');

-- Keep the catalogue authoritative for vehicle-scoped on-demand services.
UPDATE delivery_service_products
   SET vehicle_types = ARRAY['car']::TEXT[], updated_at = NOW()
 WHERE code = 'tembus_mobil';

-- A courier's registered approved vehicle must match the product before a
-- capability can be used. Roadside/towing keep their existing specialised
-- matching rules; this gate is for ordinary on-demand product eligibility.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION courier_capability_vehicle_is_eligible(
  profile_id UUID,
  service_code_value TEXT
)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM courier_service_capabilities csc
      JOIN delivery_service_products dsp ON dsp.code = csc.service_code
      JOIN courier_vehicles cv
        ON cv.id = COALESCE(
          csc.vehicle_id,
          (
            SELECT primary_vehicle.id
              FROM courier_vehicles primary_vehicle
             WHERE primary_vehicle.courier_profile_id = csc.courier_profile_id
               AND primary_vehicle.is_primary = TRUE
             ORDER BY primary_vehicle.created_at DESC
             LIMIT 1
          )
        )
     WHERE csc.courier_profile_id = $1
       AND csc.service_code = $2
       AND cv.verification_status = 'approved'
       AND (
         dsp.service_category <> 'on_demand'
         OR COALESCE(array_length(dsp.vehicle_types, 1), 0) = 0
         OR lower(cv.vehicle_type) = ANY (ARRAY(SELECT lower(value) FROM unnest(dsp.vehicle_types) value))
         OR (lower(cv.vehicle_type) = 'motor' AND 'bike' = ANY (ARRAY(SELECT lower(value) FROM unnest(dsp.vehicle_types) value)))
         OR (lower(cv.vehicle_type) = 'car' AND 'mobil' = ANY (ARRAY(SELECT lower(value) FROM unnest(dsp.vehicle_types) value)))
       )
  );
$$;
-- +goose StatementEnd

-- Tambal Ban requires an explicit provider capability. Inventory keys use the
-- same codes as tambal_ban_materials so customer and provider flows share one
-- catalogue rather than maintaining a second hardcoded list.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION courier_service_equipment_is_eligible(
  profile_id UUID,
  service_code_value TEXT
)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
  SELECT CASE
    WHEN $2 NOT LIKE 'tambal_ban%' THEN TRUE
    ELSE EXISTS (
      SELECT 1
        FROM courier_service_capabilities csc
       WHERE csc.courier_profile_id = $1
         AND csc.service_code = $2
         AND csc.has_tire_repair_kit = TRUE
         AND csc.has_electric_pump = TRUE
         AND (csc.supports_tubeless OR csc.supports_tube)
         AND (
           NOT csc.supports_tubeless
           OR CASE
                WHEN (csc.material_inventory ->> (CASE WHEN csc.service_code = 'tambal_ban_motor' THEN 'tambal_tubeless' ELSE 'tambal_ban_mobil' END)) ~ '^[0-9]+$'
                THEN (csc.material_inventory ->> (CASE WHEN csc.service_code = 'tambal_ban_motor' THEN 'tambal_tubeless' ELSE 'tambal_ban_mobil' END))::INTEGER > 0
                ELSE FALSE
              END
         )
         AND (
           NOT csc.supports_tube
           OR CASE
                WHEN (csc.material_inventory ->> (CASE WHEN csc.service_code = 'tambal_ban_motor' THEN 'tambal_ban_dalam' ELSE 'tambal_ban_dalam_mobil' END)) ~ '^[0-9]+$'
                THEN (csc.material_inventory ->> (CASE WHEN csc.service_code = 'tambal_ban_motor' THEN 'tambal_ban_dalam' ELSE 'tambal_ban_dalam_mobil' END))::INTEGER > 0
                ELSE FALSE
              END
         )
    )
  END;
$$;
-- +goose StatementEnd

-- Provider-owned Tambal Ban pricing must be configured and active before the
-- capability can receive an offer.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION courier_service_pricing_is_ready(
  profile_id UUID,
  service_code_value TEXT
)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
  SELECT CASE
    WHEN $2 NOT LIKE 'tambal_ban%' THEN TRUE
    ELSE EXISTS (
      SELECT 1
        FROM courier_service_prices csp
       WHERE csp.courier_id = $1
         AND csp.service_code = $2
         AND csp.is_active = TRUE
         AND csp.price_amount BETWEEN csp.min_price AND csp.max_price
         AND csp.price_per_hole_idr > 0
    )
  END;
$$;
-- +goose StatementEnd

-- Extend the existing server-side capability gate. Every offer/dispatch query
-- already calls this function, so the same rule protects API and UI paths.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION courier_capability_is_eligible(
  profile_id UUID,
  service_code_value TEXT,
  market_code_value TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  resolved_market TEXT;
BEGIN
  SELECT COALESCE(NULLIF(market_code_value, ''), cp.market_code)
    INTO resolved_market
    FROM courier_profiles cp
   WHERE cp.id = profile_id;
  IF NOT FOUND THEN RETURN FALSE; END IF;

  RETURN courier_market_is_eligible(profile_id, resolved_market)
    AND courier_capability_vehicle_is_eligible(profile_id, service_code_value)
    AND courier_service_equipment_is_eligible(profile_id, service_code_value)
    AND courier_service_pricing_is_ready(profile_id, service_code_value)
    AND EXISTS (
      SELECT 1
        FROM courier_service_capabilities csc
       WHERE csc.courier_profile_id = profile_id
         AND csc.service_code = service_code_value
         AND csc.status = 'enabled'
         AND (csc.effective_from IS NULL OR csc.effective_from <= CURRENT_DATE)
         AND (csc.expires_at IS NULL OR csc.expires_at >= CURRENT_DATE)
         AND ('*' = ANY(csc.market_scope) OR resolved_market IS NULL OR resolved_market = ANY(csc.market_scope))
         AND courier_profile_documents_eligible_for_service(profile_id, service_code_value)
         AND NOT courier_enforcement_is_active(profile_id, resolved_market, service_code_value)
    );
END;
$$;
-- +goose StatementEnd

DROP VIEW IF EXISTS courier_capability_eligibility;
CREATE VIEW courier_capability_eligibility AS
SELECT
  csc.id,
  csc.courier_profile_id,
  csc.service_code,
  cp.market_code,
  csc.status,
  csc.certification_type,
  csc.certified_at,
  csc.effective_from,
  csc.expires_at,
  csc.market_scope,
  csc.suspension_reason,
  csc.eligibility_reason,
  CASE
    WHEN csc.status = 'enabled' AND NOT courier_capability_vehicle_is_eligible(cp.id, csc.service_code) THEN 'vehicle_ineligible'
    WHEN csc.status = 'enabled' AND csc.service_code LIKE 'tambal_ban%' AND NOT courier_service_equipment_is_eligible(cp.id, csc.service_code) THEN 'equipment_incomplete'
    WHEN csc.status = 'enabled' AND csc.service_code LIKE 'tambal_ban%' AND NOT courier_service_pricing_is_ready(cp.id, csc.service_code) THEN 'pricing_incomplete'
    WHEN csc.status = 'enabled' AND NOT courier_profile_documents_eligible_for_service(cp.id, csc.service_code) THEN 'documents_ineligible'
    WHEN csc.status = 'enabled' AND csc.effective_from IS NOT NULL AND csc.effective_from > CURRENT_DATE THEN 'not_yet_effective'
    WHEN csc.status = 'enabled' AND csc.expires_at IS NOT NULL AND csc.expires_at < CURRENT_DATE THEN 'expired'
    WHEN csc.status = 'enabled' AND '*' <> ALL(csc.market_scope) AND cp.market_code IS NOT NULL AND cp.market_code <> ALL(csc.market_scope) THEN 'market_unavailable'
    ELSE csc.status
  END AS effective_status,
  CASE
    WHEN csc.status = 'enabled' AND NOT courier_capability_vehicle_is_eligible(cp.id, csc.service_code) THEN 'Tidak sesuai dengan kendaraan terdaftar atau kendaraan belum disetujui'
    WHEN csc.status = 'enabled' AND csc.service_code LIKE 'tambal_ban%' AND NOT courier_service_equipment_is_eligible(cp.id, csc.service_code) THEN 'Lengkapi alat tambal, pompa angin elektrik, tipe ban, dan stok material'
    WHEN csc.status = 'enabled' AND csc.service_code LIKE 'tambal_ban%' AND NOT courier_service_pricing_is_ready(cp.id, csc.service_code) THEN 'Harga jasa per lubang belum aktif atau belum memenuhi batas admin'
    WHEN csc.status = 'pending_review' THEN 'Menunggu sertifikasi dan review admin'
    WHEN csc.status = 'disabled' THEN 'Capability dinonaktifkan untuk sementara'
    WHEN csc.status = 'rejected' THEN COALESCE(csc.eligibility_reason, 'Sertifikasi capability ditolak')
    WHEN csc.status = 'enabled' AND NOT courier_profile_documents_eligible_for_service(cp.id, csc.service_code) THEN 'Dokumen yang berlaku untuk capability ini tidak lagi memenuhi syarat'
    WHEN csc.status = 'enabled' AND csc.effective_from IS NOT NULL AND csc.effective_from > CURRENT_DATE THEN 'Sertifikasi belum memasuki masa berlaku'
    WHEN csc.status = 'enabled' AND csc.expires_at IS NOT NULL AND csc.expires_at < CURRENT_DATE THEN 'Sertifikasi capability sudah kedaluwarsa'
    WHEN csc.status = 'enabled' AND '*' <> ALL(csc.market_scope) AND cp.market_code IS NOT NULL AND cp.market_code <> ALL(csc.market_scope) THEN 'Capability belum tersedia di market courier saat ini'
    ELSE NULL
  END AS availability_reason,
  CASE
    WHEN csc.status = 'enabled' AND NOT courier_capability_vehicle_is_eligible(cp.id, csc.service_code) THEN 'Daftarkan kendaraan yang sesuai atau minta admin meninjau kendaraan utama'
    WHEN csc.status = 'enabled' AND csc.service_code LIKE 'tambal_ban%' AND NOT courier_service_equipment_is_eligible(cp.id, csc.service_code) THEN 'Ajukan Tambal Ban dengan checklist alat, tipe ban, stok material, dan bukti foto'
    WHEN csc.status = 'enabled' AND csc.service_code LIKE 'tambal_ban%' AND NOT courier_service_pricing_is_ready(cp.id, csc.service_code) THEN 'Isi harga jasa, lalu tunggu capability Tambal Ban disetujui admin'
    WHEN csc.status IN ('disabled', 'rejected') THEN 'Lengkapi data lalu ajukan review capability kembali'
    WHEN csc.status = 'pending_review' THEN 'Tunggu persetujuan admin setelah data dan bukti diverifikasi'
    WHEN csc.status = 'enabled' AND NOT courier_profile_documents_eligible_for_service(cp.id, csc.service_code) THEN 'Perbarui dokumen yang berlaku untuk capability ini sebelum mengaktifkannya kembali'
    ELSE NULL
  END AS remediation_path,
  csc.supports_tubeless,
  csc.supports_tube,
  csc.has_tire_repair_kit,
  csc.has_electric_pump,
  csc.material_inventory,
  courier_capability_is_eligible(cp.id, csc.service_code, cp.market_code) AS is_eligible
FROM courier_service_capabilities csc
JOIN courier_profiles cp ON cp.id = csc.courier_profile_id;

-- +goose Down
DROP VIEW IF EXISTS courier_capability_eligibility;
DROP FUNCTION IF EXISTS courier_capability_is_eligible(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS courier_service_pricing_is_ready(UUID, TEXT);
DROP FUNCTION IF EXISTS courier_service_equipment_is_eligible(UUID, TEXT);
DROP FUNCTION IF EXISTS courier_capability_vehicle_is_eligible(UUID, TEXT);
ALTER TABLE courier_service_capabilities
  DROP CONSTRAINT IF EXISTS courier_service_capabilities_material_inventory_object,
  DROP COLUMN IF EXISTS material_inventory,
  DROP COLUMN IF EXISTS has_electric_pump,
  DROP COLUMN IF EXISTS has_tire_repair_kit,
  DROP COLUMN IF EXISTS supports_tube,
  DROP COLUMN IF EXISTS supports_tubeless;
