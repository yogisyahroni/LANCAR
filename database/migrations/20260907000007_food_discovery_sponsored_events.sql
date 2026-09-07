-- +goose Up
-- FOOD-2026-023: sponsored discovery attribution and dedupe/fraud guards.
CREATE TABLE IF NOT EXISTS food_discovery_ad_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES promo_campaigns(id) ON DELETE RESTRICT,
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE RESTRICT,
    user_id UUID NOT NULL,
    event_type VARCHAR(16) NOT NULL CHECK (event_type IN ('impression', 'click', 'order')),
    session_id VARCHAR(120) NOT NULL,
    order_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK ((event_type = 'order' AND order_id IS NOT NULL) OR event_type <> 'order')
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_food_discovery_ad_event_session
    ON food_discovery_ad_events(campaign_id, user_id, session_id, event_type);
CREATE UNIQUE INDEX IF NOT EXISTS uq_food_discovery_ad_event_order
    ON food_discovery_ad_events(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_food_discovery_ad_events_campaign
    ON food_discovery_ad_events(campaign_id, created_at DESC);

-- Down
-- DROP TABLE IF EXISTS food_discovery_ad_events;
