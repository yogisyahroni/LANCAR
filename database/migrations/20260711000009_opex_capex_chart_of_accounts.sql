-- +goose Up
-- ============================================================
-- LANCAR — Chart of Accounts (OPEX & CAPEX Extension)
-- Migration: 20260711000009_opex_capex_chart_of_accounts.sql
-- ============================================================

INSERT INTO chart_of_accounts (account_code, account_name, account_type, description) VALUES
-- CAPEX (Capital Expenditure / Long Term Assets)
('1501', 'capex_software_dev', 'Asset', 'Capitalized software development (Core System & AI Routing)'),
('1502', 'capex_sorting_equipment', 'Asset', 'Sorting hub equipment and automation machines'),
('1503', 'capex_it_hardware', 'Asset', 'IT hardware, servers, and courier PDA scanners'),

-- OPEX (Operational Expenditure / Indirect Costs)
('5101', 'opex_maps_api', 'Expense', 'Maps API usage (Google Maps, Mapbox) for routing/pricing'),
('5102', 'opex_cloud_infra', 'Expense', 'Cloud infrastructure costs (AWS/GCP hosting, Kubernetes)'),
('5103', 'opex_communication', 'Expense', 'Communication costs (WhatsApp API, SMS OTP)'),
('5104', 'opex_marketing_cac', 'Expense', 'Marketing and Customer Acquisition Cost (Non-direct subsidy)'),
('5105', 'opex_payroll_tech', 'Expense', 'Payroll for Product and Engineering team'),
('5106', 'opex_payroll_ops', 'Expense', 'Payroll for Operations, Fleet, and Customer Service'),
('5107', 'opex_legal_compliance', 'Expense', 'Legal fees, SLA disputes, and compliance licensing')
ON CONFLICT (account_code) DO NOTHING;

-- +goose Down
DELETE FROM chart_of_accounts WHERE account_code IN (
    '1501', '1502', '1503',
    '5101', '5102', '5103', '5104', '5105', '5106', '5107'
);
