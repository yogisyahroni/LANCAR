-- 20260706000004_create_resi_templates.sql

-- +goose Up
CREATE TABLE IF NOT EXISTS resi_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    paper_size VARCHAR(50) NOT NULL DEFAULT 'A6',
    layout_config JSONB NOT NULL DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_resi_templates_is_active ON resi_templates(is_active);

INSERT INTO resi_templates (id, name, paper_size, layout_config, is_active)
VALUES (
    'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    'Default A6 Resi',
    'A6',
    '{"elements": [{"type": "text", "value": "{{awb_number}}", "x": 10, "y": 10}, {"type": "barcode", "value": "{{awb_number}}", "x": 10, "y": 30}]}',
    true
)
ON CONFLICT DO NOTHING;

-- +goose Down
DROP TABLE IF EXISTS resi_templates;
