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

## 2026-09-14 staging PRR decision

| Decision | Owner roles | Evidence / known risk | Expiry or next review |
|---|---|---|---|
| NO-GO for production promotion; staging may continue | Product release owner; market launch lead; platform on-call | P0 transaction/safety/security gates still have PARTIAL/NOT_RUN evidence; payment and OTP providers are not vendor-verified | Re-review after open P0 evidence and provider follow-ups are attached |
| Finance/Legal approval required before stored-value or loyalty breakage activation | Finance controller; Legal/Compliance owner | Wallet legal boundary and CRM expiry/breakage policy remain approval-gated | Before any new-market launch or revenue recognition |
| Physical mobile matrix and external security drills remain release gates | Mobile release owner; security incident commander | No authorized low/high device, external pentest, tabletop, or managed-KMS attestation was available in this run | Re-review before percentage rollout or multi-country expansion |

This is an explicit release decision, not a feature-team approval. No production
promotion is authorized by this record; open risks remain linked to task
evidence and the scorecard remediation table.
