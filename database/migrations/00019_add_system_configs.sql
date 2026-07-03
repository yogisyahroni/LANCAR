-- +goose Up
-- ============================================================
-- Migration 00019: System Configurations Table
-- ============================================================

CREATE TABLE IF NOT EXISTS system_configs (
    key           VARCHAR(100) PRIMARY KEY,
    value         JSONB NOT NULL,
    description   TEXT,
    category      VARCHAR(50) NOT NULL DEFAULT 'general',
    updated_by    UUID REFERENCES users(id),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default values
INSERT INTO system_configs (key, value, description, category) VALUES
('platform_name', '"TEMBUS Logistics Hub"', 'Visible name of the platform', 'general'),
('support_email', '"ops@tembus.id"', 'Customer support email address', 'general'),
('insurance_premium_rate', '0.1', 'Percentage rate of declared value', 'insurance'),
('insurance_min_premium', '2000', 'Minimum premium in IDR', 'insurance'),
('insurance_max_coverage', '25000000', 'Maximum replacement value in IDR', 'insurance'),
('max_weight_kg', '20', 'Maximum weight per courier load', 'logistics'),
('max_distance_km', '15', 'Maximum distance per delivery leg', 'logistics'),
('speed_threshold_kmh', '60', 'Speed alert threshold for couriers', 'safety'),
('battery_alert_pct', '20', 'Battery level threshold for alerts', 'safety'),
('admin_fee_pct', '5', 'Platform service fee percentage', 'finance'),
('payment_mdr_rate', '0.007', 'MDR Rate for payment gateway', 'finance'),
('payment_ppn_rate', '0.11', 'PPN Rate for payment gateway', 'finance'),
('weather_reserve_idr', '0', 'Weather Reserve Fund', 'finance'),
('merchant_transaction_fee_pct', '0.025', 'Merchant Fee Pct', 'finance'),
('bpjstk_coverage_idr', '50000000', 'BPJSTK Coverage IDR', 'insurance'),
('bpjstk_premium_monthly_idr', '16800', 'BPJSTK Monthly Premium', 'insurance'),
('bpjstk_company_share_idr', '10000', 'BPJSTK Company Share', 'insurance'),
('bpjstk_courier_share_idr', '6800', 'BPJSTK Courier Share', 'insurance'),
('platform_fee_idr', '1500', 'Platform Fee Flat IDR', 'finance'),
('platform_fee_pct', '0.015', 'Platform Fee Percentage', 'finance'),
('security_enable_play_integrity', 'false', 'Enable App Integrity (Fraud Check)', 'security')
ON CONFLICT (key) DO UPDATE SET 
    value = EXCLUDED.value,
    description = EXCLUDED.description,
    category = EXCLUDED.category;

-- +goose Down
DROP TABLE IF EXISTS system_configs;
