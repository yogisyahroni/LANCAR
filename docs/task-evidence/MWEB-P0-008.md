---
task_id: MWEB-P0-008
status: COMPLETE

reality_2026_003: PASS
reality_2026_011: PASS

implementation_ref: eab3c502

tests: PASS
integration: PASS
e2e: PASS

migration: N/A
migration_na_reason: "The E2E reuses the existing merchant onboarding schema and transition function; no schema change is introduced by this task."

observability: PASS
security_privacy: PASS
rollback_recovery: PASS

task_scope_external_proof_required: false
external_runtime_validation: NOT_RUN

release_readiness: PARTIAL
release_followups: "Repeat the browser smoke against the deployed staging image and complete MWEB-P0-010 before public production use."

unproven_requirements: NONE
known_blockers: NONE

locally_actionable_remaining: NONE
blocker_resolution_attempts: "Reproduced and repaired local cookie transport, CSRF test setup, domestic-phone status lookup, disposable-data cleanup, and public upload rate-limit reset handling without weakening production protections."
unblock_condition: NONE

owner_action_required: false
owner_action_summary: NONE
verification_after_unblock: NONE

dependency_chain_blocked: false
next_eligible_task: MWEB-P0-010

updated_at: 2026-10-04
---

# Evidence — MWEB-P0-008

## Acceptance Criteria Source

Original requirements from `task-merchant-web-growth-p0-p2-2026.md`:

- [x] Skenario memakai akun dan dokumen test disposable, bukan data merchant nyata.
- [x] Setiap transition diverifikasi di database dan response API, bukan hanya screenshot UI.
- [x] Browser E2E mencakup loading, retry, error, refresh, dan read-after-write.
- [x] Evidence mencatat commit, image Docker, migration state, API response yang sudah disanitasi, dan database invariant tanpa PII/credential.

## Scope Implemented

- Added a repeatable local disposable-account harness covering Merchant Web registration, four required document uploads, Admin verification transitions, reject/resubmit, approval, public ACTIVE status, suspension, and public SUSPENDED status.
- Added domestic Indonesian phone-format normalization for public status lookup so the status page accepts the `08...` format used by the registration form while matching the canonical `+62...` value stored by auth.
- Added a Chromium browser harness covering the public status page's delayed loading state, retry after a safe 503, successful status read, and refresh/read-after-write behavior.
- Cleanup removes the disposable user and related onboarding review/legal-profile rows after the run. The temporary local Admin 2FA flag and cookie overrides are restored before the test environment is returned.

## Files Changed

- `backend/admin-service/src/controllers/merchants-public.controller.ts` — accepts canonical and domestic phone variants without weakening the email+phone same-account binding.
- `backend/admin-service/src/controllers/merchants-public.controller.test.ts` — verifies domestic phone lookup and canonical array binding.
- `backend/admin-service/src/merchantOnboardingLifecycleContract.test.ts` — updates the lifecycle contract assertion for the bound phone-variant query.
- `scripts/e2e/merchant-web-onboarding-local.ps1` — disposable Admin → DB → Merchant Web API lifecycle harness with sanitized output and deterministic cleanup.
- `scripts/e2e/merchant-web-status-browser.mjs` — Chromium loading/error/retry/status/refresh browser proof.
- `docs/task-evidence/MWEB-P0-008.md` — this evidence record.

