---
task_id: MWEB-PORTAL-P0-008
status: PARTIAL

reality_2026_003: PARTIAL
reality_2026_011: PASS

implementation_ref: WORKTREE-2026-10-05

tests: PASS
integration: PARTIAL
e2e: NOT_RUN

migration: PASS

observability: NOT_RUN
security_privacy: PARTIAL
rollback_recovery: NOT_RUN

task_scope_external_proof_required: true
external_runtime_validation: NOT_RUN
release_readiness: NOT_RUN
release_followups: "Evidence attachment moderation/retention cleanup, customer/courier update delivery, staging E2E, dan release gate tetap ditunda sampai capability portal selesai."

unproven_requirements: "Attachment moderation/retention cleanup; merchant-to-customer/courier update delivery; authenticated browser/staging/device proof."
known_blockers: NONE
locally_actionable_remaining: "Implement attachment moderation/retention cleanup and customer/courier support update delivery; after feature scope complete run deferred cross-app and release verification."
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
- Support case memiliki evidence attachment yang disimpan sebagai metadata database-authoritative dengan private storage key, validasi content signature, checksum deduplikasi per case, retention 30 hari, audit event, dan download yang kembali memvalidasi akses requester/support staff.
- Resolusi case memiliki kode penyelesaian terkontrol yang wajib saat status menjadi resolved/closed, di-reset saat dibuka kembali, disimpan di database, ditampilkan di Admin, dan masuk metadata audit action.
- Order card sudah menyediakan jalur “Laporkan masalah” yang membuka case dengan order reference.

## Files

- `merchant-web/src/pages/Reviews.tsx`
- `merchant-web/src/lib/types.ts`
- `merchant-web/src/App.tsx`
- `merchant-web/src/components/Layout.tsx`
- `merchant-web/src/pages/Support.tsx`
- `backend/admin-service/src/controllers/supportCases.controller.ts`
- `backend/admin-service/src/routes/support.routes.ts`
- `backend/admin-service/src/security/uploadSecurity.ts`
- `backend/order-service/internal/domain/refund.go`
- `backend/order-service/internal/service/refund_service.go`
- `backend/order-service/internal/handler/refund_handler.go`
- `backend/order-service/cmd/api/main.go`
- `backend/order-service/internal/service/refund_service_test.go`
- `database/migrations/20261005000007_support_case_attachments.sql`
- `database/migrations/20261005000008_support_case_resolution_codes.sql`

## Verification

    command: VITE_API_URL=http://127.0.0.1:8080/api/v1 VITE_WEB_ORIGIN=http://127.0.0.1:3086 npm run build (working directory merchant-web)
    result: PASS

    command: npm test -- --runInBand src/supportCasesContract.test.ts src/services/supportCasePolicy.test.ts src/security/uploadSecurity.test.ts (working directory backend/admin-service)
    result: PASS — 3 suites, 9 tests

    command: npm run build (working directory backend/admin-service)
    result: PASS

    command: npm run build (working directory merchant-web; local VITE_API_URL)
    result: PASS

    command: npm run lint (working directory merchant-web)
    result: PASS — 0 errors; existing non-blocking warnings only.

    command: npm run build (working directory admin-dashboard; staging VITE_API_URL/VITE_SOCKET_URL)
    result: PASS

    command: npm run lint (working directory admin-dashboard)
    result: PASS — 0 errors; existing warning backlog only.

    command: goose -dir database/migrations postgres "postgres://postgres:1234@localhost:6432/tembus_session?sslmode=disable" up
    result: PASS — 20261005000007_support_case_attachments and 20261005000008_support_case_resolution_codes applied.

    command: go test ./... (working directory backend/merchant-service)
    result: PASS

    command: go test ./... (working directory backend/order-service)
    result: PASS — refund reconciliation proof test and all order-service packages passed.

    command: docker compose up -d --build merchant-service order-service merchant-web
    result: PASS — local containers healthy; public staging release not claimed.

    command: Browser/staging/device E2E
    result: NOT_RUN — owner-approved feature-first queue

The queue is intentionally recorded as not run, not passed.

## Task-Local Verification

### Tests

Status: PASS

Evidence: Admin support policy/route contract suites passed, admin-service/merchant-web/admin-dashboard builds passed, and merchant-web lint passed.

### Integration

Status: PARTIAL

Evidence: Support API, private attachment storage metadata, authenticated download, Admin case viewer, Merchant Web form, and order-service refund read-after-write reconciliation are wired to database-backed services; full authenticated case creation with real files and Admin action remains deferred.

### E2E

Status: NOT_RUN

Evidence: Customer/courier/merchant issue creation, evidence, escalation, refund/compensation, and duplicate-action browser E2E remain queued.

### Migration

Status: PASS

Evidence: Goose applied `20261005000007_support_case_attachments.sql` and `20261005000008_support_case_resolution_codes.sql` to the local PgBouncer database; attachment metadata, indexes, grant, 30-day retention default, and controlled resolution-code constraint were created.

### Observability

Status: PARTIAL

Evidence: Support actions emit audit/security logs and correlation-aware errors; live SLA dashboards/alerts remain deferred.

### Security / Privacy

Status: PARTIAL

Evidence: Tenant-scoped case access, reference ownership validation, redaction, role/threshold policy, private attachment download, magic-byte validation, and idempotent checksum deduplication exist; attachment moderation, retention/expiry cleanup, and full abuse tests remain.

### Rollback / Recovery

Status: NOT_RUN

Evidence: Refund/compensation action now requires order-service confirmation of terminal refund status, gateway reference, matching amount, and ledger journal; recovery drill and authenticated replay remain deferred.

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

- Attachment/evidence moderation, expiry cleanup, and PII redaction.
- Customer/courier update delivery and support escalation.
- Refund/compensation threshold, authenticated duplicate replay, and recovery drill.
- Authenticated staging/browser/device evidence.

## Locally Actionable Remaining

- Add attachment moderation/retention cleanup and customer/courier support update delivery.

## External Blockers

NONE

## Owner Action Required

NONE

## Reality Gate Evaluation

### REALITY-2026-003 — Evidence-based Definition of Done

Status: PARTIAL

Evidence: Review/reply, database-backed support case intake/detail/evidence metadata, controlled resolution codes, and refund read-after-write reconciliation are implemented and locally tested; full issue/evidence/refund/cross-app acceptance remains.

### REALITY-2026-011 — No Fake Completeness

Status: PASS

Evidence: Not-run cross-app/release cases remain explicitly deferred.

## Unproven / Remaining

Attachment moderation/retention cleanup, customer/courier updates, and authenticated staging/device E2E.

## Next Eligible Task

CURRENT TASK — continue working
