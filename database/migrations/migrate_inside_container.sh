#!/bin/bash
set -e
DB_USER="postgres"
DB_NAME="lancar"
DIR="/tmp/lancar_migrations"

echo "=== LANCAR Migration Runner ==="

for f in $(ls $DIR/*.sql | grep -v "run_" | sort); do
  basename_f=$(basename "$f")
  echo ""
  echo "--- Running: $basename_f"

  awk '/-- \+goose Up/{found=1; next} /-- \+goose Down/{found=0} found{print}' "$f" > /tmp/up_current.sql

  if [ ! -s /tmp/up_current.sql ]; then
    echo "    [SKIP] No UP section."
    continue
  fi

  psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=0 -f /tmp/up_current.sql 2>&1
  echo "    [DONE]"
done

echo ""
echo "=== VERIFICATION ==="
psql -U "$DB_USER" -d "$DB_NAME" -c "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;"
echo ""
echo "=== courier_profiles columns (00024 check) ==="
psql -U "$DB_USER" -d "$DB_NAME" -c "SELECT column_name, data_type FROM information_schema.columns WHERE table_name='courier_profiles' AND column_name IN ('bank_code','bank_account_number','ontime_deliveries_count','total_deliveries_count','relay_score','tier') ORDER BY column_name;"
echo ""
echo "=== MIGRATION COMPLETE ==="
