-- Up
CREATE TABLE IF NOT EXISTS logistics_providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    api_base_url VARCHAR(255),
    api_key VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS provider_services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID REFERENCES logistics_providers(id) ON DELETE CASCADE,
    service_code VARCHAR(50) NOT NULL,
    service_name VARCHAR(100) NOT NULL,
    description TEXT,
    base_rate DECIMAL(15, 2) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(provider_id, service_code)
);

CREATE TABLE IF NOT EXISTS routing_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID REFERENCES logistics_providers(id) ON DELETE CASCADE,
    origin_zone VARCHAR(100) NOT NULL,
    destination_zone VARCHAR(100) NOT NULL,
    priority INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Down
DROP TABLE IF EXISTS routing_rules;
DROP TABLE IF EXISTS provider_services;
DROP TABLE IF EXISTS logistics_providers;
