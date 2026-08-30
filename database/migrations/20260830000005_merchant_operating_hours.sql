-- +goose Up
-- Jadwal mingguan dan penutupan khusus merchant. Konfigurasi lama jam_buka /
-- jam_tutup tetap dipertahankan sebagai fallback untuk merchant yang belum
-- menyimpan jadwal per hari dari aplikasi.
CREATE TABLE IF NOT EXISTS merchant_operating_hours (
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
    is_open BOOLEAN NOT NULL DEFAULT TRUE,
    opens_at TIME,
    closes_at TIME,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (merchant_id, weekday),
    CHECK (
        (is_open = FALSE AND opens_at IS NULL AND closes_at IS NULL)
        OR (is_open = TRUE AND opens_at IS NOT NULL AND closes_at IS NOT NULL AND opens_at <> closes_at)
    )
);

CREATE TABLE IF NOT EXISTS merchant_special_closures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    closure_date DATE NOT NULL,
    label VARCHAR(120) NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 120),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (merchant_id, closure_date)
);

CREATE INDEX IF NOT EXISTS idx_merchant_special_closures_date
    ON merchant_special_closures (merchant_id, closure_date);

-- +goose Down
DROP TABLE IF EXISTS merchant_special_closures;
DROP TABLE IF EXISTS merchant_operating_hours;
