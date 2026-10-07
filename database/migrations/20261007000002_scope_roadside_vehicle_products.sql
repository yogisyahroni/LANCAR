-- +goose Up
-- COURIER-2026-013: keep roadside products vehicle-scoped as well as on-demand.
-- A motor courier must never receive a mobil roadside capability, and vice versa.

UPDATE delivery_service_products
   SET vehicle_types = CASE code
         WHEN 'tambal_ban_motor' THEN ARRAY['motor']::TEXT[]
         WHEN 'tambal_ban_mobil' THEN ARRAY['car']::TEXT[]
         WHEN 'towing_motor' THEN ARRAY['motor']::TEXT[]
         WHEN 'towing_mobil' THEN ARRAY['car']::TEXT[]
       END,
       updated_at = NOW()
 WHERE code IN ('tambal_ban_motor', 'tambal_ban_mobil', 'towing_motor', 'towing_mobil');

-- The eligibility function is also used by broadcast/match paths that do not
-- repeat the controller-level vehicle predicate. Keep the server-side gate
-- authoritative for all vehicle-bound operational services.
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
         dsp.service_category NOT IN ('on_demand', 'tambal_ban', 'towing')
         OR COALESCE(array_length(dsp.vehicle_types, 1), 0) = 0
         OR lower(cv.vehicle_type) = ANY (ARRAY(SELECT lower(value) FROM unnest(dsp.vehicle_types) value))
         OR (lower(cv.vehicle_type) = 'motor' AND 'bike' = ANY (ARRAY(SELECT lower(value) FROM unnest(dsp.vehicle_types) value)))
         OR (lower(cv.vehicle_type) = 'car' AND 'mobil' = ANY (ARRAY(SELECT lower(value) FROM unnest(dsp.vehicle_types) value)))
       )
  );
$$;
-- +goose StatementEnd

-- +goose Down
UPDATE delivery_service_products
   SET vehicle_types = ARRAY['motor']::TEXT[], updated_at = NOW()
 WHERE code IN ('tambal_ban_motor', 'tambal_ban_mobil', 'towing_motor', 'towing_mobil');

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
