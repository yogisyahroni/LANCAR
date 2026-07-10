INSERT INTO system_configs (key, value, description, category, updated_at)
VALUES 
('weight_tier1_threshold_kg', '3', 'Threshold weight in KG for Tier 1 pricing', 'Logistics', NOW()),
('weight_surcharge_tier1', '0.15', 'Surcharge fraction for Tier 1 weight', 'Logistics', NOW()),
('weight_tier2_threshold_kg', '10', 'Threshold weight in KG for Tier 2 pricing', 'Logistics', NOW()),
('weight_surcharge_tier2', '0.30', 'Surcharge fraction for Tier 2 weight', 'Logistics', NOW()),
('surge_peak_hour_multiplier', '0.2', 'Surge multiplier during peak hours', 'Logistics', NOW()),
('surge_high_demand_multiplier', '0.15', 'Surge multiplier during high demand (e.g., bad weather or shortage of couriers)', 'Logistics', NOW()),
('surge_demand_multiplier_step', '0.25', 'Step increment for surge based on demand-supply ratio', 'Logistics', NOW()),
('surge_demand_ratio_threshold', '1.5', 'Threshold for order-to-courier ratio to trigger surge increment', 'Logistics', NOW()),
('surge_max_multiplier', '2.5', 'Maximum allowed surge multiplier', 'Logistics', NOW()),
('insurance_premium_rate', '0.002', 'Insurance premium rate as fraction of declared value', 'Insurance', NOW()),
('insurance_min_premium', '1000', 'Minimum premium for insurance in IDR', 'Insurance', NOW()),
('insurance_max_coverage_idr', '10000000', 'Maximum insurance coverage in IDR', 'Insurance', NOW()),
('insurance_fee_idr', '5000', 'Fixed insurance fee in IDR if dynamic calculation is not used', 'Insurance', NOW())
ON CONFLICT (key) DO NOTHING;
