#!/usr/bin/env bash
# ============================================================
# db-maintenance.sh — Tembus DB Maintenance Script
# Jalankan di VPS via cron untuk menjaga kesehatan database
#
# Setup cron (jalankan setiap tanggal 1, jam 02:00 WIB):
#   crontab -e
#   0 19 1 * * /opt/tembus/scripts/db-maintenance.sh >> /var/log/tembus-db-maintenance.log 2>&1
#   (19:00 UTC = 02:00 WIB keesokan harinya)
#
# Manual run:
#   chmod +x scripts/db-maintenance.sh
#   ./scripts/db-maintenance.sh
#
# Dry run (preview tanpa hapus data):
#   DRY_RUN=true ./scripts/db-maintenance.sh
# ============================================================

set -euo pipefail

# ─────────────────────────────────────────────────────────────
# Konfigurasi — sesuaikan dengan environment VPS
# ─────────────────────────────────────────────────────────────
CONTAINER_NAME="${DB_CONTAINER:-tembus-db}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_DB="${POSTGRES_DB:-tembus}"
DRY_RUN="${DRY_RUN:-false}"
MONTHS_AHEAD="${MONTHS_AHEAD:-3}"       # Partisi berapa bulan ke depan
RETAIN_LOCATION_MONTHS="${RETAIN_LOCATION_MONTHS:-2}"  # Simpan partisi GPS berapa bulan

# ─────────────────────────────────────────────────────────────
# Fungsi helper
# ─────────────────────────────────────────────────────────────
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S WIB')] $*"
}

psql_exec() {
    docker exec -i "${CONTAINER_NAME}" \
        psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" \
        --no-psqlrc -A -t \
        -c "$1"
}

check_container() {
    if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        log "ERROR: Container ${CONTAINER_NAME} tidak ditemukan atau tidak running!"
        exit 1
    fi
}

# ─────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────
log "============================================================"
log "Tembus DB Maintenance dimulai (DRY_RUN=${DRY_RUN})"
log "============================================================"

# 1. Pastikan container berjalan
log "Memeriksa status container ${CONTAINER_NAME}..."
check_container
log "Container OK ✓"

# 2. Tampilkan ukuran database sebelum maintenance
log ""
log "--- Ukuran Database SEBELUM Maintenance ---"
psql_exec "SELECT table_name, row_count, total_size FROM tembus_storage_stats();" || true

# 3. Buat partisi bulan-bulan mendatang (idempoten, aman dijalankan berkali-kali)
log ""
log "--- Membuat partisi courier_locations untuk ${MONTHS_AHEAD} bulan ke depan ---"
psql_exec "SELECT partition_name, partition_range, status FROM tembus_create_monthly_partitions(${MONTHS_AHEAD});"

# 4. Hapus partisi GPS lama (DROP TABLE = instan, tanpa bloat)
log ""
if [ "${DRY_RUN}" = "true" ]; then
    log "--- DRY RUN: Preview partisi yang AKAN dihapus (simpan ${RETAIN_LOCATION_MONTHS} bulan) ---"
    psql_exec "SELECT partition_name, action FROM tembus_drop_old_location_partitions(retain_months := ${RETAIN_LOCATION_MONTHS}, dry_run := TRUE);"
else
    log "--- Menghapus partisi courier_locations lebih dari ${RETAIN_LOCATION_MONTHS} bulan lalu ---"
    psql_exec "SELECT partition_name, action FROM tembus_drop_old_location_partitions(retain_months := ${RETAIN_LOCATION_MONTHS}, dry_run := FALSE);"
fi

# 5. Hapus data kedaluwarsa dari tabel non-partisi
log ""
if [ "${DRY_RUN}" = "true" ]; then
    log "--- DRY RUN: Preview baris yang AKAN dihapus ---"
    psql_exec "SELECT table_name, rows_deleted, retention_rule, cutoff_date::date FROM tembus_cleanup_old_data(dry_run := TRUE);"
else
    log "--- Menghapus data kedaluwarsa... ---"
    psql_exec "SELECT table_name, rows_deleted, retention_rule, cutoff_date::date FROM tembus_cleanup_old_data(dry_run := FALSE);"
fi

# 6. Jalankan VACUUM ANALYZE pada tabel-tabel yang baru dibersihkan
if [ "${DRY_RUN}" = "false" ]; then
    log ""
    log "--- Menjalankan VACUUM ANALYZE untuk merefresh statistik query planner ---"
    psql_exec "VACUUM ANALYZE courier_gps_logs;"        || log "WARN: VACUUM courier_gps_logs gagal (mungkin belum ada)"
    psql_exec "VACUUM ANALYZE audit_logs;"              || log "WARN: VACUUM audit_logs gagal"
    psql_exec "VACUUM ANALYZE sla_logs;"               || log "WARN: VACUUM sla_logs gagal"
    psql_exec "VACUUM ANALYZE weather_logs;"           || log "WARN: VACUUM weather_logs gagal"
    psql_exec "VACUUM ANALYZE notifications;"          || log "WARN: VACUUM notifications gagal"
    psql_exec "VACUUM ANALYZE package_scans;"          || log "WARN: VACUUM package_scans gagal"
    log "VACUUM ANALYZE selesai ✓"
fi

# 7. Refresh materialized views (dashboard analytics)
if [ "${DRY_RUN}" = "false" ]; then
    log ""
    log "--- Refresh Materialized Views Analytics ---"
    psql_exec "REFRESH MATERIALIZED VIEW CONCURRENTLY mv_daily_revenue;"    || log "WARN: mv_daily_revenue gagal"
    psql_exec "REFRESH MATERIALIZED VIEW CONCURRENTLY mv_sla_compliance;"   || log "WARN: mv_sla_compliance gagal"
    log "Materialized views refreshed ✓"
fi

# 8. Tampilkan ukuran database sesudah maintenance
log ""
log "--- Ukuran Database SESUDAH Maintenance ---"
psql_exec "SELECT table_name, row_count, total_size FROM tembus_storage_stats();" || true

# 9. Cek koneksi aktif via PgBouncer
log ""
log "--- Status Koneksi Database ---"
psql_exec "SELECT count(*) as total_conn, state, wait_event_type FROM pg_stat_activity WHERE datname='${POSTGRES_DB}' GROUP BY state, wait_event_type ORDER BY total_conn DESC;" || true

log ""
log "============================================================"
log "Tembus DB Maintenance SELESAI ✓"
log "============================================================"
