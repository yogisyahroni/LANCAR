-- +goose Up
-- ============================================================
-- Migration 20260708000002: Data Retention Policies & Storage Stats
-- TEMBUS Hyperlocal Delivery Platform
-- ============================================================
-- Tabel yang tumbuh cepat di VPS:
--   courier_gps_logs     → GPS ping setiap 5-10 detik per kurir aktif
--   courier_locations    → Dikelola via partition DROP (migration 000001)
--   audit_logs           → Setiap aksi admin/user tercatat
--   sla_logs             → Setiap breach SLA
--   weather_logs         → Polling BMKG tiap beberapa menit
--   notifications        → Push notification inbox
--   package_scans        → Scan dimensi paket per order
--
-- Kebijakan Retensi:
--   courier_gps_logs (VALID)   → 30 hari
--   courier_gps_logs (SUSPEK)  → 90 hari (forensik)
--   audit_logs                 → 365 hari
--   sla_logs                   → 180 hari
--   weather_logs               → 7 hari
--   notifications (sudah dibaca) → 30 hari
--   notifications (belum dibaca) → 90 hari
--   package_scans              → 90 hari
-- ============================================================

-- ─────────────────────────────────────────────────────────────────
-- 1. Fungsi Monitoring: Cek ukuran & perkiraan pertumbuhan disk
-- ─────────────────────────────────────────────────────────────────
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION tembus_storage_stats()
RETURNS TABLE (
    table_name     TEXT,
    row_count      BIGINT,
    total_size     TEXT,
    index_size     TEXT,
    table_size     TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        relname::TEXT AS table_name,
        n_live_tup::BIGINT AS row_count,
        pg_size_pretty(pg_total_relation_size(quote_ident(relname))) AS total_size,
        pg_size_pretty(pg_indexes_size(quote_ident(relname))) AS index_size,
        pg_size_pretty(pg_relation_size(quote_ident(relname))) AS table_size
    FROM pg_stat_user_tables
    WHERE schemaname = 'public'
      AND relname IN (
        'courier_gps_logs', 'courier_locations', 'audit_logs',
        'sla_logs', 'weather_logs', 'notifications',
        'package_scans', 'orders', 'order_legs',
        'payments', 'relay_score_history'
      )
    ORDER BY pg_total_relation_size(quote_ident(relname)) DESC;
END;
$$ LANGUAGE plpgsql STABLE;
-- +goose StatementEnd

COMMENT ON FUNCTION tembus_storage_stats() IS
'Tampilkan ukuran tabel-tabel kritis di Tembus DB. Panggil untuk monitoring disk VPS.
Contoh: SELECT * FROM tembus_storage_stats();';

-- ─────────────────────────────────────────────────────────────────
-- 2. Fungsi Utama: Cleanup data kedaluwarsa
--    Paramater dry_run: jika TRUE, hanya tampilkan berapa baris
--    yang akan dihapus tanpa benar-benar menghapus.
-- ─────────────────────────────────────────────────────────────────
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION tembus_cleanup_old_data(
    dry_run BOOLEAN DEFAULT FALSE
) RETURNS TABLE (
    table_name       TEXT,
    rows_deleted     BIGINT,
    retention_rule   TEXT,
    cutoff_date      TIMESTAMPTZ
) AS $$
DECLARE
    v_rows_affected BIGINT;

    -- Batas waktu retensi
    cutoff_gps_valid     CONSTANT TIMESTAMPTZ := NOW() - INTERVAL '30 days';
    cutoff_gps_suspect   CONSTANT TIMESTAMPTZ := NOW() - INTERVAL '90 days';
    cutoff_audit         CONSTANT TIMESTAMPTZ := NOW() - INTERVAL '365 days';
    cutoff_sla           CONSTANT TIMESTAMPTZ := NOW() - INTERVAL '180 days';
    cutoff_weather       CONSTANT TIMESTAMPTZ := NOW() - INTERVAL '7 days';
    cutoff_notif_read    CONSTANT TIMESTAMPTZ := NOW() - INTERVAL '30 days';
    cutoff_notif_unread  CONSTANT TIMESTAMPTZ := NOW() - INTERVAL '90 days';
    cutoff_pkg_scan      CONSTANT TIMESTAMPTZ := NOW() - INTERVAL '90 days';
BEGIN

    -- ─── courier_gps_logs: GPS VALID → hapus setelah 30 hari ───────────
    IF dry_run THEN
        SELECT COUNT(*) INTO v_rows_affected
        FROM courier_gps_logs
        WHERE recorded_at < cutoff_gps_valid
          AND (risk_level = 'VALID' OR risk_level IS NULL);
    ELSE
        DELETE FROM courier_gps_logs
        WHERE recorded_at < cutoff_gps_valid
          AND (risk_level = 'VALID' OR risk_level IS NULL);
        GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
    END IF;
    RETURN QUERY SELECT 'courier_gps_logs (VALID)'::TEXT, v_rows_affected,
        'Hapus GPS VALID > 30 hari'::TEXT, cutoff_gps_valid;

    -- ─── courier_gps_logs: GPS SUSPECT/FAKE → hapus setelah 90 hari ────
    IF dry_run THEN
        SELECT COUNT(*) INTO v_rows_affected
        FROM courier_gps_logs
        WHERE recorded_at < cutoff_gps_suspect
          AND risk_level IN ('SUSPICIOUS', 'FAKE_GPS_DETECTED');
    ELSE
        DELETE FROM courier_gps_logs
        WHERE recorded_at < cutoff_gps_suspect
          AND risk_level IN ('SUSPICIOUS', 'FAKE_GPS_DETECTED');
        GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
    END IF;
    RETURN QUERY SELECT 'courier_gps_logs (SUSPECT/FAKE)'::TEXT, v_rows_affected,
        'Hapus GPS SUSPECT/FAKE > 90 hari'::TEXT, cutoff_gps_suspect;

    -- ─── audit_logs → hapus setelah 365 hari ────────────────────────────
    IF dry_run THEN
        SELECT COUNT(*) INTO v_rows_affected
        FROM audit_logs
        WHERE created_at < cutoff_audit;
    ELSE
        DELETE FROM audit_logs
        WHERE created_at < cutoff_audit;
        GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
    END IF;
    RETURN QUERY SELECT 'audit_logs'::TEXT, v_rows_affected,
        'Hapus audit log > 365 hari'::TEXT, cutoff_audit;

    -- ─── sla_logs → hapus setelah 180 hari ──────────────────────────────
    IF dry_run THEN
        SELECT COUNT(*) INTO v_rows_affected
        FROM sla_logs
        WHERE created_at < cutoff_sla;
    ELSE
        DELETE FROM sla_logs
        WHERE created_at < cutoff_sla;
        GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
    END IF;
    RETURN QUERY SELECT 'sla_logs'::TEXT, v_rows_affected,
        'Hapus SLA log > 180 hari'::TEXT, cutoff_sla;

    -- ─── weather_logs → hapus setelah 7 hari ────────────────────────────
    IF dry_run THEN
        SELECT COUNT(*) INTO v_rows_affected
        FROM weather_logs
        WHERE created_at < cutoff_weather;
    ELSE
        DELETE FROM weather_logs
        WHERE created_at < cutoff_weather;
        GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
    END IF;
    RETURN QUERY SELECT 'weather_logs'::TEXT, v_rows_affected,
        'Hapus weather log > 7 hari'::TEXT, cutoff_weather;

    -- ─── notifications (sudah dibaca) → hapus setelah 30 hari ──────────
    IF dry_run THEN
        SELECT COUNT(*) INTO v_rows_affected
        FROM notifications
        WHERE is_read = TRUE
          AND (read_at < cutoff_notif_read OR created_at < cutoff_notif_read);
    ELSE
        DELETE FROM notifications
        WHERE is_read = TRUE
          AND (read_at < cutoff_notif_read OR created_at < cutoff_notif_read);
        GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
    END IF;
    RETURN QUERY SELECT 'notifications (sudah dibaca)'::TEXT, v_rows_affected,
        'Hapus notifikasi dibaca > 30 hari'::TEXT, cutoff_notif_read;

    -- ─── notifications (belum dibaca) → hapus setelah 90 hari ──────────
    IF dry_run THEN
        SELECT COUNT(*) INTO v_rows_affected
        FROM notifications
        WHERE is_read = FALSE
          AND created_at < cutoff_notif_unread;
    ELSE
        DELETE FROM notifications
        WHERE is_read = FALSE
          AND created_at < cutoff_notif_unread;
        GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
    END IF;
    RETURN QUERY SELECT 'notifications (belum dibaca)'::TEXT, v_rows_affected,
        'Hapus notifikasi belum dibaca > 90 hari'::TEXT, cutoff_notif_unread;

    -- ─── package_scans → hapus setelah 90 hari ──────────────────────────
    IF dry_run THEN
        SELECT COUNT(*) INTO v_rows_affected
        FROM package_scans
        WHERE created_at < cutoff_pkg_scan;
    ELSE
        DELETE FROM package_scans
        WHERE created_at < cutoff_pkg_scan;
        GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
    END IF;
    RETURN QUERY SELECT 'package_scans'::TEXT, v_rows_affected,
        'Hapus package scan > 90 hari'::TEXT, cutoff_pkg_scan;

END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd

COMMENT ON FUNCTION tembus_cleanup_old_data(BOOLEAN) IS
'Hapus data kedaluwarsa dari tabel-tabel berukuran besar.
Gunakan dry_run=TRUE untuk preview sebelum eksekusi.

Contoh dry run (hanya tampilkan jumlah baris):
  SELECT * FROM tembus_cleanup_old_data(dry_run := TRUE);

Eksekusi nyata:
  SELECT * FROM tembus_cleanup_old_data(dry_run := FALSE);

Dijalankan otomatis oleh cron VPS lewat scripts/db-maintenance.sh';

-- ─────────────────────────────────────────────────────────────────
-- 3. Fungsi: Drop partisi courier_locations yang sudah kedaluwarsa
--    (Jauh lebih efisien daripada DELETE — tidak ada bloat, instan)
-- ─────────────────────────────────────────────────────────────────
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION tembus_drop_old_location_partitions(
    retain_months INT DEFAULT 2,
    dry_run       BOOLEAN DEFAULT FALSE
) RETURNS TABLE (
    partition_name   TEXT,
    action           TEXT
) AS $$
DECLARE
    rec RECORD;
    cutoff_date DATE;
BEGIN
    -- Hitung tanggal cutoff: awal bulan N bulan yang lalu
    cutoff_date := date_trunc('month', NOW()) - (retain_months || ' months')::INTERVAL;

    FOR rec IN
        SELECT
            child.relname AS pname,
            pg_get_expr(child.relpartbound, child.oid) AS partition_expr
        FROM pg_inherits
        JOIN pg_class parent ON pg_inherits.inhparent = parent.oid
        JOIN pg_class child  ON pg_inherits.inhrelid  = child.oid
        WHERE parent.relname = 'courier_locations'
          AND child.relname  != 'courier_locations_default'
          AND child.relname  LIKE 'courier_locations_%'
    LOOP
        -- Ekstrak bulan dari nama partisi: courier_locations_2026_05 → 2026-05
        DECLARE
            part_year  INT;
            part_month INT;
            part_date  DATE;
        BEGIN
            -- Nama format: courier_locations_YYYY_MM
            part_year  := (regexp_match(rec.pname, '_(\d{4})_(\d{2})$'))[1]::INT;
            part_month := (regexp_match(rec.pname, '_(\d{4})_(\d{2})$'))[2]::INT;
            part_date  := make_date(part_year, part_month, 1);

            IF part_date < cutoff_date THEN
                IF dry_run THEN
                    RETURN QUERY SELECT rec.pname::TEXT, 'AKAN DIHAPUS (dry_run)'::TEXT;
                ELSE
                    EXECUTE format('DROP TABLE IF EXISTS %I', rec.pname);
                    RETURN QUERY SELECT rec.pname::TEXT, 'DIHAPUS'::TEXT;
                END IF;
            ELSE
                RETURN QUERY SELECT rec.pname::TEXT, 'DIPERTAHANKAN'::TEXT;
            END IF;
        END;
    END LOOP;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd

COMMENT ON FUNCTION tembus_drop_old_location_partitions(INT, BOOLEAN) IS
'Hapus partisi courier_locations yang lebih tua dari N bulan.
DROP TABLE jauh lebih efisien daripada DELETE row per row!

Contoh — preview partisi yang akan dihapus (simpan 2 bulan terakhir):
  SELECT * FROM tembus_drop_old_location_partitions(retain_months := 2, dry_run := TRUE);

Eksekusi — hapus partisi lebih dari 2 bulan lalu:
  SELECT * FROM tembus_drop_old_location_partitions(retain_months := 2, dry_run := FALSE);';

-- +goose Down
DROP FUNCTION IF EXISTS tembus_drop_old_location_partitions(INT, BOOLEAN);
DROP FUNCTION IF EXISTS tembus_cleanup_old_data(BOOLEAN);
DROP FUNCTION IF EXISTS tembus_storage_stats();
