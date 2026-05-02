-- Migration: Backfill Audit Categories
-- Description: Standardizes existing audit logs by assigning categories based on the key prefix.
-- This requires temporarily disabling the immutability trigger on feature_flag_logs.

-- 1. Disable the protection trigger
ALTER TABLE feature_flag_logs DISABLE TRIGGER trg_prevent_feature_flag_log_update;

-- 2. Backfill categories based on key patterns
-- Finance
UPDATE feature_flag_logs 
SET category = 'finance' 
WHERE category IS NULL 
AND (
    key LIKE 'payout:%' OR 
    key LIKE 'finance:%' OR 
    key = 'config:treasury_limit_idr' OR 
    key = 'config:emergency_fund_idr'
);

-- Insurance
UPDATE feature_flag_logs 
SET category = 'insurance' 
WHERE category IS NULL 
AND (
    key LIKE 'insurance:%' OR 
    key = 'config:premium_rate_basis_points'
);

-- Security
UPDATE feature_flag_logs 
SET category = 'security' 
WHERE category IS NULL 
AND (
    key LIKE 'courier:%' OR 
    key LIKE 'auth:%' OR 
    key = 'config:max_login_attempts'
);

-- Logistics
UPDATE feature_flag_logs 
SET category = 'logistics' 
WHERE category IS NULL 
AND (
    key LIKE 'zone:%' OR 
    key = 'config:base_delivery_fee_idr'
);

-- Marketing
UPDATE feature_flag_logs 
SET category = 'marketing' 
WHERE category IS NULL 
AND (
    key LIKE 'voucher:%' OR 
    key LIKE 'promo:%'
);

-- Features (Default for feature flags)
UPDATE feature_flag_logs 
SET category = 'feature' 
WHERE category IS NULL 
AND key NOT LIKE 'config:%';

-- General (Fallback for system configs)
UPDATE feature_flag_logs 
SET category = 'general' 
WHERE category IS NULL;

-- 3. Re-enable the protection trigger
ALTER TABLE feature_flag_logs ENABLE TRIGGER trg_prevent_feature_flag_log_update;
