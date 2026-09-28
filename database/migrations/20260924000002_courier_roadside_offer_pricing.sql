-- +goose Up
-- Provider-owned roadside offer pricing. These values are captured in the
-- courier app and become the immutable inputs for the customer quote after
-- the customer selects the provider.
ALTER TABLE courier_service_prices
  ADD COLUMN IF NOT EXISTS per_km_rate_idr BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS toll_entry_idr BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS toll_exit_idr BIGINT NOT NULL DEFAULT 0;

ALTER TABLE courier_service_prices
  DROP CONSTRAINT IF EXISTS courier_service_prices_per_km_nonnegative,
  ADD CONSTRAINT courier_service_prices_per_km_nonnegative CHECK (per_km_rate_idr >= 0),
  DROP CONSTRAINT IF EXISTS courier_service_prices_toll_entry_nonnegative,
  ADD CONSTRAINT courier_service_prices_toll_entry_nonnegative CHECK (toll_entry_idr >= 0),
  DROP CONSTRAINT IF EXISTS courier_service_prices_toll_exit_nonnegative,
  ADD CONSTRAINT courier_service_prices_toll_exit_nonnegative CHECK (toll_exit_idr >= 0);

-- Existing provider rows keep working. Seed their optional components from
-- the current service catalogue only when a provider has no value yet.
UPDATE courier_service_prices csp
   SET per_km_rate_idr = COALESCE(NULLIF(csp.per_km_rate_idr, 0), dsp.per_km_idr, 0),
       updated_at = NOW()
  FROM delivery_service_products dsp
 WHERE dsp.code = csp.service_code
   AND (csp.service_code LIKE 'tambal_ban%' OR csp.service_code LIKE 'towing%');

-- +goose Down
ALTER TABLE courier_service_prices
  DROP CONSTRAINT IF EXISTS courier_service_prices_per_km_nonnegative,
  DROP CONSTRAINT IF EXISTS courier_service_prices_toll_entry_nonnegative,
  DROP CONSTRAINT IF EXISTS courier_service_prices_toll_exit_nonnegative,
  DROP COLUMN IF EXISTS per_km_rate_idr,
  DROP COLUMN IF EXISTS toll_entry_idr,
  DROP COLUMN IF EXISTS toll_exit_idr;
