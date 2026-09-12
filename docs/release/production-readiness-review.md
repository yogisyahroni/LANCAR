# Production readiness review — PART AG

Before promotion, the owner signs off the following evidence: capability map
and dependency owners; SLO/error budget and alert routes; capacity forecast;
backup/restore and idempotency/reconciliation checks; security scan/SBOM;
privacy/retention; migration rehearsal; provider sandbox; admin controls;
support playbook; rollback/compensating migration; and the applicable launch
guardrail. The sign-off is invalid if a P0 feature has no kill switch, recovery
owner, or support path.

The release packet also records known limitations as `NOT_RUN`, `PARTIAL`, or
`BLOCKED`; a passing build alone cannot close a capability. Vendor-live payment
and OTP evidence is intentionally a follow-up until external accounts exist.
