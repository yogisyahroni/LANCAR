-- Migration to create the package_scans table for multi-leg warehouse tracking and ePOD.
CREATE TABLE IF NOT EXISTS package_scans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL,
    scan_type VARCHAR(50) NOT NULL, -- 'pickup', 'inbound_origin', 'outbound_origin', 'inbound_destination', 'outbound_destination', 'out_for_delivery', 'delivered'
    scanned_by UUID NOT NULL, -- ID of courier or hub operator
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    warehouse_id UUID, -- ID of the hub/warehouse where scanned
    photo_url TEXT, -- Optional ePOD photo proof
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_package_scans_order_id ON package_scans(order_id);
