#!/bin/bash
# =============================================================================
# TEMBUS Database Backup & Restore Script
# =============================================================================
# Configuration via environment variables (no hardcoded values):
#   BACKUP_DATABASE_URL      — PostgreSQL connection string (required)
#   BACKUP_S3_BUCKET         — S3 bucket for remote backups (optional)
#   BACKUP_S3_ENDPOINT       — S3-compatible endpoint (optional, for R2/MinIO)
#   BACKUP_RETENTION_DAYS    — local backup retention (default: 7)
#   BACKUP_S3_RETENTION_DAYS — s3 backup retention (default: 30)
#   BACKUP_SCHEDULE_CRON     — cron expression for scheduling (default: daily 2am)
#   BACKUP_ENCRYPT_PASSWORD  — if set, encrypts backup with openssl aes-256-cbc
#   BACKUP_DIR               — local backup directory (default: ./backups)
#
# Usage:
#   ./backup.sh              — run backup now
#   ./backup.sh restore FILE — restore from backup file
#   ./backup.sh schedule     — install cron job
# =============================================================================
set -euo pipefail

# ── Config (all from env, no hardcode) ───────────────────────────────
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"
S3_RETENTION_DAYS="${BACKUP_S3_RETENTION_DAYS:-30}"
CRON_SCHEDULE="${BACKUP_SCHEDULE_CRON:-0 2 * * *}"  # daily 2am
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/tembus_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

# ── Backup ───────────────────────────────────────────────────────────
do_backup() {
    echo "[backup] Starting backup at $(date)"

    if [ -z "${BACKUP_DATABASE_URL:-}" ]; then
        echo "[backup] ERROR: BACKUP_DATABASE_URL is required"
        exit 1
    fi

    # Extract connection parts from DATABASE_URL
    # Format: postgres://user:pass@host:port/dbname
    DB_URL="$BACKUP_DATABASE_URL"

    echo "[backup] Dumping database..."
    pg_dump "$DB_URL" --no-owner --no-acl | gzip > "$BACKUP_FILE"

    SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    echo "[backup] Backup created: $BACKUP_FILE ($SIZE)"

    # Encrypt if password is set
    if [ -n "${BACKUP_ENCRYPT_PASSWORD:-}" ]; then
        echo "[backup] Encrypting backup..."
        openssl enc -aes-256-cbc -salt -pbkdf2 \
            -in "$BACKUP_FILE" \
            -out "${BACKUP_FILE}.enc" \
            -pass pass:"$BACKUP_ENCRYPT_PASSWORD"
        rm "$BACKUP_FILE"
        BACKUP_FILE="${BACKUP_FILE}.enc"
        echo "[backup] Encrypted: $BACKUP_FILE"
    fi

    # Upload to S3 if configured
    if [ -n "${BACKUP_S3_BUCKET:-}" ]; then
        echo "[backup] Uploading to S3..."
        S3_PATH="s3://${BACKUP_S3_BUCKET}/backups/$(basename $BACKUP_FILE)"

        if [ -n "${BACKUP_S3_ENDPOINT:-}" ]; then
            aws s3 cp "$BACKUP_FILE" "$S3_PATH" \
                --endpoint-url "$BACKUP_S3_ENDPOINT" \
                --storage-class STANDARD_IA
        else
            aws s3 cp "$BACKUP_FILE" "$S3_PATH" \
                --storage-class STANDARD_IA
        fi
        echo "[backup] Uploaded to $S3_PATH"
    fi

    # Cleanup old local backups
    echo "[backup] Cleaning up backups older than $RETENTION_DAYS days..."
    find "$BACKUP_DIR" -name "tembus_*.sql.gz*" -mtime "+$RETENTION_DAYS" -delete 2>/dev/null || true

    # Cleanup old S3 backups
    if [ -n "${BACKUP_S3_BUCKET:-}" ]; then
        CUTOFF=$(date -d "$S3_RETENTION_DAYS days ago" +%Y-%m-%d)
        if [ -n "${BACKUP_S3_ENDPOINT:-}" ]; then
            aws s3 ls "s3://${BACKUP_S3_BUCKET}/backups/" --endpoint-url "$BACKUP_S3_ENDPOINT" | while read -r line; do
                FILE_DATE=$(echo "$line" | awk '{print $1}')
                FILE_NAME=$(echo "$line" | awk '{print $4}')
                if [[ "$FILE_DATE" < "$CUTOFF" ]]; then
                    aws s3 rm "s3://${BACKUP_S3_BUCKET}/backups/$FILE_NAME" --endpoint-url "$BACKUP_S3_ENDPOINT"
                    echo "[backup] Deleted old S3 backup: $FILE_NAME"
                fi
            done
        fi
    fi

    echo "[backup] Complete at $(date)"
}

# ── Restore ──────────────────────────────────────────────────────────
do_restore() {
    RESTORE_FILE="$1"

    if [ ! -f "$RESTORE_FILE" ]; then
        echo "[restore] ERROR: File not found: $RESTORE_FILE"
        exit 1
    fi

    if [ -z "${BACKUP_DATABASE_URL:-}" ]; then
        echo "[restore] ERROR: BACKUP_DATABASE_URL is required"
        exit 1
    fi

    echo "[restore] Restoring from $RESTORE_FILE..."

    if [[ "$RESTORE_FILE" == *.enc ]]; then
        if [ -z "${BACKUP_ENCRYPT_PASSWORD:-}" ]; then
            echo "[restore] ERROR: BACKUP_ENCRYPT_PASSWORD required for encrypted backup"
            exit 1
        fi
        openssl enc -aes-256-cbc -d -salt -pbkdf2 \
            -in "$RESTORE_FILE" \
            -pass pass:"$BACKUP_ENCRYPT_PASSWORD" | \
            gunzip | psql "$BACKUP_DATABASE_URL"
    else
        gunzip -c "$RESTORE_FILE" | psql "$BACKUP_DATABASE_URL"
    fi

    echo "[restore] Complete"
}

# ── Schedule ─────────────────────────────────────────────────────────
do_schedule() {
    SCRIPT_PATH="$(realpath "$0")"
    CRON_ENTRY="$CRON_SCHEDULE cd $(pwd) && $SCRIPT_PATH >> $BACKUP_DIR/backup.log 2>&1"

    echo "[schedule] Installing cron job: $CRON_ENTRY"
    (crontab -l 2>/dev/null | grep -v "$SCRIPT_PATH"; echo "$CRON_ENTRY") | crontab -
    echo "[schedule] Cron job installed"
}

# ── Main ─────────────────────────────────────────────────────────────
case "${1:-backup}" in
    backup)  do_backup ;;
    restore) do_restore "${2:-}" ;;
    schedule) do_schedule ;;
    *)
        echo "Usage: $0 [backup|restore FILE|schedule]"
        exit 1
        ;;
esac
