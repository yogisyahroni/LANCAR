-- +goose Up
CREATE TABLE IF NOT EXISTS system_settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Default Fees
INSERT INTO system_settings (key, value, description) VALUES 
('withdrawal_fee_customer', '5000', 'Admin fee for customer withdrawals'),
('withdrawal_fee_courier', '0', 'Admin fee for courier withdrawals'),
('topup_min_amount', '10000', 'Minimum topup amount'),
('withdrawal_min_amount', '50000', 'Minimum withdrawal amount'),
('auto_disbursement_threshold', '1000000', 'Amount threshold for automatic disbursement without manual approval')
ON CONFLICT (key) DO NOTHING;

-- +goose Down
DROP TABLE IF EXISTS system_settings;
