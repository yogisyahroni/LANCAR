-- ADS-2026-007/009/017: preserve click-time attribution context and enforce
-- one charged conversion per order under the default last-touch model.

-- +goose Up

ALTER TABLE ads_billing_events
  ADD COLUMN IF NOT EXISTS attribution_window_minutes INTEGER NOT NULL DEFAULT 10080;

ALTER TABLE ads_billing_events
  DROP CONSTRAINT IF EXISTS ads_billing_events_attribution_window_ck;

ALTER TABLE ads_billing_events
  ADD CONSTRAINT ads_billing_events_attribution_window_ck
  CHECK (attribution_window_minutes BETWEEN 1 AND 43200);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ads_conversion_order
  ON ads_billing_events(order_id)
  WHERE order_id IS NOT NULL AND event_type = 'conversion' AND status = 'charged';

-- +goose Down

DROP INDEX IF EXISTS uq_ads_conversion_order;
ALTER TABLE ads_billing_events
  DROP CONSTRAINT IF EXISTS ads_billing_events_attribution_window_ck;
ALTER TABLE ads_billing_events
  DROP COLUMN IF EXISTS attribution_window_minutes;
