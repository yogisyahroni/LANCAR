-- +goose Up
-- FOOD-2026-005: persist server ETA prediction and lifecycle milestones so
-- predicted-vs-actual performance can be measured without client timestamps.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS food_eta_predicted_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS food_eta_actual_ready_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_orders_food_eta_measurement
  ON orders (service_sub_type, food_eta_predicted_at)
  WHERE service_sub_type = 'food_delivery'
    AND food_eta_predicted_at IS NOT NULL;

CREATE OR REPLACE VIEW food_eta_measurements AS
SELECT
  id AS order_id,
  order_number,
  merchant_id,
  food_eta_predicted_at,
  food_eta_actual_ready_at,
  picked_up_at AS food_eta_actual_pickup_at,
  delivered_at AS food_eta_actual_delivered_at,
  CASE
    WHEN food_eta_predicted_at IS NOT NULL AND delivered_at IS NOT NULL
    THEN ROUND(EXTRACT(EPOCH FROM (delivered_at - food_eta_predicted_at)) / 60.0)::INT
    ELSE NULL
  END AS delivery_delta_minutes,
  CASE
    WHEN food_eta_predicted_at IS NOT NULL AND food_eta_actual_ready_at IS NOT NULL
    THEN ROUND(EXTRACT(EPOCH FROM (food_eta_actual_ready_at - food_eta_predicted_at)) / 60.0)::INT
    ELSE NULL
  END AS readiness_delta_minutes,
  created_at,
  updated_at
FROM orders
WHERE service_sub_type = 'food_delivery'
  AND food_eta_predicted_at IS NOT NULL;

-- +goose Down
DROP VIEW IF EXISTS food_eta_measurements;
DROP INDEX IF EXISTS idx_orders_food_eta_measurement;
ALTER TABLE orders
  DROP COLUMN IF EXISTS food_eta_actual_ready_at,
  DROP COLUMN IF EXISTS food_eta_predicted_at;
