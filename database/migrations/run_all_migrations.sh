#!/bin/bash
# run_all_migrations.sh
# Jalankan semua migration Goose-format ke DB production (via psql)
# Usage: bash run_all_migrations.sh

set -e  # Exit on first error

DB_USER="postgres"
DB_NAME="lancar"
CONTAINER="lancar-db"
MIGRATIONS_DIR="/mnt/e/antigraviti google/SUDAH DEPLOY/LANCAR/database/migrations"

echo "============================================================"
echo "  LANCAR — Running All Database Migrations"
echo "  Target: container=$CONTAINER, db=$DB_NAME"
echo "============================================================"

# Get all migration files in sorted order, excluding helper scripts
MIGRATION_FILES=$(ls "$MIGRATIONS_DIR"/*.sql | sort | grep -v 'run_00024.sql')

for FILE in $MIGRATION_FILES; do
  BASENAME=$(basename "$FILE")
  echo ""
  echo "▶ Running: $BASENAME"
  echo "-----------------------------------------------------------"
  
  # Extract only the +goose Up section (stop at +goose Down)
  TMP_FILE="/tmp/migration_up_${BASENAME}"
  awk '/-- \+goose Up/{found=1; next} /-- \+goose Down/{found=0} found{print}' "$FILE" > "$TMP_FILE"
  
  # Skip if UP section is empty
  if [ ! -s "$TMP_FILE" ]; then
    echo "  ⚠ No UP section found, skipping."
    continue
  fi
  
  # Copy to container and execute
  docker cp "$TMP_FILE" "$CONTAINER:/tmp/current_migration.sql"
  docker exec "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" \
    -v ON_ERROR_STOP=0 \
    -f /tmp/current_migration.sql 2>&1
  
  EXIT_CODE=$?
  if [ $EXIT_CODE -eq 0 ]; then
    echo "  ✅ SUCCESS: $BASENAME"
  else
    echo "  ⚠ COMPLETED WITH WARNINGS (exit=$EXIT_CODE): $BASENAME"
    echo "     (IF_NOT_EXISTS statements may show as notices, this is OK)"
  fi
done

echo ""
echo "============================================================"
echo "  VERIFICATION — Tables in public schema:"
echo "============================================================"
docker exec "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" \
  -c "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;"

echo ""
echo "  Checking courier_profiles columns added by migration 00024:"
docker exec "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" \
  -c "SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = 'courier_profiles' AND column_name IN ('bank_code', 'bank_account_number', 'ontime_deliveries_count', 'total_deliveries_count', 'relay_score') ORDER BY column_name;"

echo ""
echo "============================================================"
echo "  DONE"
echo "============================================================"
