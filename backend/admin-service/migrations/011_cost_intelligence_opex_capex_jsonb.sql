-- Add JSONB columns for detailed OPEX and CAPEX separation
ALTER TABLE platform_cost_configs
  ADD COLUMN IF NOT EXISTS opex_ondemand_details JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS opex_aggregator_details JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS capex_ondemand_details JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS capex_aggregator_details JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS estimated_orders_ondemand_per_month INTEGER DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS estimated_orders_aggregator_per_month INTEGER DEFAULT 500;
