# Platform maturity scorecard — PART AG

The scorecard reports for every PART W–AG task: implementation reference,
original acceptance boxes, test/integration/E2E/migration/observability/
security/rollback statuses, external proof requirement, known blockers, and
next verification. `PASS` is used only for executed evidence; static files or
mock responses are not proof. Red findings have an owner and due date and block
the affected release gate.

Milestones advance in dependency order: identity/core order → payment/safety
boundaries → discovery/communication → mobile/reputation/CRM → security and
reality gates → staging and production promotion. Work may run in parallel only
when the capability map proves no shared canonical-state or migration conflict.

## 2026-09-12 execution checkpoint

The current device is the staging environment. The verified host boundary is:

| Surface | Canonical staging host | Current evidence |
|---|---|---|
| Backend API | `https://api.bawain.my.id` | Health 200; authenticated payment/admin routes reject anonymous access with 401 |
| Customer web | `https://app.bawain.my.id` | HEAD 200 after rebuilding/restarting `tembus-frontend` |
| Admin dashboard | `https://admin.bawain.my.id` | HEAD 200; `/platform-operations` verified in the browser on the admin host |
| Landing page | `https://bawain.my.id/` | HEAD 200 |

| Part | Proven checkpoint | Open release gate |
|---|---|---|
| W — Payment | Provider-neutral capability/intent/routing/catalog boundaries, refund/chargeback primitives, admin operations and client catalog wiring | Refund liability/reconciliation, balances, admin approval rollout, chaos/load and vendor sandbox |
| X — Safety | Incident model, scoped shares/emergency contacts, evidence policy, admin queue and moderation boundaries | Client Safety Centers, contact masking, evidence-access audit, risk/support integration and executable drills |
| AC — Mobile | Release contract, performance gate groundwork and available mid-tier measurements | Low/high device matrix, crash/ANR, network/background/compatibility and acceptance suite |
| AD — Security | Threat/data-boundary docs and fail-closed security control workflow | Managed secret/KMS proof, SBOM/provenance, external pentest, tabletop and release gate evidence |
| AE — Reputation | Admin moderation/merchant-response and policy groundwork | Canonical signals/aggregates, abuse analytics, appeals and E2E |
| AF — CRM | Append-only loyalty/CRM schema and admin campaign control-plane groundwork | Authoritative entitlement, promo accounting, finance reconciliation, experimentation and E2E |
| AG — Reality | Ownership/modular-first/promotion/runbook/scorecard foundations and evidence validator | Named PRR/capacity/control-room ownership, measured load/cost, executed drills and milestone sign-off |

All open requirements are preserved in the individual evidence files under
`docs/task-evidence/`. Payment, OTP and emergency-provider live behavior is
explicitly marked as not configured; these are vendor-coordination follow-ups,
not simulated PASS results.
