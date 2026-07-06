-- Description: Create tables for 3PL Super Aggregator (provider configs, area mappings, and resi templates)

-- 1. Provider Configurations (JNE, J&T, P2P, etc.)
CREATE TABLE IF NOT EXISTS provider_configs (
    id VARCHAR(64) PRIMARY KEY,
    provider_code VARCHAR(32) UNIQUE NOT NULL, -- 'JNE', 'JNT', 'P2P', etc.
    provider_name VARCHAR(100) NOT NULL,
    api_base_url VARCHAR(255) NOT NULL,
    api_key VARCHAR(255),
    client_id VARCHAR(255),
    client_secret VARCHAR(255),
    account_id VARCHAR(100), -- e.g., eccompanyid for J&T
    is_active BOOLEAN DEFAULT TRUE,
    is_sandbox BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for quick lookup by provider code
CREATE INDEX IF NOT EXISTS idx_provider_configs_code ON provider_configs(provider_code);

-- 2. Provider Area Mappings (mapping postal codes / districts to 3PL internal area codes)
CREATE TABLE IF NOT EXISTS provider_area_mappings (
    id VARCHAR(64) PRIMARY KEY,
    provider_code VARCHAR(32) NOT NULL,
    postal_code VARCHAR(10) NOT NULL,
    district_name VARCHAR(100) NOT NULL,
    city_name VARCHAR(100) NOT NULL,
    province_name VARCHAR(100) NOT NULL,
    provider_area_code VARCHAR(64) NOT NULL, -- 3PL internal destination code (e.g. TGR10000 for J&T)
    provider_branch_code VARCHAR(64),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(provider_code, postal_code, district_name)
);

CREATE INDEX IF NOT EXISTS idx_provider_area_mappings_lookup ON provider_area_mappings(provider_code, postal_code);

-- 3. Resi Templates (Dynamic Receipt Customizer in Admin)
DROP TABLE IF EXISTS resi_templates CASCADE;
CREATE TABLE IF NOT EXISTS resi_templates (
    id VARCHAR(64) PRIMARY KEY,
    model_type VARCHAR(32) UNIQUE NOT NULL, -- 'P2P', 'JNE', 'JNT', 'GENERAL_3PL'
    template_name VARCHAR(100) NOT NULL,
    logo_url VARCHAR(255), -- TEMBUS Logo
    partner_logo_url VARCHAR(255), -- 3PL Logo
    header_title VARCHAR(100) DEFAULT 'TEMBUS LOGISTICS',
    barcode_format VARCHAR(20) DEFAULT 'QR', -- 'QR' or 'CODE128' for TEMBUS Order ID
    paper_size VARCHAR(20) DEFAULT 'A6', -- 'A6' (100x150mm thermal) or 'A4'
    show_price BOOLEAN DEFAULT FALSE,
    custom_instruction_text TEXT DEFAULT 'Sebelum Return Dimohon Untuk Konfirmasikan Dahulu ke Pengirim — Powered by TEMBUS Aggregator',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Seed default initial templates for P2P, JNE, and JNT
INSERT INTO resi_templates (id, model_type, template_name, barcode_format, paper_size, custom_instruction_text)
VALUES 
    ('TPL-001', 'P2P', 'LANCAR Instant Courier Receipt', 'QR', 'A6', 'Harap periksa keutuhan segel paket sebelum kurir meninggalkan lokasi.'),
    ('TPL-002', 'JNE', 'TEMBUS x JNE Reguler Aggregator', 'CODE128', 'A6', 'Sebelum Return Dimohon Untuk Konfirmasikan Dahulu ke Pengirim — Powered by TEMBUS Aggregator'),
    ('TPL-003', 'JNT', 'TEMBUS x J&T Express Aggregator', 'CODE128', 'A6', 'Sebelum Return Dimohon Untuk Konfirmasikan Dahulu ke Pengirim — Powered by TEMBUS Aggregator')
ON CONFLICT (model_type) DO NOTHING;

-- Seed default provider configs (Sandbox / Placeholder without hardcoding secrets in code)
INSERT INTO provider_configs (id, provider_code, provider_name, api_base_url, is_active, is_sandbox)
VALUES
    ('CFG-P2P', 'P2P', 'LANCAR Internal Armada P2P', 'http://routing-service:8084', TRUE, FALSE),
    ('CFG-JNE', 'JNE', 'JNE Express Reguler & YES', 'https://apiv2.jne.co.id', TRUE, TRUE),
    ('CFG-JNT', 'JNT', 'J&T Express VIP Indonesia', 'https://developer.jet.co.id', TRUE, TRUE)
ON CONFLICT (provider_code) DO NOTHING;
