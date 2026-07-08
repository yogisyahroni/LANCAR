-- ============================================================
-- TEMBUS — Extend Platform Cost Configs (Keuangan, Pajak VAT/PPh & Tarif)
-- Migration: 20260708000006_extend_platform_cost_configs_tax_finance.sql
-- ============================================================

ALTER TABLE platform_cost_configs
  ADD COLUMN IF NOT EXISTS tax_vat_pct NUMERIC(5,2) NOT NULL DEFAULT 11.00,
  ADD COLUMN IF NOT EXISTS tax_pph_pct NUMERIC(5,2) NOT NULL DEFAULT 2.00,
  ADD COLUMN IF NOT EXISTS payment_gateway_mdr_pct NUMERIC(5,2) NOT NULL DEFAULT 0.70,
  ADD COLUMN IF NOT EXISTS payment_gateway_fixed_idr NUMERIC(15,2) NOT NULL DEFAULT 2000.00,
  ADD COLUMN IF NOT EXISTS payout_disbursement_fee_idr NUMERIC(15,2) NOT NULL DEFAULT 2500.00,
  ADD COLUMN IF NOT EXISTS opex_cloud_storage_per_order_idr NUMERIC(15,2) NOT NULL DEFAULT 50.00,
  ADD COLUMN IF NOT EXISTS opex_cs_support_per_order_idr NUMERIC(15,2) NOT NULL DEFAULT 150.00,
  ADD COLUMN IF NOT EXISTS opex_dispute_reserve_idr NUMERIC(15,2) NOT NULL DEFAULT 200.00,
  ADD COLUMN IF NOT EXISTS min_platform_fee_idr NUMERIC(15,2) NOT NULL DEFAULT 1500.00,
  ADD COLUMN IF NOT EXISTS max_discount_subsidy_pct NUMERIC(5,2) NOT NULL DEFAULT 20.00;

-- Update existing records if any null values exist
UPDATE platform_cost_configs
SET 
  tax_vat_pct = COALESCE(tax_vat_pct, 11.00),
  tax_pph_pct = COALESCE(tax_pph_pct, 2.00),
  payment_gateway_mdr_pct = COALESCE(payment_gateway_mdr_pct, 0.70),
  payment_gateway_fixed_idr = COALESCE(payment_gateway_fixed_idr, 2000.00),
  payout_disbursement_fee_idr = COALESCE(payout_disbursement_fee_idr, 2500.00),
  opex_cloud_storage_per_order_idr = COALESCE(opex_cloud_storage_per_order_idr, 50.00),
  opex_cs_support_per_order_idr = COALESCE(opex_cs_support_per_order_idr, 150.00),
  opex_dispute_reserve_idr = COALESCE(opex_dispute_reserve_idr, 200.00),
  min_platform_fee_idr = COALESCE(min_platform_fee_idr, 1500.00),
  max_discount_subsidy_pct = COALESCE(max_discount_subsidy_pct, 20.00);
