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

## 2026-09-14 measurable checkpoint

The checkpoint is backed by executable repository and staging evidence rather
than feature count:

| Measure | Result | Source |
|---|---:|---|
| Admin-service Jest suites/tests | 130 / 606 PASS | `npm test -- --runInBand` |
| Order-service Go packages | PASS | `go test ./...` |
| Food membership lifecycle against staging schema | PASS | `TestFoodMembershipPaymentLifecycleAgainstStagingSchema` |
| Platform control artifacts | 34 required artifacts PASS | `scripts/security/verify_platform_controls.py` |
| Security release controls | PASS | `scripts/security/verify_security_release_controls.py` |
| Canonical staging hosts | 4/4 HTTP 200 | API, Customer Web, Admin, Landing smoke |
| Safety/experience staging drills | 3/3 PASS | Safety incident/fallback, kill-switch preservation and socket reconnect |

Red areas remain explicit remediation tasks, not silently promoted scores:
low/high Android device proof, vendor sandbox/live cutover, managed secret/KMS
attestation, external penetration/tabletop drills, measured next-stage load and
Finance/Legal approval. Each remains `PARTIAL`, `BLOCKED` or `NOT_RUN` in its
task evidence until the required proof exists.

## Red-area remediation queue — 2026-09-14

| Red area | Priority task / gate | Owner role | Exit evidence | Review / expiry |
|---|---|---|---|---|
| Low/high Android and acceptance matrix | MOBILE-2026-001, MOBILE-2026-007, MOBILE-2026-010 | Mobile release owner | Authorized low/mid/high device reports, compatibility and acceptance artifacts | Before any mobile percentage rollout |
| Provider sandbox/live payment and OTP cutover | PAYPLAT-2026-008, PAYPLAT-2026-010 and auth/provider release follow-up | Payments/Finance on-call and provider owner | Signed sandbox callback/reconciliation and vendor-approved live cutover evidence | Before payment/OTP production enablement |
| Managed secret/KMS and credential rotation | SECPLAT-2026-002, SECPLAT-2026-003 | Security owner | Secret-manager/KMS attestation, overlap/revocation drill and redacted-log evidence | Before multi-country or external-provider expansion |
| External pentest/tabletop and incident evidence | SECPLAT-2026-008, SECPLAT-2026-009, REALITY-2026-008 | Security incident commander | Signed report, retest closure and timestamped tabletop/drill record | Before major expansion; review quarterly |
| Next-stage capacity, cost and failure drills | REALITY-2026-006, REALITY-2026-008, REALITY-2026-009 | Platform/SRE on-call | Forecast-based load result, quota/headroom/cost result and rerun evidence | Before each stage promotion |
| Loyalty breakage and stored-value legal/accounting decision | PAYPLAT-2026-007, CRM-2026-010 | Finance controller and Legal/Compliance owner | Approved policy, account mapping and market terms | Before activation in any new market |

The scorecard is LANCAR-defined: competitor references, when later collected,
may inform capability principles only and cannot change internal release
thresholds or override an open P0 gate. A red area creates the prioritized
remediation row above; it is not complete because a document exists.
