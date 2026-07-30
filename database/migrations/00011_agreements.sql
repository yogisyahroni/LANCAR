-- +goose Up
-- ============================================================
-- Migration 00011: Agreement Records + agreed_to_terms flags
-- Stores signed legal agreements (TOS, Perjanjian Mitra, Privacy)
-- ============================================================

-- Create agreement types enum
DO $$ BEGIN
    CREATE TYPE agreement_type AS ENUM (
        'mitra_agreement',      -- Perjanjian Mitra Kurir
        'customer_tos',         -- Syarat & Ketentuan Pengguna
        'privacy_policy'        -- Kebijakan Privasi
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Create agreements table
CREATE TABLE IF NOT EXISTS agreements (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL,
    user_type       VARCHAR(20) NOT NULL CHECK (user_type IN ('courier', 'customer')),
    agreement_type  agreement_type NOT NULL,
    agreed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    agreed_ip       INET,
    user_agent      TEXT,
    pdf_path        TEXT,
    html_content    TEXT,
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for querying agreements
CREATE INDEX idx_agreements_user_id ON agreements(user_id);
CREATE INDEX idx_agreements_user_type ON agreements(user_type);
CREATE INDEX idx_agreements_type ON agreements(agreement_type);
CREATE INDEX idx_agreements_agreed_at ON agreements(agreed_at DESC);

-- Add agreed_to_terms column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS agreed_to_terms BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS agreed_to_terms_at TIMESTAMPTZ;

-- +goose Down
DROP TABLE IF EXISTS agreements;
DROP TYPE IF EXISTS agreement_type;
ALTER TABLE users DROP COLUMN IF EXISTS agreed_to_terms;
ALTER TABLE users DROP COLUMN IF EXISTS agreed_to_terms_at;
