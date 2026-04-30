-- +goose Up
-- ============================================================
-- Migration 00010: Additional DB Indexes (Performance)
-- Based on expected query patterns for LANCAR platform
-- ============================================================

-- -------------------------------------------------------
-- Orders: common query patterns
-- -------------------------------------------------------
-- Scheduler queries: find orders pending payment or assignment
CREATE INDEX IF NOT EXISTS idx_orders_pending_payment
    ON orders(created_at)
    WHERE status = 'pending_payment';

CREATE INDEX IF NOT EXISTS idx_orders_pending_assignment
    ON orders(assigned_at)
    WHERE status = 'pending_assignment';

-- Courier earning queries
CREATE INDEX IF NOT EXISTS idx_orders_delivered_created
    ON orders(delivered_at DESC)
    WHERE status = 'delivered';

-- -------------------------------------------------------
-- Order Legs: SLA monitor queries
-- -------------------------------------------------------
-- Active legs for SLA monitoring (scheduler runs every minute)
CREATE INDEX IF NOT EXISTS idx_order_legs_active_sla
    ON order_legs(sla_deadline ASC)
    WHERE status IN ('assigned', 'in_transit', 'at_meeting_point');

-- Courier leg assignment history
CREATE INDEX IF NOT EXISTS idx_order_legs_courier_completed
    ON order_legs(courier_id, completed_at DESC)
    WHERE status IN ('delivered', 'failed');

-- -------------------------------------------------------
-- Courier Profiles: matching engine queries
-- -------------------------------------------------------
-- Online couriers in zone (used by matching engine heavily)
CREATE INDEX IF NOT EXISTS idx_courier_profile_online_zone
    ON courier_profiles(is_online, verification_status)
    WHERE is_online = TRUE AND verification_status = 'approved';

-- -------------------------------------------------------
-- Courier Locations: real-time tracking queries
-- -------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_courier_loc_order
    ON courier_locations(order_id, recorded_at DESC);

-- -------------------------------------------------------
-- Payments: webhook + status queries
-- -------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_payments_expires
    ON payments(expires_at)
    WHERE status = 'pending';

-- -------------------------------------------------------
-- Payout Records: batch processing
-- -------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_payout_pending_courier
    ON payout_records(courier_id, batch_date)
    WHERE disbursement_status = 'pending';

-- -------------------------------------------------------
-- Notifications: user inbox queries (most frequent read)
-- -------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_notifications_user_created
    ON notifications(user_id, created_at DESC);

-- -------------------------------------------------------
-- Feature Flags: cache miss lookups by key (already unique idx,
-- this covers partial index for enabled flags only)
-- -------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_feature_flags_enabled_key
    ON feature_flags(key)
    WHERE is_enabled = TRUE;

-- -------------------------------------------------------
-- Dynamic Pricing: per-zone active multiplier lookups
-- -------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_dynamic_pricing_active
    ON dynamic_pricing_logs(zone_id, factor, applied_at DESC);

-- -------------------------------------------------------
-- Vouchers: code lookup (public-facing)
-- -------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_vouchers_active_until
    ON vouchers(valid_until)
    WHERE is_active = TRUE;

-- -------------------------------------------------------
-- Courier Ratings: avg rating calculation
-- -------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_courier_ratings_courier_stars
    ON courier_ratings(courier_id, stars);

-- -------------------------------------------------------
-- Relay Score History: analytics trend queries
-- -------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_relay_score_30days
    ON relay_score_history(courier_id, calculated_at DESC);

-- -------------------------------------------------------
-- Weather Logs: latest per zone (for pricing workers)
-- -------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_weather_logs_zone_latest
    ON weather_logs(zone_id, polled_at DESC)
    WHERE is_applied = TRUE;

-- -------------------------------------------------------
-- Referral Rewards: lookup by referral code
-- -------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_referral_by_code
    ON referral_rewards(referral_code, status);

-- +goose Down
DROP INDEX IF EXISTS idx_referral_by_code;
DROP INDEX IF EXISTS idx_weather_logs_zone_latest;
DROP INDEX IF EXISTS idx_relay_score_30days;
DROP INDEX IF EXISTS idx_courier_ratings_courier_stars;
DROP INDEX IF EXISTS idx_vouchers_active_until;
DROP INDEX IF EXISTS idx_dynamic_pricing_active;
DROP INDEX IF EXISTS idx_feature_flags_enabled_key;
DROP INDEX IF EXISTS idx_notifications_user_created;
DROP INDEX IF EXISTS idx_payout_pending_courier;
DROP INDEX IF EXISTS idx_payments_expires;
DROP INDEX IF EXISTS idx_courier_loc_order;
DROP INDEX IF EXISTS idx_courier_profile_online_zone;
DROP INDEX IF EXISTS idx_order_legs_courier_completed;
DROP INDEX IF EXISTS idx_order_legs_active_sla;
DROP INDEX IF EXISTS idx_orders_delivered_created;
DROP INDEX IF EXISTS idx_orders_pending_assignment;
DROP INDEX IF EXISTS idx_orders_pending_payment;
