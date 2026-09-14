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

## Secret inventory and rotation ownership

| Secret class | Owner role | Rotation / overlap | Revocation and verification |
|---|---|---|---|
| JWT/session and internal service credentials | Security + platform on-call | 90 days; overlap only for readers supporting dual-key verification | Revoke old key, restart readers, verify internal negative tests and redacted logs |
| Payment/provider/webhook credentials | Payments/Finance on-call + provider owner | Provider policy; dual-key overlap where supported | Disable new attempts if needed, rotate, replay a signed sandbox callback, verify reconciliation and remove old key |
| OTP/SMS/email provider credentials | Auth/Communications on-call + provider owner | Provider policy; overlap during cutover | Disable provider route, rotate, send a sandbox/test message, verify honest failure and reject old key |
| Storage/Firebase/maps credentials | Platform/SRE on-call | 90 days or provider policy; dual-read overlap where supported | Revoke old credential, verify scoped access/initialization, inspect logs for values |
| Database/KMS/backup credentials | Infrastructure security owner | Managed KMS/secret-manager policy | Revoke through the manager, perform approved restore/health check, retain rotation record |

This is an ownership and procedure contract; it contains no credential values
and does not claim that a real provider/KMS rotation or emergency drill has
already been executed. Those execution records remain release evidence.
