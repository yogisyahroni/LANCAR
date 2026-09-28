-- +goose Up
-- Tambal ban: tarif provider per lubang dan snapshot scope pekerjaan.
-- Tarif per lubang diisi petugas dari aplikasi driver; quote customer tetap
-- dihitung server-side dari tarif ini x jumlah lubang yang diminta customer.

ALTER TABLE courier_service_prices
  ADD COLUMN IF NOT EXISTS price_per_hole_idr BIGINT NOT NULL DEFAULT 0;

ALTER TABLE courier_service_prices
  DROP CONSTRAINT IF EXISTS courier_service_prices_price_per_hole_nonnegative,
  ADD CONSTRAINT courier_service_prices_price_per_hole_nonnegative
    CHECK (price_per_hole_idr >= 0);

-- Provider lama tetap dapat dipakai sampai petugas mengubah tarifnya.
UPDATE courier_service_prices
   SET price_per_hole_idr = price_amount,
       updated_at = NOW()
 WHERE service_code LIKE 'tambal_ban%'
   AND price_per_hole_idr = 0
   AND price_amount > 0;

ALTER TABLE tambal_ban_reports
  ADD COLUMN IF NOT EXISTS requested_hole_count INT,
  ADD COLUMN IF NOT EXISTS completed_hole_count INT,
  ADD COLUMN IF NOT EXISTS price_per_hole_idr BIGINT,
  ADD COLUMN IF NOT EXISTS service_total_idr BIGINT;

ALTER TABLE tambal_ban_reports
  DROP CONSTRAINT IF EXISTS tambal_ban_reports_hole_count_positive,
  ADD CONSTRAINT tambal_ban_reports_hole_count_positive
    CHECK (
      (requested_hole_count IS NULL OR requested_hole_count > 0)
      AND (completed_hole_count IS NULL OR completed_hole_count > 0)
      AND (price_per_hole_idr IS NULL OR price_per_hole_idr > 0)
      AND (service_total_idr IS NULL OR service_total_idr >= 0)
    ),
  DROP CONSTRAINT IF EXISTS tambal_ban_reports_hole_pricing_consistent,
  ADD CONSTRAINT tambal_ban_reports_hole_pricing_consistent
    CHECK (
      (completed_hole_count IS NULL AND price_per_hole_idr IS NULL AND service_total_idr IS NULL)
      OR (
        completed_hole_count IS NOT NULL
        AND price_per_hole_idr IS NOT NULL
        AND service_total_idr = completed_hole_count * price_per_hole_idr
      )
    );

-- Metadata customer-facing dikelola di DB/CMS, bukan hardcode di aplikasi.
UPDATE delivery_service_products
   SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
     'max_hole_count', 20,
     'customer_note', 'Permintaan mencakup jumlah lubang yang kamu input. Petugas mengerjakan sesuai jumlah tersebut. Jika ditemukan lubang tambahan, pembahasan dan pembayarannya dilakukan langsung dengan petugas di luar sistem TEMBUS.'
   ),
       updated_at = NOW()
 WHERE code LIKE 'tambal_ban%';

-- +goose Down
ALTER TABLE tambal_ban_reports
  DROP CONSTRAINT IF EXISTS tambal_ban_reports_hole_pricing_consistent,
  DROP CONSTRAINT IF EXISTS tambal_ban_reports_hole_count_positive,
  DROP COLUMN IF EXISTS service_total_idr,
  DROP COLUMN IF EXISTS price_per_hole_idr,
  DROP COLUMN IF EXISTS completed_hole_count,
  DROP COLUMN IF EXISTS requested_hole_count;

ALTER TABLE courier_service_prices
  DROP CONSTRAINT IF EXISTS courier_service_prices_price_per_hole_nonnegative,
  DROP COLUMN IF EXISTS price_per_hole_idr;
