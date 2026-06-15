-- +goose Up
-- database/migrations/20260616000001_business_api_requests.sql

CREATE TABLE IF NOT EXISTS business_api_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name VARCHAR(255) NOT NULL,
    company_website VARCHAR(255),
    contact_name VARCHAR(255) NOT NULL,
    contact_email VARCHAR(255) NOT NULL,
    contact_phone VARCHAR(50),
    monthly_volume VARCHAR(100),
    use_case TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING', -- PENDING, APPROVED, REJECTED
    reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_business_api_requests_status ON business_api_requests(status);
CREATE INDEX IF NOT EXISTS idx_business_api_requests_created_at ON business_api_requests(created_at);
CREATE INDEX IF NOT EXISTS idx_business_api_requests_contact_email ON business_api_requests(contact_email);

-- +goose Down
DROP INDEX IF EXISTS idx_business_api_requests_contact_email;
DROP INDEX IF EXISTS idx_business_api_requests_created_at;
DROP INDEX IF EXISTS idx_business_api_requests_status;
DROP TABLE IF EXISTS business_api_requests;
