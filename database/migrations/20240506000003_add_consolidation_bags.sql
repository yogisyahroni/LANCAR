-- +goose Up
-- Migration to create the consolidation_bags table and add bag references to package scans.
CREATE TABLE IF NOT EXISTS consolidation_bags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bag_number VARCHAR(100) UNIQUE NOT NULL,
    vehicle_plate VARCHAR(50),
    flight_number VARCHAR(100),
    origin_warehouse_id UUID,
    destination_warehouse_id UUID,
    status VARCHAR(50) NOT NULL DEFAULT 'sealed', -- 'sealed', 'opened'
    created_by UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_consolidation_bags_number ON consolidation_bags(bag_number);

-- Update package_scans to reference bags
ALTER TABLE package_scans ADD COLUMN IF NOT EXISTS bag_number VARCHAR(100);
CREATE INDEX IF NOT EXISTS idx_package_scans_bag_number ON package_scans(bag_number);

-- +goose Down
ALTER TABLE package_scans DROP COLUMN IF EXISTS bag_number;
DROP TABLE IF EXISTS consolidation_bags;
