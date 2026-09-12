# Platform threat model — PART AD

This is the security source of truth for the current modular deployment. The
trust boundaries are: public web/mobile clients → API gateway; gateway →
authenticated bounded services; services → PostgreSQL/Redis/object storage;
services → provider adapters; admin browser → admin service. A client is never
trusted to assert payment, order, reputation, loyalty, or safety state.

| Asset | Abuse case | Required control | Evidence/owner |
|---|---|---|---|
| Payment intent, provider reference, ledger | replay, double charge, forged paid flag | server intent state machine, idempotency, raw provider evidence, reconciliation queue | payment-service / Finance |
| Safety incident and evidence | retaliation, evidence tampering, location exposure | separate aggregate, scoped location, immutable object hash, retention/access audit | order/admin / Ops Security |
| Admin mutation | privilege escalation or unreviewed high-impact change | gateway identity, RBAC, TOTP, idempotency, audit trail, maker-checker for rollout | admin-service / Security |
| Customer/courier identity | token theft, enumeration, PII leakage | httpOnly session, rate limits, redacted logs, minimum response fields | auth/gateway / Security |
| Provider credentials | source/log exposure or stale access | managed secret, overlap rotation, revocation runbook, no raw secret in evidence | Platform |
| Campaign/loyalty liability | promo abuse or unbounded subsidy | immutable attribution, consent, holdout, budget/funding breakdown, reconciliation | CRM/Finance |

Threat review is required for auth, payment, refund, provider, safety, admin,
data-residency, and release-gate changes. The review record must name the
owner, affected trust boundary, remediation, and verification command. Insider
and privileged-admin actions are included in the threat model; ordinary
customer allegations never directly enforce a ban or rating change.
