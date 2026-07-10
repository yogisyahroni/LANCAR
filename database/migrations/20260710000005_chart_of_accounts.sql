-- +goose Up
-- ============================================================
-- LANCAR — Chart of Accounts
-- Migration: 20260710000005_chart_of_accounts.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS chart_of_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_code VARCHAR(20) UNIQUE NOT NULL,
    account_name VARCHAR(100) NOT NULL,
    account_type VARCHAR(50) NOT NULL, -- Asset, Liability, Equity, Revenue, Expense, Reserve
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_chart_of_accounts_code ON chart_of_accounts(account_code);
CREATE INDEX idx_chart_of_accounts_type ON chart_of_accounts(account_type);

-- Seed Initial Chart of Accounts
INSERT INTO chart_of_accounts (account_code, account_name, account_type, description) VALUES
-- Assets
('1001', 'cash_main', 'Asset', 'Main operational bank account'),
('1002', 'cash_tax', 'Asset', 'Segregated account for tax liabilities'),
('1003', 'cash_reserve', 'Asset', 'Reserve account for disputes and insurance'),
('1004', 'cash_provider_settlement', 'Asset', 'Holding account for 3PL provider settlements'),
-- Liabilities
('2001', 'customer_wallet_liability', 'Liability', 'Customer wallet balances (Owed to customers)'),
('2002', 'merchant_payable', 'Liability', 'Funds owed to merchants from payment links/sales'),
('2003', 'courier_payable', 'Liability', 'Funds owed to couriers for completed deliveries'),
('2004', 'provider_payable', 'Liability', 'Funds owed to 3PL logistics providers'),
('2005', 'tax_payable_ppn', 'Liability', 'PPN collected owed to the government (DJP)'),
-- Revenue
('4001', 'platform_fee_revenue', 'Revenue', 'Revenue from platform usage fees'),
('4002', 'handling_fee_revenue', 'Revenue', 'Revenue from aggregator markup/handling'),
('4003', 'delivery_revenue', 'Revenue', 'Gross delivery revenue from on-demand (Principal)'),
('4004', 'payment_admin_fee_revenue', 'Revenue', 'Revenue from payment gateway/admin fees'),
-- Expenses
('5001', 'courier_payout_expense', 'Expense', 'Expense for paying out on-demand couriers'),
('5002', 'provider_shipping_cost', 'Expense', 'Expense for 3PL provider shipping costs'),
('5003', 'mdr_expense', 'Expense', 'Merchant Discount Rate (MDR) gateway fees'),
('5004', 'promo_subsidy_expense', 'Expense', 'Expense for platform-funded promotions/discounts'),
('5005', 'insurance_expense', 'Expense', 'Expense for cargo/delivery insurance premiums'),
('5006', 'refund_expense', 'Expense', 'Expense related to customer refunds/compensations'),
-- Reserves
('6001', 'weather_reserve', 'Reserve', 'Reserve for weather-related surge contingencies'),
('6002', 'insurance_reserve', 'Reserve', 'Reserve for self-insured claims'),
('6003', 'dispute_reserve', 'Reserve', 'Reserve for disputed transactions')
ON CONFLICT (account_code) DO NOTHING;

-- Modify ledger_entries to reference account_code instead of generic string if possible,
-- but to avoid breaking existing ledgers, we just ensure it's logical.
-- We can add a constraint or trigger in the future, but for now we keep it as soft-link
-- in the backend code to ensure ledger immutability isn't strictly tied to mutable COA names.

-- +goose Down
DROP TABLE IF EXISTS chart_of_accounts;
