# Staging backup/restore probe — 2026-09-15

This is a redacted, local staging evidence record for the PostgreSQL backup and
restore path. It is not production backup, encryption-at-rest, KMS, or
provider evidence.

## Execution

- Environment: Docker staging on the shared LANCAR device (`tembus-db`).
- Source database: the running staging database; the database name and
  credentials are intentionally omitted.
- Restore target: a temporary database inside the same PostgreSQL container.
- Dump format: PostgreSQL custom format (`pg_dump -Fc`).
- Restore flags: `pg_restore --exit-on-error --no-owner --no-acl`.
- Safety boundary: the staging source database was not dropped or modified;
  the temporary restore database and dump were removed by the command's exit
  trap after verification.

## Result

The probe completed successfully:

```text
BACKUP_RESTORE_PROBE_PASS dump_nonempty=1 source_objects=2832 restored_objects=2832 cleanup=scheduled
BACKUP_RESTORE_PROBE_CLEANUP_PASS temp_database_absent=1
```

This proves the local dump/restore path and object-count parity only. It does
not prove encrypted backup storage, managed-key recovery, replica failover,
production RPO/RTO, or a current security-incident contact assignment.
