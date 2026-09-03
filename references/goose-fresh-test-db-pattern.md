# Goose Fresh Test DB Pattern

## Problem
`goose up` fails with `found N missing migrations before current version X` when target DB
has migration gap (local DB behind newer migration files).

## Reproduction (CORE-2026-006, sesi 2026-09-02)
```
$ goose -dir database/migrations postgres "host=localhost port=5432 user=postgres ..." up
2026/09/02 23:02:15 goose run: error: found 8 missing migrations before current version 20260902000002:
    version 20260901000001: database/migrations/20260901000001_...
    ...
```

## Recipe
1. Create isolated DB from scratch:
   ```bash
   PGPASSWORD=1234 psql -h localhost -p 5432 -U postgres -c "DROP DATABASE IF EXISTS tembus_test_core006;"
   PGPASSWORD=1234 psql -h localhost -p 5432 -U postgres -c "CREATE DATABASE tembus_test_core006 OWNER postgres;"
   ```
2. Apply full chain with `-allow-missing` (skips missing baseline files):
   ```bash
   goose -dir database/migrations postgres "host=localhost ... dbname=tembus_test_core006 sslmode=disable" up -allow-missing
   ```
3. Reproduction test query:
   ```sql
   SELECT version_id FROM goose_db_version ORDER BY 1 DESC LIMIT 3;
   ```

## Why `-allow-missing`
Goose treats missing migration files as gap. Fresh DB from scratch has no `goose_db_version`
rows yet — every file is applied in order. `-allow-missing` lets goose skip file checks
when the chain is being rebuilt from zero.

## ENV (this Windows host)
- GOTMPDIR=C:/Users/yogis/AppData/Local/Temp/gotmp
- GOPATH=C:/Users/yogis/AppData/Local/go
- GOMODCACHE=C:/Users/yogis/AppData/Local/go/pkg/mod
- Default psql creds (local dev): postgres / 1234 @ localhost:5432