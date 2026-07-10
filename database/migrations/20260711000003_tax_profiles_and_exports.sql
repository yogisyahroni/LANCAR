-- +goose Up
CREATE TABLE IF NOT EXISTS user_tax_profiles (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    npwp VARCHAR(20),
    nik VARCHAR(20),
    tax_name VARCHAR(100),
    tax_address TEXT,
    is_pkp BOOLEAN DEFAULT FALSE,
    tax_classification VARCHAR(50) DEFAULT 'individual',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tax_efaktur_exports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period VARCHAR(10) NOT NULL, -- e.g., '2026-06'
    status VARCHAR(20) NOT NULL DEFAULT 'exported', -- draft, exported, submitted, accepted, rejected
    file_url TEXT,
    checksum VARCHAR(255),
    total_dpp_idr BIGINT NOT NULL DEFAULT 0,
    total_ppn_idr BIGINT NOT NULL DEFAULT 0,
    requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert fallback configs to system_configs
INSERT INTO system_configs (key, value, description, category) VALUES
('TAX_DEFAULT_NON_NPWP', '"000000000000000"'::jsonb, 'Default NPWP for users without one in e-Faktur', 'tax'),
('TAX_PROVIDER_DEFAULT_ADDRESS', '"Alamat Payment Gateway Default"'::jsonb, 'Default tax address for payment gateways', 'tax'),
('TAX_PROVIDER_DEFAULT_NPWP', '"000000000000000"'::jsonb, 'Default NPWP for payment gateways', 'tax'),
('PPH21_COURIER_RATE_NPWP', '2.5'::jsonb, 'PPh21 withholding rate for couriers with NPWP', 'tax'),
('PPH21_COURIER_RATE_NON_NPWP', '3.0'::jsonb, 'PPh21 withholding rate for couriers without NPWP', 'tax')
ON CONFLICT (key) DO UPDATE SET 
    value = EXCLUDED.value, 
    description = EXCLUDED.description,
    category = EXCLUDED.category;

-- +goose Down
DELETE FROM system_configs WHERE key IN ('TAX_DEFAULT_NON_NPWP', 'TAX_PROVIDER_DEFAULT_ADDRESS', 'TAX_PROVIDER_DEFAULT_NPWP', 'PPH21_COURIER_RATE_NPWP', 'PPH21_COURIER_RATE_NON_NPWP');
DROP TABLE IF EXISTS tax_efaktur_exports;
DROP TABLE IF EXISTS user_tax_profiles;
