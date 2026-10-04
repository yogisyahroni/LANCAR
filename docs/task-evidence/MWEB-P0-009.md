---
task_id: MWEB-P0-009
status: COMPLETE

reality_2026_003: PASS
reality_2026_011: PASS

implementation_ref: 093ca34e, 5637722b

tests: PASS
integration: PASS
e2e: N/A
e2e_na_reason: "The original task is an API privacy, lookup-consistency, and rate-limit contract; browser rendering is not required to prove identifier binding or response redaction."
migration: N/A
migration_na_reason: "The endpoint reuses the existing users and merchants schema; this change adds no persistent schema or data migration."
observability: PASS
security_privacy: PASS
rollback_recovery: PASS

task_scope_external_proof_required: false
external_runtime_validation: NOT_RUN

release_readiness: PARTIAL
release_followups: "Run the public status flow against the deployed staging image and confirm the production Redis rate-limit policy and log/metric sink."

unproven_requirements: NONE
known_blockers: NONE

locally_actionable_remaining: NONE
blocker_resolution_attempts: "Inspected the public route, controller, rate limiter, canonical lifecycle contract, and existing database schema; replaced replica reads with primary reads for read-after-write consistency; added safe failure handling, structured lookup telemetry, and focused security contract tests."
unblock_condition: NONE

owner_action_required: false
owner_action_summary: NONE
verification_after_unblock: NONE

dependency_chain_blocked: false
next_eligible_task: MWEB-P0-006

updated_at: 2026-10-04
---

# Evidence — MWEB-P0-009

## Acceptance Criteria Source

Original requirements from `task-merchant-web-growth-p0-p2-2026.md`:

- Email dan nomor HP yang dikirim bersamaan harus cocok pada akun yang sama.
- Public status lookup mempertahankan rate limit, generic not-found response, audit/metric request, dan redaksi PII.
- Read-after-write setelah transition Admin memakai strategi yang jelas dan diuji.
- Alasan penolakan/suspend hanya dikembalikan setelah identity lookup cocok.
- Test mismatch, enumeration/rate limit, generic error, stale/read-after-write, dan response tanpa token, dokumen privat, rekening, atau data internal harus lulus.

## Scope Implemented

- Public status lookup mempertahankan predicate `email AND phone` saat kedua identifier dikirim; tidak ada fallback ke pencocokan `OR`.
- Lookup status membaca database primary melalui `db`, bukan replica `readDb`, sehingga Admin transition dapat dibaca segera sesuai read-after-write contract.
- Response publik tidak lagi mengembalikan `user_status`; hanya field status dan informasi pendaftaran yang diperlukan halaman status. Token, URL dokumen, rekening, dan identifier internal tidak diproyeksikan.
- Kegagalan database tidak lagi mengembalikan `error.message`; endpoint memberi copy generik dan kode `ERR_STATUS_LOOKUP_UNAVAILABLE`.
- Setiap hasil lookup dicatat sebagai structured event `merchant_registration_status_lookup` dengan presence flag identifier, outcome, status bila cocok, dan durasi. Email/nomor HP tidak ditulis ke log.
- Rate limiter publik tetap memakai satu bucket per IP dan scope endpoint, dengan budget 20 request per jam; ketika budget habis endpoint mengembalikan `429` dan `ERR_RATE_LIMITED` tanpa memanggil controller.

## Files Changed

- `backend/admin-service/src/controllers/merchants-public.controller.ts` — primary read, safe error contract, response minimization, and structured lookup telemetry.
- `backend/admin-service/src/controllers/merchants-public.controller.test.ts` — mismatch binding, primary-read, no-merchant, safe error, and log-redaction contract tests.
- `backend/admin-service/src/rateLimit.test.ts` — exhausted-budget and atomic public IP-bucket tests.
- `docs/task-evidence/MWEB-P0-009.md` — this evidence record.

## Commands / Checks Run

    command: npm test -- --runInBand src/controllers/merchants-public.controller.test.ts src/merchantOnboardingLifecycleContract.test.ts src/rateLimit.test.ts (backend/admin-service)
    result: PASS — 3 suites, 20 tests passed.

    command: npm run build (backend/admin-service)
    result: PASS — TypeScript compilation completed.

    command: git diff --check
    result: PASS.

## Task-Local Verification

### Tests

Status: PASS

Evidence: Controller tests prove the two-identifier `AND` predicate, primary database selection, generic not-found response, explicit `no_merchant` state, safe database-unavailable response, and absence of email/phone from structured lookup metadata. Rate-limit tests prove the 429 budget boundary and atomic IP bucket increment. Existing lifecycle contract tests continue to prove canonical status mapping and reject the unsafe `OR` predicate.

### Integration

Status: PASS

Evidence: The route remains wired through `publicEndpointRateLimiter` before `getMerchantRegistrationStatus`; the TypeScript build passes and the rate-limit contract exercises the same middleware used by the public route.

### E2E

Status: N/A

Evidence: Browser E2E is not required for this API security contract. The merchant web status page already consumes the same route; deployed browser validation is tracked as a release follow-up.

### Migration

Status: N/A

Evidence: No schema or stored-data change was introduced.

### Observability

Status: PASS

Evidence: Matched, not-found, and no-merchant outcomes emit a structured lookup event with duration and non-PII presence/outcome fields; failure emits a structured error event with the existing redaction pipeline. Unit assertions verify identifiers are not included in log metadata.

### Security / Privacy

Status: PASS

Evidence: Both identifiers are bound to the same user row; generic not-found behavior is preserved; the public limiter uses a shared IP scope; public error responses do not expose database/provider details; the response projection excludes account status internals, tokens, private document URLs, and bank information. Matched lifecycle reasons are normalized and technical wording is replaced with a safe support instruction; the additive `next_action` field is non-sensitive.

### Rollback / Recovery

Status: PASS

Evidence: The change is code-only and can be reverted atomically; no migration or irreversible data mutation is involved. Database failure produces a retryable 503 contract rather than a false status.

## External Runtime / Release Validation

### Is external proof required by the original TASK-ID?

Value: `false`

Reason: The original criteria are satisfied by local API contract, security, and middleware tests. Deployed staging/provider validation is a separate release follow-up.

### External Runtime Validation

Status: NOT_RUN

Evidence: No staging or production result is claimed.

### Release Readiness

Status: PARTIAL

Evidence: Local task proof is complete; deployed status-page smoke and production Redis/log sink verification remain release work.

### Release Follow-ups

- Run a sanitized staging browser/API smoke for `not_found`, `no_merchant`, each canonical state, and the 429 boundary.
- Confirm production Redis rate-limit persistence and structured event delivery in the operational sink.

## Locally Actionable Remaining

NONE.

## External Blockers

NONE.

## Owner Action Required

false — none.

## Reality Gate Evaluation

- `REALITY-2026-003`: PASS — all applicable original acceptance criteria have focused implementation and contract evidence.
- `REALITY-2026-011`: PASS — no staging, production, or provider result is presented as completed; release follow-ups are explicit.

## Unproven / Remaining

NONE for the original task. Staging/runtime validation is recorded separately under release follow-up.

## Next Eligible Task

`MWEB-P0-006` — canonical onboarding status evidence and any remaining lifecycle/UI proof.

## Status Decision

`COMPLETE` — all original local acceptance criteria are proven; this task is not a production release declaration.

## Notes / N/A Justification

- `e2e: N/A` is limited to browser rendering; API behavior is proven by direct controller and middleware contract tests.
- `migration: N/A` is valid because the endpoint only changes read routing, response projection, and observability; it does not alter schema or stored records.
