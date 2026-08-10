#!/bin/sh
# Apply pending goose migrations individually.
# - Already recorded -> skip
# - Applies cleanly   -> run + record in goose_db_version
# - Fails with "already exists" -> schema present via admin-service runner -> record as applied
# - Other failures -> report, continue (manual review after)
cd /tmp/migrations || exit 1
for f in $(ls *.sql | sort); do
  vid=$(echo "$f" | grep -oE '^[0-9]+')
  [ -z "$vid" ] && continue
  applied=$(psql -U postgres -d tembus -t -A -c "SELECT 1 FROM goose_db_version WHERE version_id=$vid AND is_applied=TRUE;" 2>/dev/null)
  if [ "$applied" = "1" ]; then
    continue
  fi
  if psql -U postgres -d tembus -v ON_ERROR_STOP=1 -q -f "$f" 2>/tmp/mig_err.txt; then
    psql -U postgres -d tembus -q -c "INSERT INTO goose_db_version (version_id, is_applied, tstamp) VALUES ($vid, TRUE, NOW());" 2>/dev/null
    echo "OK   $f"
  else
    if grep -q "already exists\|duplicate" /tmp/mig_err.txt; then
      psql -U postgres -d tembus -q -c "INSERT INTO goose_db_version (version_id, is_applied, tstamp) VALUES ($vid, TRUE, NOW());" 2>/dev/null
      echo "SKIP(already exists) $f"
    else
      echo "FAIL $f :: $(head -1 /tmp/mig_err.txt)"
    fi
  fi
done
echo "DONE"
