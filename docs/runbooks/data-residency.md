# Data residency runbook

Use this checklist before activating a market or adding a region. The source
of truth is `infra/regions/region-catalog.yaml`; an environment-specific
deployment must not silently override it.

## Market launch checklist

1. Assign the market to exactly one home region and one approved transactional
   primary. Record the assignment in the control plane.
2. Classify every dataset emitted by the market as resident, encrypted
   cross-region metadata, or approved public projection.
3. Confirm restricted fields (contact details, addresses, verification
   artifacts, payment/provider payloads, beneficiary details, and credentials)
   do not cross the residency boundary.
4. Confirm retention, deletion, export and legal-policy versions are resolved
   by the market policy, not by a region default.
5. Verify the secondary has the same schema and policy version before enabling
   read-only projection traffic.
6. Verify encryption in transit/at rest, access roles, audit sink residency,
   backup destination residency, and restore operator permissions.
7. Run the catalog validator and failover drill. Attach the output to the
   change record without raw payloads or secrets.
8. Obtain the market/compliance owner approval before changing `lifecycle` or
   promotion state.

## Backup and restore

`deploy/scripts/backup.sh` requires a database URL and supports encrypted local
backup plus an S3-compatible remote copy. Production operation must set
`BACKUP_ENCRYPT_PASSWORD` through a secret manager and configure a remote
bucket in the approved residency region. Never put the password, database URL,
private key, or raw dump in Git, logs, screenshots, or task evidence.

Restore validation must check schema version, domain row counts, append-only
event history, and idempotency uniqueness before the restored data is eligible
for promotion.
