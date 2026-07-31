#!/bin/sh
# Re-apply ONLY the +goose Up section of migrations that were recorded
# by the earlier buggy script (which executed Up AND Down sections).
# Migrations recorded before 2026-07-31 21:00 were applied by real goose
# (Up-only semantics) and are safe.
cd /tmp/migrations || exit 1

# List versions recorded after 21:00 (buggy script rows)
VERSIONS=$(psql -U postgres -d tembus -t -A -c "SELECT version_id FROM goose_db_version WHERE is_applied=TRUE AND tstamp >= '2026-07-31 21:00:00+00' ORDER BY version_id;")

for vid in $VERSIONS; do
  f=$(ls ${vid}_*.sql 2>/dev/null | head -1)
  [ -z "$f" ] && { echo "NOFILE $vid"; continue; }
  # Extract only the Up section (between '+goose Up' and '+goose Down')
  awk '/-- \+goose Up/{flag=1;next} /-- \+goose Down/{flag=0} flag' "$f" > /tmp/up.sql
  if [ -s /tmp/up.sql ]; then
    if psql -U postgres -d tembus -v ON_ERROR_STOP=1 -q -f /tmp/up.sql 2>/tmp/up_err.txt; then
      echo "OK   $f"
    else
      echo "FAIL $f :: $(head -1 /tmp/up_err.txt)"
    fi
  else
    echo "EMPTY-UP $f"
  fi
done
echo "DONE"
