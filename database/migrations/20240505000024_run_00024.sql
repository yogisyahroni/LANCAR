-- +goose Up
-- +goose StatementBegin
-- Migration 00024 (UP only): Add bank account info and performance stats to courier_profiles
-- Run: psql -U postgres -d lancar -f run_00024.sql

-- Bank account fields for payout disbursement
ALTER TABLE courier_profiles
    ADD COLUMN IF NOT EXISTS bank_code         VARCHAR(20),
    ADD COLUMN IF NOT EXISTS bank_account_number VARCHAR(30),
    ADD COLUMN IF NOT EXISTS bank_account_name VARCHAR(255);

-- Performance stats fields for relay score calculation
ALTER TABLE courier_profiles
    ADD COLUMN IF NOT EXISTS ontime_deliveries_count     INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_deliveries_count      INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS docs_complete_pct           DECIMAL(5,2) NOT NULL DEFAULT 100.00,
    ADD COLUMN IF NOT EXISTS avg_partner_rating          DECIMAL(3,2) NOT NULL DEFAULT 5.00,
    ADD COLUMN IF NOT EXISTS complaint_count             INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS complaint_ratio_pct         DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS last_score_calculated_at    TIMESTAMPTZ;

COMMENT ON COLUMN courier_profiles.bank_code IS 'Bank code for Xendit/Flip disbursement (e.g. BCA, MANDIRI, BNI)';
COMMENT ON COLUMN courier_profiles.bank_account_number IS 'Courier bank account number for payout disbursement';
COMMENT ON COLUMN courier_profiles.bank_account_name IS 'Account holder name matching the bank account';
COMMENT ON COLUMN courier_profiles.ontime_deliveries_count IS 'Count of deliveries completed on time (within SLA)';
COMMENT ON COLUMN courier_profiles.total_deliveries_count IS 'Total completed deliveries for this courier';
COMMENT ON COLUMN courier_profiles.docs_complete_pct IS 'Percentage of deliveries with complete documentation scan';
COMMENT ON COLUMN courier_profiles.avg_partner_rating IS 'Average rating from customer ratings (1.00-5.00)';
COMMENT ON COLUMN courier_profiles.complaint_count IS 'Number of verified complaints filed against this courier';
COMMENT ON COLUMN courier_profiles.complaint_ratio_pct IS 'Ratio of complaint_count / total_deliveries_count * 100';
COMMENT ON COLUMN courier_profiles.last_score_calculated_at IS 'Timestamp of the last relay score calculation';

CREATE INDEX IF NOT EXISTS idx_courier_bank_code ON courier_profiles(bank_code) WHERE bank_code IS NOT NULL;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE courier_profiles 
    DROP COLUMN IF EXISTS bank_code,
    DROP COLUMN IF EXISTS bank_account_number,
    DROP COLUMN IF EXISTS bank_account_name,
    DROP COLUMN IF EXISTS ontime_deliveries_count,
    DROP COLUMN IF EXISTS total_deliveries_count,
    DROP COLUMN IF EXISTS docs_complete_pct,
    DROP COLUMN IF EXISTS avg_partner_rating,
    DROP COLUMN IF EXISTS complaint_count,
    DROP COLUMN IF EXISTS complaint_ratio_pct,
    DROP COLUMN IF EXISTS last_score_calculated_at;
-- +goose StatementEnd
