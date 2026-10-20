-- RESI-2026-001: make the resi template schema used by the designer and
-- renderer canonical, including safe conversion from the legacy 3PL table.

-- +goose Up

CREATE TABLE IF NOT EXISTS resi_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    paper_size VARCHAR(50) NOT NULL DEFAULT 'A6',
    layout_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true,
    provider_code VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Older environments created this table from the admin-service migration
-- 008_super_aggregator_3pl.sql. Add the canonical columns in place so data is
-- preserved instead of dropping the templates during deployment.
ALTER TABLE resi_templates
    ADD COLUMN IF NOT EXISTS name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS layout_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS provider_code VARCHAR(50);

-- +goose StatementBegin
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'resi_templates' AND column_name = 'template_name'
    ) THEN
        UPDATE resi_templates
        SET name = COALESCE(NULLIF(name, ''), NULLIF(template_name, ''), id::text)
        WHERE name IS NULL OR name = '';
    ELSE
        UPDATE resi_templates
        SET name = COALESCE(NULLIF(name, ''), id::text)
        WHERE name IS NULL OR name = '';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'resi_templates' AND column_name = 'model_type'
    ) THEN
        UPDATE resi_templates
        SET provider_code = CASE
            WHEN provider_code IS NOT NULL AND provider_code <> '' THEN lower(provider_code)
            WHEN lower(model_type) IN ('general_3pl', 'default', 'all') THEN NULL
            ELSE lower(model_type)
        END
        WHERE provider_code IS NULL OR provider_code = '';
    ELSE
        UPDATE resi_templates
        SET provider_code = NULLIF(lower(provider_code), '')
        WHERE provider_code IS NOT NULL;
    END IF;
END $$;
-- +goose StatementEnd

UPDATE resi_templates
SET paper_size = COALESCE(NULLIF(paper_size, ''), 'A6');

-- Legacy-only columns are retained for backward compatibility but must not
-- block inserts made by the canonical designer API.
-- +goose StatementBegin
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'resi_templates' AND column_name = 'model_type'
    ) THEN
        ALTER TABLE resi_templates ALTER COLUMN model_type DROP NOT NULL;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'resi_templates' AND column_name = 'template_name'
    ) THEN
        ALTER TABLE resi_templates ALTER COLUMN template_name DROP NOT NULL;
    END IF;
END $$;
-- +goose StatementEnd

-- Give legacy rows a usable layout instead of making them render as an empty
-- document. Existing canonical layouts are left untouched.
UPDATE resi_templates
SET layout_config = jsonb_build_object(
    'layout', 'standard',
    'elements', jsonb_build_array(
        jsonb_build_object('id', id::text || '-awb', 'type', 'text', 'x', 12, 'y', 12, 'value', 'No. Resi: {{awb_number}}', 'fontSize', 14, 'fontWeight', 'bold'),
        jsonb_build_object('id', id::text || '-barcode', 'type', 'barcode', 'x', 12, 'y', 40, 'value', '{{awb_number}}', 'width', 240, 'height', 52, 'barWidth', 1.5),
        jsonb_build_object('id', id::text || '-receiver', 'type', 'text', 'x', 12, 'y', 108, 'value', '{{receiver_name}}', 'fontSize', 13, 'fontWeight', 'bold'),
        jsonb_build_object('id', id::text || '-address', 'type', 'text', 'x', 12, 'y', 130, 'value', '{{receiver_address}}', 'fontSize', 10),
        jsonb_build_object('id', id::text || '-qr', 'type', 'qrcode', 'x', 12, 'y', 190, 'value', '{{tracking_url}}', 'width', 88, 'height', 88)
    )
)
WHERE layout_config IS NULL OR layout_config = '{}'::jsonb OR NOT (layout_config ? 'elements');

ALTER TABLE resi_templates
    ALTER COLUMN name SET NOT NULL,
    ALTER COLUMN paper_size SET DEFAULT 'A6',
    ALTER COLUMN paper_size SET NOT NULL,
    ALTER COLUMN layout_config SET DEFAULT '{}'::jsonb,
    ALTER COLUMN layout_config SET NOT NULL,
    ALTER COLUMN is_active SET DEFAULT true,
    ALTER COLUMN is_active SET NOT NULL;

-- Resolve pre-existing duplicates before enforcing the one-active-template
-- invariant. The newest template remains active for each provider/default.
WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY lower(COALESCE(provider_code, '__default__'))
               ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id::text DESC
           ) AS rank_no
    FROM resi_templates
    WHERE is_active = true
)
UPDATE resi_templates AS template
SET is_active = false,
    updated_at = NOW()
FROM ranked
WHERE template.id = ranked.id
  AND ranked.rank_no > 1;

CREATE INDEX IF NOT EXISTS idx_resi_templates_is_active
    ON resi_templates (is_active);

CREATE UNIQUE INDEX IF NOT EXISTS uq_resi_templates_one_active_provider
    ON resi_templates (lower(COALESCE(provider_code, '__default__')))
    WHERE is_active = true;

-- +goose Down

-- The canonical columns are shared by the admin and order services. They are
-- intentionally retained on rollback; removing them would make the running
-- application unreadable. The active-template invariant is the reversible part
-- of this migration.
DROP INDEX IF EXISTS uq_resi_templates_one_active_provider;
