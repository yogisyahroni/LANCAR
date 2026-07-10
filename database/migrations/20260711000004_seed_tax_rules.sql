-- +goose Up
-- ============================================================
-- LANCAR — Seed Default Tax Rules
-- Migration: 20260711000004_seed_tax_rules.sql
-- ============================================================

INSERT INTO tax_rules (code, name, tax_type, effective_rate_pct, statutory_rate_pct, dpp_formula, invoice_required, effective_from)
VALUES 
    ('PPN_11', 'Pajak Pertambahan Nilai 11% (Umum)', 'PPN', 11.00, 11.00, 'FULL', TRUE, '2024-01-01 00:00:00+00'),
    ('PPN_11_LOGISTIK', 'PPN Jasa Pengiriman Paket PMK 71 (Efektif 1.1%)', 'PPN', 1.10, 11.00, '10_PERCENT', TRUE, '2024-01-01 00:00:00+00'),
    ('PPN_11_PLATFORM', 'PPN Jasa Platform / Aplikasi (11% dari Service Fee)', 'PPN', 11.00, 11.00, 'SERVICE_FEE_ONLY', TRUE, '2024-01-01 00:00:00+00'),
    ('PPH_21_NPWP', 'PPh 21 Kurir/Merchant NPWP', 'PPH', 2.50, 5.00, 'FULL', FALSE, '2024-01-01 00:00:00+00'),
    ('PPH_21_NON_NPWP', 'PPh 21 Kurir/Merchant Non-NPWP', 'PPH', 3.00, 6.00, 'FULL', FALSE, '2024-01-01 00:00:00+00'),
    ('PPH_23_SERVICE', 'PPh 23 Jasa Logistik / Badan (2%)', 'PPH', 2.00, 2.00, 'FULL', FALSE, '2024-01-01 00:00:00+00')
ON CONFLICT (code) DO NOTHING;

-- +goose Down
DELETE FROM tax_rules WHERE code IN ('PPN_11', 'PPN_11_LOGISTIK', 'PPN_11_PLATFORM', 'PPH_21_NPWP', 'PPH_21_NON_NPWP', 'PPH_23_SERVICE');
