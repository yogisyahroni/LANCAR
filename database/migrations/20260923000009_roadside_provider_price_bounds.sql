-- +goose Up
-- Existing UAT rows were seeded with min=max so the quote fixtures were
-- deterministic. Provider pricing is now editable, therefore the bounds are
-- widened in the database while the current seeded price remains unchanged.
UPDATE courier_service_prices
   SET min_price = 10000,
       max_price = 500000,
       updated_at = NOW()
 WHERE service_code LIKE 'tambal_ban%'
    OR service_code LIKE 'towing%';

-- +goose Down
-- Keep provider-entered values intact on rollback; only restore the seeded
-- fixture bounds for the two UAT rows that were originally fixed.
UPDATE courier_service_prices
   SET min_price = price_amount,
       max_price = price_amount,
       updated_at = NOW()
 WHERE service_code LIKE 'tambal_ban%'
    OR service_code LIKE 'towing%';
