-- +goose Up
-- ============================================================
-- Migration: Add Wallet and Finance Configurations to system_configs
-- ============================================================

INSERT INTO system_configs (key, value, description, category) VALUES
('withdrawal_fee_customer', '5000', 'Admin fee for customer withdrawals (IDR)', 'finance'),
('withdrawal_fee_courier', '0', 'Admin fee for courier withdrawals (IDR)', 'finance'),
('topup_fee_fixed', '1000', 'Fixed admin fee for every top-up transaction (IDR)', 'finance'),
('topup_fee_percent', '0', 'Percentage fee for top-up (e.g. for Credit Card coverage)', 'finance'),
('service_fee_fixed', '2000', 'Service fee for direct payment/checkout (IDR)', 'finance'),
('topup_min_amount', '10000', 'Minimum topup amount (IDR)', 'finance'),
('withdrawal_min_amount', '50000', 'Minimum withdrawal amount (IDR)', 'finance'),
('auto_disbursement_threshold', '1000000', 'Amount threshold for automatic disbursement without manual approval (IDR)', 'finance')
ON CONFLICT (key) DO UPDATE SET 
    value = EXCLUDED.value,
    description = EXCLUDED.description,
    category = EXCLUDED.category;

-- +goose Down
DELETE FROM system_configs WHERE key IN (
    'withdrawal_fee_customer',
    'withdrawal_fee_courier',
    'topup_fee_fixed',
    'topup_fee_percent',
    'service_fee_fixed',
    'topup_min_amount',
    'withdrawal_min_amount',
    'auto_disbursement_threshold'
);
