# Threat model — payment and finance

`payment-service` owns payment intent orchestration and the existing finance
ledger remains authoritative for balances. Risks include client-paid forgery,
webhook replay, double charge/refund, provider mismatch, token leakage, and
privileged adjustment. Controls are capability adapters, server credentials,
idempotency, locked state transitions, raw provider evidence, reconciliation
exceptions, RBAC/TOTP, immutable ledger entries, and safe provider disable.
Owner: Finance/Payment; re-review every provider, currency, or refund change.

Review record: 2026-09-14 against commit `61bd269d`; high-risk remediation is
the idempotent provider/ledger boundary, verified by payment-service domain and
reconciliation tests. Vendor settlement proof remains an external follow-up.
