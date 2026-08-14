-- +goose Up
-- A4: Global banner (pengumuman in-app platform-wide).
-- Admin super_admin publish banner yang tampil di home customer app.
CREATE TABLE IF NOT EXISTS global_banners (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title       VARCHAR(120) NOT NULL,
    message     TEXT NOT NULL,
    image_url   VARCHAR(512),
    action_url  VARCHAR(512),
    action_label VARCHAR(64),
    -- priority tinggi tampil lebih dulu; hanya 1 active ber-priority tertinggi
    -- yang diambil customer (atau semua active diurutkan priority desc).
    priority    INT NOT NULL DEFAULT 0,
    status      VARCHAR(20) NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'inactive')),
    created_by  UUID REFERENCES users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_global_banners_status ON global_banners(status, priority DESC);

-- +goose Down

DROP TABLE IF EXISTS global_banners;
