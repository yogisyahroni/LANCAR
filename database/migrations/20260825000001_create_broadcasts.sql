-- +goose Up
-- Broadcast Center (Roadmap 10.3 — BC-1/BC-5/BC-6)
-- broadcasts: kampanye notifikasi massal (draft/scheduled/send-now)
-- broadcast_recipients: audit detail per-penerima + opened tracking

CREATE TABLE IF NOT EXISTS broadcasts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title           VARCHAR(60) NOT NULL,
    body            VARCHAR(500) NOT NULL,
    image_url       TEXT,
    deep_link       TEXT,
    category        VARCHAR(20) NOT NULL DEFAULT 'system'
        CHECK (category IN ('system','promo','support','activity','message')),
    priority        VARCHAR(10) NOT NULL DEFAULT 'normal'
        CHECK (priority IN ('low','normal','high','urgent')),
    channels        JSONB NOT NULL DEFAULT '["push","in_app"]'::jsonb,
    target_type     VARCHAR(20) NOT NULL DEFAULT 'all'
        CHECK (target_type IN ('all','online','filter','manual')),
    target_filter   JSONB,
    status          VARCHAR(20) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft','scheduled','sending','sent','cancelled','failed')),
    total_targets   INT NOT NULL DEFAULT 0,
    sent_count      INT NOT NULL DEFAULT 0,
    failed_count    INT NOT NULL DEFAULT 0,
    opened_count    INT NOT NULL DEFAULT 0,
    scheduled_at    TIMESTAMPTZ,
    sent_at         TIMESTAMPTZ,
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_broadcasts_status_scheduled
    ON broadcasts(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_broadcasts_created_by
    ON broadcasts(created_by, created_at DESC);

CREATE TABLE IF NOT EXISTS broadcast_recipients (
    id             BIGSERIAL PRIMARY KEY,
    broadcast_id   UUID NOT NULL REFERENCES broadcasts(id) ON DELETE CASCADE,
    user_id        UUID NOT NULL REFERENCES users(id),
    channel        VARCHAR(30) NOT NULL DEFAULT 'in_app',
    status         VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','sent','failed','opened')),
    error_code     TEXT,
    sent_at        TIMESTAMPTZ,
    opened_at      TIMESTAMPTZ,
    UNIQUE(broadcast_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_broadcast
    ON broadcast_recipients(broadcast_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_status
    ON broadcast_recipients(status);
CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_user
    ON broadcast_recipients(user_id);

-- Auto-update trigger (konvensi: fungsi per-tabel, lihat 20260709000001_merchant_settlement_system.sql)
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION update_broadcasts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd

DROP TRIGGER IF EXISTS trg_broadcasts_updated_at ON broadcasts;
CREATE TRIGGER trg_broadcasts_updated_at
    BEFORE UPDATE ON broadcasts
    FOR EACH ROW
    EXECUTE FUNCTION update_broadcasts_updated_at();

-- +goose Down
DROP TRIGGER IF EXISTS trg_broadcasts_updated_at ON broadcasts;
DROP FUNCTION IF EXISTS update_broadcasts_updated_at();
DROP INDEX IF EXISTS idx_broadcast_recipients_user;
DROP INDEX IF EXISTS idx_broadcast_recipients_status;
DROP INDEX IF EXISTS idx_broadcast_recipients_broadcast;
DROP TABLE IF EXISTS broadcast_recipients;
DROP INDEX IF EXISTS idx_broadcasts_created_by;
DROP INDEX IF EXISTS idx_broadcasts_status_scheduled;
DROP TABLE IF EXISTS broadcasts;
