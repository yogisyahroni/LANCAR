-- +goose Up
-- ROAD-2026-004: the platform catalogue is the only source for roadside
-- travel pricing. Courier rows keep the value for backwards compatibility,
-- while quote/settlement reads use delivery_service_products.

UPDATE courier_service_prices csp
   SET per_km_rate_idr = dsp.per_km_idr,
       updated_at = NOW()
  FROM delivery_service_products dsp
 WHERE dsp.code = csp.service_code
   AND csp.service_code LIKE 'tambal_ban%';

-- +goose Down
-- No destructive rollback: the courier column is legacy compatibility data;
-- the canonical source remains the service catalogue after rollback as well.
