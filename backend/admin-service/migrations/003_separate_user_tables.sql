-- Migration: Total User Table Separation (Maximal Isolation)
-- This migration splits 'users' into 'staff', 'customers', and 'couriers'.
-- Date: 2024-05-05

BEGIN;

-- 1. Create staff table
CREATE TABLE staff (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_number VARCHAR(20) NOT NULL UNIQUE,
    email VARCHAR(255) UNIQUE,
    full_name VARCHAR(255) NOT NULL,
    photo_url TEXT,
    role VARCHAR(20) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'active',
    pin_hash VARCHAR(255),
    totp_secret TEXT,
    is_2fa_enabled BOOLEAN DEFAULT FALSE,
    totp_backup_codes TEXT[],
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- 2. Create customers table
CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_number VARCHAR(20) NOT NULL UNIQUE,
    email VARCHAR(255) UNIQUE,
    full_name VARCHAR(255) NOT NULL,
    photo_url TEXT,
    role VARCHAR(20) NOT NULL DEFAULT 'customer',
    status VARCHAR(30) NOT NULL DEFAULT 'active',
    referral_code VARCHAR(20) UNIQUE,
    referred_by UUID, -- Will need FK to customers itself
    pin_hash VARCHAR(255),
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- 3. Create couriers table
CREATE TABLE couriers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_number VARCHAR(20) NOT NULL UNIQUE,
    email VARCHAR(255) UNIQUE,
    full_name VARCHAR(255) NOT NULL,
    photo_url TEXT,
    role VARCHAR(20) NOT NULL DEFAULT 'courier',
    status VARCHAR(30) NOT NULL DEFAULT 'active',
    pin_hash VARCHAR(255),
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- 4. Migrate Data
INSERT INTO staff SELECT id, phone_number, email, full_name, photo_url, role, status, pin_hash, totp_secret, is_2fa_enabled, totp_backup_codes, last_login_at, created_at, updated_at, deleted_at 
FROM users WHERE role IN ('super_admin', 'ops_admin', 'finance_admin', 'cs_agent', 'zone_manager');

INSERT INTO customers SELECT id, phone_number, email, full_name, photo_url, role, status, referral_code, referred_by, pin_hash, last_login_at, created_at, updated_at, deleted_at 
FROM users WHERE role = 'customer';

INSERT INTO couriers SELECT id, phone_number, email, full_name, photo_url, role, status, pin_hash, last_login_at, created_at, updated_at, deleted_at 
FROM users WHERE role = 'courier';

-- 5. Drop Old Constraints on dependent tables
ALTER TABLE courier_ratings DROP CONSTRAINT courier_ratings_courier_id_fkey;
ALTER TABLE courier_ratings DROP CONSTRAINT courier_ratings_rated_by_fkey;
ALTER TABLE courier_profiles DROP CONSTRAINT courier_profiles_user_id_fkey;
ALTER TABLE orders DROP CONSTRAINT orders_customer_id_fkey;
ALTER TABLE order_legs DROP CONSTRAINT order_legs_courier_id_fkey;
ALTER TABLE vouchers DROP CONSTRAINT vouchers_created_by_fkey;
ALTER TABLE package_scans DROP CONSTRAINT package_scans_scanned_by_fkey;
ALTER TABLE disputes DROP CONSTRAINT disputes_opened_by_fkey;
ALTER TABLE disputes DROP CONSTRAINT disputes_assigned_to_fkey;
ALTER TABLE feature_flags DROP CONSTRAINT feature_flags_updated_by_fkey;
ALTER TABLE feature_flag_logs DROP CONSTRAINT feature_flag_logs_updated_by_fkey;
ALTER TABLE user_sessions DROP CONSTRAINT user_sessions_user_id_fkey;
ALTER TABLE courier_documents DROP CONSTRAINT courier_documents_verified_by_fkey;
ALTER TABLE sla_logs DROP CONSTRAINT sla_logs_courier_id_fkey;
ALTER TABLE relay_score_history DROP CONSTRAINT relay_score_history_admin_id_fkey;
ALTER TABLE notifications DROP CONSTRAINT notifications_user_id_fkey;
ALTER TABLE payout_records DROP CONSTRAINT payout_records_courier_id_fkey;
ALTER TABLE voucher_usages DROP CONSTRAINT voucher_usages_user_id_fkey;
ALTER TABLE referral_rewards DROP CONSTRAINT referral_rewards_referrer_id_fkey;
ALTER TABLE referral_rewards DROP CONSTRAINT referral_rewards_referred_id_fkey;
ALTER TABLE saved_addresses DROP CONSTRAINT saved_addresses_user_id_fkey;
ALTER TABLE courier_gps_logs DROP CONSTRAINT courier_gps_logs_courier_id_fkey;
ALTER TABLE refunds DROP CONSTRAINT refunds_user_id_fkey;
ALTER TABLE system_configs DROP CONSTRAINT system_configs_updated_by_fkey;
ALTER TABLE web_sessions DROP CONSTRAINT web_sessions_user_id_fkey;
ALTER TABLE web_push_subscriptions DROP CONSTRAINT web_push_subscriptions_user_id_fkey;
ALTER TABLE bulk_downloads DROP CONSTRAINT bulk_downloads_user_id_fkey;
ALTER TABLE customer_analytics_cache DROP CONSTRAINT customer_analytics_cache_user_id_fkey;
ALTER TABLE order_chats DROP CONSTRAINT order_chats_sender_id_fkey;
ALTER TABLE dispute_chats DROP CONSTRAINT dispute_chats_sender_id_fkey;
ALTER TABLE admin_sessions DROP CONSTRAINT admin_sessions_user_id_fkey;
ALTER TABLE customer_sessions DROP CONSTRAINT customer_sessions_user_id_fkey;

-- 6. Add New Constraints pointing to separated tables
-- Note: Some tables like dispute_chats or notifications might need multi-table relationships or logic in app layer.
-- For Extreme Security, we'll map them strictly to where they belong.

ALTER TABLE orders ADD CONSTRAINT orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id);
ALTER TABLE order_legs ADD CONSTRAINT order_legs_courier_id_fkey FOREIGN KEY (courier_id) REFERENCES couriers(id);
ALTER TABLE courier_profiles ADD CONSTRAINT courier_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES couriers(id) ON DELETE CASCADE;
ALTER TABLE courier_ratings ADD CONSTRAINT courier_ratings_courier_id_fkey FOREIGN KEY (courier_id) REFERENCES couriers(id);
ALTER TABLE courier_ratings ADD CONSTRAINT courier_ratings_rated_by_fkey FOREIGN KEY (rated_by) REFERENCES customers(id); -- Customers rate couriers
ALTER TABLE vouchers ADD CONSTRAINT vouchers_created_by_fkey FOREIGN KEY (created_by) REFERENCES staff(id);
ALTER TABLE package_scans ADD CONSTRAINT package_scans_scanned_by_fkey FOREIGN KEY (scanned_by) REFERENCES couriers(id);
ALTER TABLE disputes ADD CONSTRAINT disputes_opened_by_fkey FOREIGN KEY (opened_by) REFERENCES customers(id);
ALTER TABLE disputes ADD CONSTRAINT disputes_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES staff(id);
ALTER TABLE admin_sessions ADD CONSTRAINT admin_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES staff(id) ON DELETE CASCADE;
ALTER TABLE customer_sessions ADD CONSTRAINT customer_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES customers(id) ON DELETE CASCADE;
ALTER TABLE saved_addresses ADD CONSTRAINT saved_addresses_user_id_fkey FOREIGN KEY (user_id) REFERENCES customers(id) ON DELETE CASCADE;
ALTER TABLE notifications ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES customers(id) ON DELETE CASCADE; -- Primarily for customers
ALTER TABLE payout_records ADD CONSTRAINT payout_records_courier_id_fkey FOREIGN KEY (courier_id) REFERENCES couriers(id);
ALTER TABLE courier_documents ADD CONSTRAINT courier_documents_verified_by_fkey FOREIGN KEY (verified_by) REFERENCES staff(id);
ALTER TABLE relay_score_history ADD CONSTRAINT relay_score_history_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES staff(id);

-- 7. Self-Referencing for Referral
ALTER TABLE customers ADD CONSTRAINT customers_referred_by_fkey FOREIGN KEY (referred_by) REFERENCES customers(id);

COMMIT;
