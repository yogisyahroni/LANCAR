-- +goose Up
-- Bug fix: seed JNE dan J&T ke logistics_providers agar admin bisa manage mereka
-- Kolom priority diperlukan oleh admin API (GET /admin/logistics-providers)
ALTER TABLE logistics_providers ADD COLUMN IF NOT EXISTS priority INT DEFAULT 0;

INSERT INTO logistics_providers (code, name, is_active, priority, discount_pct, markup_pct)
VALUES
    ('jne',  'JNE Express',   TRUE, 1, 0.00, 0.00),
    ('jnt',  'J&T Express',   TRUE, 2, 0.00, 0.00),
    ('sicepat', 'SiCepat',    FALSE, 3, 0.00, 0.00),
    ('anteraja', 'AnterAja',  FALSE, 4, 0.00, 0.00)
ON CONFLICT (code) DO UPDATE
    SET name        = EXCLUDED.name,
        updated_at  = NOW();

-- +goose Down
DELETE FROM logistics_providers WHERE code IN ('jne', 'jnt', 'sicepat', 'anteraja');
ALTER TABLE logistics_providers DROP COLUMN IF EXISTS priority;
