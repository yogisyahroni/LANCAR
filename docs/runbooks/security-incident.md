# Security incident runbook

1. Declare severity and incident commander; record service, market, actor
   scope, correlation ID, and time without copying secrets or raw PII.
2. Contain with the narrowest provider-health/feature kill switch; preserve
   active orders, safety access, callbacks, and reconciliation.
3. Preserve immutable evidence and redacted logs; revoke/rotate affected
   credentials using `docs/security/secret-management.md`.
4. Notify the named Security, Ops, Finance, and privacy contacts by severity.
5. Remediate, reconcile financial/state divergence with compensating records,
   and retest the affected contract.
6. Close with timeline, root cause, owner/due date, customer impact, and a
   rerun of the security/release gate. A tabletop must be recorded before
   multi-country production expansion.
