-- +goose Up
-- ============================================================
-- Migration 20260708000003: Auto-Create Future Partitions
-- TEMBUS Hyperlocal Delivery Platform
-- ============================================================
-- Fungsi ini secara otomatis membuat partisi courier_locations
-- untuk N bulan ke depan. Dipanggil oleh script cron VPS
-- setiap awal bulan agar partisi selalu siap tersedia.
-- ============================================================

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION tembus_create_monthly_partitions(
    months_ahead INT DEFAULT 3
) RETURNS TABLE (
    partition_name   TEXT,
    partition_range  TEXT,
    status           TEXT
) AS $$
DECLARE
    i INT;
    target_month DATE;
    next_month   DATE;
    part_name    TEXT;
    part_exists  BOOLEAN;
BEGIN
    FOR i IN 0..months_ahead LOOP
        -- Hitung bulan target dari sekarang
        target_month := date_trunc('month', NOW()) + (i || ' months')::INTERVAL;
        next_month   := target_month + INTERVAL '1 month';

        -- Nama partisi: courier_locations_YYYY_MM
        part_name := 'courier_locations_' ||
                     to_char(target_month, 'YYYY') || '_' ||
                     to_char(target_month, 'MM');

        -- Cek apakah partisi sudah ada
        SELECT EXISTS (
            SELECT 1 FROM pg_class
            WHERE relname = part_name
              AND relkind IN ('r', 'p')
        ) INTO part_exists;

        IF part_exists THEN
            RETURN QUERY SELECT
                part_name::TEXT,
                (to_char(target_month, 'YYYY-MM-DD') || ' s/d ' || to_char(next_month, 'YYYY-MM-DD'))::TEXT,
                'SUDAH ADA'::TEXT;
        ELSE
            -- Buat partisi baru
            EXECUTE format(
                'CREATE TABLE IF NOT EXISTS %I
                 PARTITION OF courier_locations
                 FOR VALUES FROM (%L) TO (%L)',
                part_name,
                target_month::TEXT,
                next_month::TEXT
            );

            -- Buat index lokal untuk partisi baru
            EXECUTE format(
                'CREATE INDEX IF NOT EXISTS %I ON %I USING GIST(location)',
                'idx_' || part_name || '_spatial',
                part_name
            );
            EXECUTE format(
                'CREATE INDEX IF NOT EXISTS %I ON %I (courier_id, recorded_at DESC)',
                'idx_' || part_name || '_courier_time',
                part_name
            );

            RETURN QUERY SELECT
                part_name::TEXT,
                (to_char(target_month, 'YYYY-MM-DD') || ' s/d ' || to_char(next_month, 'YYYY-MM-DD'))::TEXT,
                'DIBUAT BARU'::TEXT;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd

COMMENT ON FUNCTION tembus_create_monthly_partitions(INT) IS
'Buat partisi courier_locations untuk N bulan ke depan secara otomatis.
Fungsi ini IDEMPOTEN: aman dipanggil berkali-kali (skip jika sudah ada).

Contoh — buat partisi untuk 3 bulan ke depan:
  SELECT * FROM tembus_create_monthly_partitions(3);

Contoh — preview status semua partisi 6 bulan ke depan:
  SELECT * FROM tembus_create_monthly_partitions(6);

Jadwalkan di cron VPS (setiap tanggal 1 jam 00:05):
  5 0 1 * * /opt/tembus/scripts/db-maintenance.sh >> /var/log/tembus-db-maintenance.log 2>&1';


-- ─────────────────────────────────────────────────────────────────
-- Jalankan sekali saat migration ini dieksekusi:
-- Pastikan partisi tersedia untuk 6 bulan ke depan.
-- ─────────────────────────────────────────────────────────────────
SELECT * FROM tembus_create_monthly_partitions(6);


-- +goose Down
DROP FUNCTION IF EXISTS tembus_create_monthly_partitions(INT);
