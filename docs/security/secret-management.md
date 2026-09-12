# Secret management and rotation — PART AD

Runtime secrets are supplied through the deployment secret manager or protected
environment variables. They are not stored in source, migrations, task
evidence, screenshots, or logs. Examples include `DATABASE_URL`, JWT signing
keys, provider credentials, Firebase credentials, storage keys, and
`INTERNAL_PAYMENT_API_KEY`.

Each secret has an owner, rotation cadence, overlap window, revocation path, and
verification check in the deployment record. Rotation uses: create replacement
→ deploy readers accepting old/new during the overlap → switch writers → verify
health and callback signatures → revoke old → remove old configuration. A
failed rotation keeps the old credential only until the documented expiry; it
does not silently continue forever.

The emergency runbook is: disable new provider attempts or affected feature via
the existing feature/health control, preserve callback and reconciliation
workers, rotate/revoke the credential, verify redacted logs, replay safe
reconciliation, then re-enable with a new audit entry. Secret values must never
be pasted into an issue or returned from an admin API.
