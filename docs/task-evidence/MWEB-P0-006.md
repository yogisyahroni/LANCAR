---
task_id: MWEB-P0-006
status: COMPLETE

reality_2026_003: PASS
reality_2026_011: PASS

implementation_ref: 5637722b, working-tree status contract changes

tests: PASS
integration: PASS
e2e: N/A
e2e_na_reason: "This task is the canonical status contract and UI handoff mapping; the disposable Admin-to-Portal browser scenario is scoped to MWEB-P0-008. The contract is verified by controller/lifecycle tests and the merchant-web production build."

migration: N/A
migration_na_reason: "The lifecycle schema and transition function already exist; this task changes the public projection and portal handoff without a schema change."

observability: PASS
security_privacy: PASS
rollback_recovery: PASS

task_scope_external_proof_required: false
external_runtime_validation: NOT_RUN

release_readiness: PARTIAL
release_followups: "Run the canonical-state browser smoke against the deployed staging image and include it in MWEB-P0-008 before public production release."

unproven_requirements: NONE
known_blockers: NONE

locally_actionable_remaining: NONE
blocker_resolution_attempts: "Inspected the Admin lifecycle transition, merchant-service resubmit path, public status endpoint, portal login gate, protected route, and database lifecycle migration; added the missing resubmit handoff, canonical next_action mapping, safe lifecycle-reason projection, and focused contract coverage."
unblock_condition: NONE

owner_action_required: false
owner_action_summary: NONE
verification_after_unblock: NONE

dependency_chain_blocked: false
next_eligible_task: MWEB-P0-008

updated_at: 2026-10-04
---

# Evidence — MWEB-P0-006

## Acceptance Criteria Source

Original requirements from `task-merchant-web-growth-p0-p2-2026.md`:

- Endpoint publik mengembalikan `onboarding_status` canonical, `verification_status` legacy sebagai compatibility field, nama toko, waktu submit/update, alasan penolakan/suspend yang aman, dan next action.
- State `DRAFT`, `SUBMITTED`, `VERIFYING`, `ACTIVE`, `REJECTED`, `SUSPENDED`, `no_merchant`, dan `not_found` dipetakan ke state UI yang jelas.
- Status `ACTIVE`/approved mengarahkan ke `/masuk` Merchant Web.
- Status `REJECTED` menyediakan jalur perbaikan/resubmit; `SUSPENDED` menampilkan instruksi bantuan.
- Halaman login dan protected route memakai lifecycle canonical yang sama dengan halaman status.

## Scope Implemented

- Public status responses now include the canonical lifecycle, legacy verification projection, store/timestamps, safe rejection/suspension copy, and a stable `next_action` value for every canonical state plus `no_merchant`.
- `ACTIVE` status links to Merchant Web login; it does not route approved users to the Android app.
- `REJECTED` status sends the user through login and then to `/daftar?mode=resubmit`. The registration page starts at business data, reuses the authenticated HttpOnly session, and calls the existing server-authoritative merchant registration command so the same merchant row is resubmitted rather than creating a second account.
- `SUSPENDED` remains a support/recovery state and exposes only a sanitized explanation after a matched identity lookup.
- Login, status lookup, and protected portal access continue to derive access from the canonical onboarding lifecycle; legacy verification status is only a fallback compatibility projection.
- `no_merchant` remains an explicit visible state and links to the business registration path.

## Files Changed

- `backend/admin-service/src/controllers/merchants-public.controller.ts` — canonical public status projection, next-action mapping, and safe lifecycle-reason handling.
- `backend/admin-service/src/controllers/merchants-public.controller.test.ts` — canonical next-action coverage for all lifecycle states plus privacy/error contracts.
- `merchant-web/src/pages/StatusCheck.tsx` — explicit no-merchant, active, rejected, and suspended actions.
- `merchant-web/src/pages/Login.tsx` — rejected-account handoff to authenticated resubmission.
- `merchant-web/src/pages/Register.tsx` — authenticated same-account resubmit mode.
- `docs/task-evidence/MWEB-P0-006.md` — this evidence record.