## Commands / Checks Run

    command: npm test -- --runInBand src/controllers/merchants-public.controller.test.ts src/merchantOnboardingLifecycleContract.test.ts src/rateLimit.test.ts (backend/admin-service)
    result: PASS — 3 suites, 21 tests passed.

    command: npm run build (backend/admin-service)
    result: PASS — TypeScript compilation completed.

    command: docker compose build admin-service
    result: PASS — image `tembus-admin-service`, ID `sha256:e8df81124293890d7f06ae2e5e9e6c613398f3892e5b1cf8c8f93e4da4a39e59`.

    command: powershell scripts/e2e/merchant-web-onboarding-local.ps1 (local Gateway + Admin + DB + Merchant Service; disposable data)
    result: PASS — sanitized scenario output: `register`, `document_upload`, `admin_verify_reject`, `resubmit`, `admin_approve`, `public_active_status`, `authenticated_dashboard`, `admin_suspend`, `public_suspended_status`; final invariant `SUSPENDED|pending|4|1|7`. The dashboard assertion is an additional cross-service proof reused by MWEB-PORTAL-P0-002.

    command: node scripts/e2e/merchant-web-status-browser.mjs http://localhost:3004 <disposable-email> <canonical-phone>
    result: PASS — Chromium checks `error_retry`, `status_read`, and `refresh`; identifiers are intentionally omitted from evidence.

    command: docker compose ps admin-service api-gateway merchant-service merchant-web
    result: PASS — Admin, Gateway, Merchant Service, and Merchant Web containers running; Admin and Merchant Service healthy.

    command: python scripts/tasks/validate_task_evidence.py
    result: PASS — repository task-evidence gate passed; pre-existing advisory warnings remain non-blocking.

    command: git diff --check
    result: PASS.

## Task-Local Verification

### Tests

Status: PASS

Evidence: Focused Admin tests prove the canonical public status query, domestic phone normalization, same-account email+phone binding, lifecycle next actions, safe errors, and rate-limit behavior.

### Integration

Status: PASS

Evidence: The disposable harness used the real local API Gateway path, Admin Service, Merchant Service, PostgreSQL, Redis rate limiter, session cookies, upload middleware, and Admin lifecycle transition endpoints. It observed the final database invariant `SUSPENDED|pending|4|1|7`: canonical suspended status, four merchant documents, one legal profile, and seven onboarding review events.

### E2E

Status: PASS

Evidence: The API lifecycle harness completed registration → upload → reject → resubmit → approve → ACTIVE lookup → suspend → SUSPENDED lookup with disposable data. The Chromium harness verified loading delay, safe 503 retry copy, real status response, and refresh status persistence. The browser run used the local merchant-web dev server with the local API Gateway; it is not claimed as deployed staging proof.

### Migration

Status: N/A

Evidence: No persistent schema change was introduced; existing merchant legal-profile, document, and onboarding-review tables were exercised and cleaned safely.

### Observability

Status: PASS

Evidence: Public status outcomes are emitted through structured redacted lookup events, and upload/status public endpoints retain rate limiting. E2E output is sanitized and contains no account identifiers, tokens, document URLs, or credentials.

### Security / Privacy

Status: PASS

Evidence: The same-account email+phone lookup remains parameterized; domestic phone support is additive. Admin mutations required the real Admin session, Gateway CSRF double-submit token, idempotency keys, and Admin TOTP policy was temporarily enabled only for the disposable local test identity and restored afterward. Production cookie security configuration was restored to `COOKIE_DOMAIN=.bawain.my.id` and `FORCE_SECURE_COOKIES=true`.

### Rollback / Recovery

Status: PASS

Evidence: The lifecycle traversed rejection, authenticated resubmission, approval, and suspension recovery boundaries. Disposable test data was deleted, related legal-profile/review rows were removed, the test Admin 2FA value was restored, and no migration rollback was required.

## External Runtime / Release Validation

### Is external proof required by the original TASK-ID?

Value:

`false`

Reason:

The original task requires a disposable cross-service and browser proof, which is satisfied locally. Deployed staging/public-domain validation belongs to MWEB-P0-010 and is not represented as complete here.

### External Runtime Validation

Status:

`NOT_RUN`

Evidence: No staging or production result is claimed by this task.

### Release Readiness

Status:

`PARTIAL`

Evidence: Local E2E is complete. Staging image/browser smoke, production configuration gates, security scans, rollback image proof, and public-domain verification remain under MWEB-P0-010.

## Reality Gate Evaluation

- `REALITY-2026-003`: PASS — every original MWEB-P0-008 acceptance criterion has local implementation and sanitized runtime evidence.
- `REALITY-2026-011`: PASS — no staging, production, provider, credential, or PII result is fabricated or exposed.

## Status Decision

`COMPLETE` — disposable local Admin → DB → Merchant Web lifecycle and Chromium status-page proof are complete; this is not a public production-readiness declaration.
