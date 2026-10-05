---
task_id: MWEB-PORTAL-P0-008
status: PARTIAL

reality_2026_003: PARTIAL
reality_2026_011: PASS

implementation_ref: WORKTREE-2026-10-05

tests: PASS
integration: PASS
e2e: NOT_RUN

migration: N/A
migration_na_reason: "Review/reply increment memakai tabel merchant ratings dan reply yang sudah tersedia; tidak ada schema baru."

observability: NOT_RUN
security_privacy: PARTIAL
rollback_recovery: NOT_RUN

task_scope_external_proof_required: true
external_runtime_validation: NOT_RUN
release_readiness: NOT_RUN
release_followups: "Issue center, customer/courier support, evidence moderation, escalation, refund/compensation policy, staging E2E, dan release gate tetap ditunda sampai capability portal selesai."

unproven_requirements: "Attachment/evidence validation and expiry; merchant-to-customer/courier update delivery; duplicate-safe compensation reconciliation; browser/staging/device proof."
known_blockers: NONE
locally_actionable_remaining: "Implement issue/support workflow and connect refund/compensation policy; after feature scope complete run deferred cross-app and release verification."
blocker_resolution_attempts: NONE
unblock_condition: NONE
owner_action_required: false
owner_action_summary: NONE
verification_after_unblock: "Run authenticated merchant review/reply and issue E2E with customer/admin, duplicate requests, privacy checks, and reconciliation proof."
dependency_chain_blocked: false
next_eligible_task: NONE
updated_at: 2026-10-05
---

# Evidence — MWEB-PORTAL-P0-008

## Acceptance Criteria Source

- Issue center mencakup item hilang/salah/rusak, keterlambatan, customer tidak menerima, courier gagal pickup, payment mismatch, suspected fraud, dan safety incident.
- Issue memiliki owner, status, SLA, evidence, audit, resolution code, dan escalation state.
- Refund/compensation mengikuti permission/threshold, idempotent, dan masuk ke settlement/reconciliation.
- Review tidak dapat dihapus merchant; reply dapat dibuat dan diaudit.

## Scope Implemented

- Merchant Web menampilkan ringkasan rating dan distribusi bintang dari endpoint database-authoritative.
- Ulasan customer ditampilkan tanpa data kontak; merchant dapat membuat atau memperbarui tanggapan melalui endpoint yang sudah tenant-scoped dan diaudit.
- Rating/review diperlakukan read-only untuk merchant; UI hanya menyediakan reply.
- Portal memiliki halaman Bantuan & kualitas yang membuat/list/detail support case melalui API database-authoritative; order dirujuk melalui validated link dan actor tidak dapat memalsukan requester.
- Server support case memiliki status transition, SLA breach, assigned owner, escalation level, privacy-safe redaction, authority context order/payment, idempotency, audit event, dan policy-limited refund/compensation action.
- Order card sudah menyediakan jalur “Laporkan masalah” yang membuka case dengan order reference.

## Files

- `merchant-web/src/pages/Reviews.tsx`
- `merchant-web/src/lib/types.ts`
- `merchant-web/src/App.tsx`
- `merchant-web/src/components/Layout.tsx`

## Verification

    command: VITE_API_URL=http://127.0.0.1:8080/api/v1 VITE_WEB_ORIGIN=http://127.0.0.1:3086 npm run build (working directory merchant-web)
    result: PASS

    command: npm test -- --runInBand src/supportCasesContract.test.ts src/services/supportCasePolicy.test.ts (working directory backend/admin-service)
    result: PASS — 2 suites, 5 tests

    command: go test ./... (working directory backend/merchant-service)
    result: PASS

    command: docker compose up -d --build merchant-service order-service merchant-web
    result: PASS — local containers healthy; public staging release not claimed.

    command: Browser/staging/device E2E
    result: NOT_RUN — owner-approved feature-first queue

The queue is intentionally recorded as not run, not passed.

## Task-Local Verification

### Tests

Status: PASS

Evidence: Admin support policy/route contract suites passed and Merchant Web production build passed.

### Integration

Status: PASS

Evidence: Support API contract is wired to the database-backed admin service and Merchant Web; full authenticated case creation with Admin action remains deferred.

### E2E

Status: NOT_RUN

Evidence: Customer/courier/merchant issue creation, evidence, escalation, refund/compensation, and duplicate-action browser E2E remain queued.

### Migration

Status: N/A

Evidence: This increment consumes existing support-case, rating, and refund schema; no new migration was introduced here.

### Observability

Status: PARTIAL

Evidence: Support actions emit audit/security logs and correlation-aware errors; live SLA dashboards/alerts remain deferred.

### Security / Privacy

Status: PARTIAL

Evidence: Tenant-scoped case access, reference ownership validation, redaction, and role/threshold policy exist; attachment moderation, retention/expiry, and full abuse tests remain.

### Rollback / Recovery

Status: NOT_RUN

Evidence: Duplicate-safe action contracts exist, but refund/compensation reconciliation and recovery drill remain deferred.

## External Runtime / Release Validation

### Is external proof required by the original TASK-ID?

Value: `true`

Reason: Original scope requires consistent customer/courier updates and issue/refund E2E across applications.

### External Runtime Validation

Status: NOT_RUN

Evidence: Local build/contract evidence only; authenticated staging and cross-app issue flow not run.

### Release Readiness

Status: NOT_RUN

Evidence: Portal release gate waits for remaining P0 capability implementation.

### Release Follow-ups

- Attachment/evidence validation, expiry, moderation, and PII redaction.
- Customer/courier update delivery and support escalation.
- Refund/compensation threshold, ledger/settlement reconciliation, and duplicate replay.
- Authenticated staging/browser/device evidence.

## Locally Actionable Remaining

- Add evidence attachment model/policy, issue resolution code/escalation actions, and end-to-end compensation/reconciliation path.

## External Blockers

NONE

## Owner Action Required

NONE

## Reality Gate Evaluation

### REALITY-2026-003 — Evidence-based Definition of Done

Status: PARTIAL

Evidence: Review/reply and database-backed support case intake/detail are implemented and locally tested; full issue/evidence/refund/cross-app acceptance remains.

### REALITY-2026-011 — No Fake Completeness

Status: PASS

Evidence: Not-run cross-app/release cases remain explicitly deferred.

## Unproven / Remaining

Attachment/evidence policy, customer/courier updates, refund/compensation reconciliation, and authenticated staging/device E2E.

## Next Eligible Task

CURRENT TASK — continue working