## Commands / Checks Run

    command: npm test -- --runInBand src/controllers/merchants-public.controller.test.ts src/merchantOnboardingLifecycleContract.test.ts src/rateLimit.test.ts (backend/admin-service)
    result: PASS — 3 suites, 20 tests passed.

    command: go test ./internal/service ./internal/handler ./internal/repository (backend/merchant-service)
    result: PASS — merchant resubmit lifecycle, service, and repository tests passed; handler has no test files.

    command: npm run build (merchant-web)
    result: PASS — TypeScript compilation and Vite production build completed.

    command: npm run lint (merchant-web)
    result: PASS — 0 errors; 11 existing non-blocking warnings remain outside this change plus one existing Register any warning.

    command: npm run build (backend/admin-service)
    result: PASS — TypeScript compilation completed after the public status contract change.

    command: git diff --check
    result: PASS.

    command: python scripts/tasks/validate_task_evidence.py
    result: PASS — repository task-evidence gate passed; advisory warnings remain non-blocking.

## Task-Local Verification

### Tests

Status: PASS

Evidence: Focused Admin tests prove the primary read, canonical next action for all six lifecycle states, explicit `no_merchant`, generic `not_found`, safe suspension reason, and rate-limit/error behavior. Merchant-service tests prove a rejected merchant resubmits through the existing lifecycle service and repository path.

### Integration

Status: PASS

Evidence: The public route, Admin transition projection, merchant login gate, protected portal lifecycle helper, and authenticated `/merchant/register` resubmit path are wired to the same canonical status model. The production merchant-web build and Admin-service build both pass.

### E2E

Status: N/A

Evidence: The full disposable Admin → database → browser transition scenario is the explicit scope of MWEB-P0-008. This task's local proof is contract-level and is not presented as staging or production E2E evidence.

### Migration

Status: N/A

Evidence: The existing merchant onboarding enum/transition function and audit schema are reused; no migration is introduced by this task.

### Observability

Status: PASS

Evidence: Public status outcomes and failures emit structured redacted events; no email or phone identifier is written to lookup telemetry.

### Security / Privacy

Status: PASS

Evidence: Rejected resubmission requires the authenticated web session and uses the same merchant-service ownership check; public status reasons are returned only after identity lookup and technical lifecycle wording is sanitized. No token, private document URL, bank data, or internal account state is returned.

### Rollback / Recovery

Status: PASS

Evidence: The change is backward-compatible at the API level (`next_action` is additive), uses the existing resubmit transaction path, and can be reverted without a data migration. Failed status reads remain a retryable 503 rather than a false lifecycle state.

## External Runtime / Release Validation

### Is external proof required by the original TASK-ID?

Value:

`false`

Reason:

The original task defines the canonical contract and handoff behavior. Deployed staging browser smoke and the full cross-service disposable scenario are separate release evidence for MWEB-P0-008 and MWEB-P0-010.

### External Runtime Validation

Status: NOT_RUN

Evidence: No staging or production result is claimed here.

### Release Readiness

Status: PARTIAL

Evidence: Local contract/build/service proof is complete. Staging browser proof remains a release follow-up and is not represented as complete.

## Reality Gate Evaluation

- `REALITY-2026-003`: PASS — all applicable local acceptance criteria have implementation and focused contract evidence.
- `REALITY-2026-011`: PASS — no staging, production, or provider result is presented as completed; external follow-up is explicit.

## Unproven / Remaining

NONE for the original local contract task. Deployed staging and full cross-app E2E remain release follow-ups under their owning tasks.

## Next Eligible Task

`MWEB-P0-008` — disposable-account full E2E onboarding proof.

## Status Decision

`COMPLETE` — canonical status contract and local handoff implementation are proven; this is not a public production-readiness declaration.
