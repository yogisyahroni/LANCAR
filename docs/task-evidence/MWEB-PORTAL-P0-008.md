---
task_id: MWEB-PORTAL-P0-008
status: PARTIAL

reality_2026_003: PARTIAL
reality_2026_011: PASS

implementation_ref: b383c6a6

tests: PASS
integration: PARTIAL
e2e: NOT_RUN

migration: PASS

observability: PARTIAL
security_privacy: PARTIAL
rollback_recovery: NOT_RUN

task_scope_external_proof_required: true
external_runtime_validation: NOT_RUN
release_readiness: NOT_RUN
release_followups: "Authenticated staging/browser/device E2E, delivery/read-receipt proof lintas customer dan kurir, retention failure drill, review/appeal quality proof, dan release gate tetap ditunda sampai seluruh capability portal selesai."

unproven_requirements: "Authenticated staging/browser/device issue E2E; real customer/courier delivery and read-receipt proof; retention failure/recovery drill; customer approval untuk perubahan dan quality-score appeal/SLA proof bila dipakai dalam scope P0-008."
known_blockers: NONE
locally_actionable_remaining: "Complete customer approval untuk perubahan issue serta quality-score appeal/SLA semantics bila diperlukan oleh acceptance criteria; setelah capability scope selesai jalankan deferred cross-app dan release verification."
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
- Attachment memiliki moderation lifecycle `pending/approved/rejected`; hanya attachment approved yang dapat diunduh pihak lain, keputusan Admin masuk timeline/audit, dan reject wajib menyimpan alasan.
- Update case membuat durable notification outbox untuk customer dan courier terkait order; worker mengirim melalui komunikasi canonical order-service dengan event idempotency, retry/backoff, dan dead state.
- Retention worker mengklaim attachment kadaluarsa, menghapus private file, dan menyimpan state `cleanup_pending/cleaned/cleanup_failed` agar kegagalan tidak hilang tanpa jejak.
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
- `database/migrations/20261005000009_support_case_delivery_retention.sql`
- `database/migrations/20261005000010_support_case_attachment_moderation.sql`
- `backend/admin-service/src/workers/support-case-notification-worker.ts`
- `backend/admin-service/src/workers/support-case-retention-worker.ts`
- `admin-dashboard/src/pages/Cases.tsx`

## Verification

    command: VITE_API_URL=http://127.0.0.1:8080/api/v1 VITE_WEB_ORIGIN=http://127.0.0.1:3086 npm run build (working directory merchant-web)
    result: PASS

    command: npm test -- --runInBand src/supportCasesContract.test.ts src/services/supportCasePolicy.test.ts src/security/uploadSecurity.test.ts (working directory backend/admin-service)
    result: PASS — 3 suites, 12 tests

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
    result: PASS — 20261005000007 through 20261005000010 applied, including notification outbox, retention state, and moderation fields.

    command: go test ./... (working directory backend/merchant-service)
    result: PASS

    command: go test ./... (working directory backend/order-service)
    result: PASS — refund reconciliation proof test and all order-service packages passed.

    command: docker compose up -d --build --no-deps admin-service admin-dashboard merchant-web
    result: PASS — `tembus-admin`, `tembus-admin-ui`, and `tembus-merchant-web` rebuilt; all three runtime containers started.

    command: docker compose ps --format 'table {{.Service}}\t{{.State}}\t{{.Status}}' plus HTTP checks for `http://localhost:3087/health`, `http://localhost:3086/`, `http://localhost:3084/`, and `http://localhost:8083/health`
    result: PASS — relevant services running/healthy; all four endpoints returned HTTP 200.

    command: docker logs --since 90s tembus-admin
    result: PASS — `support_case_notification_worker_started` and `support_case_retention_worker_started` logged by the rebuilt Admin service.

    command: git diff --check
    result: PASS — no whitespace errors.

    command: git push origin staging
    result: PASS — implementation commit `b383c6a6` pushed to branch `staging`; this confirms branch synchronization only, not public deployment or UAT.

    command: Browser/staging/device E2E
    result: NOT_RUN — owner-approved feature-first queue

The queue is intentionally recorded as not run, not passed.

## Task-Local Verification

### Tests

Status: PASS

Evidence: Admin support policy/route contract suites passed, admin-service/merchant-web/admin-dashboard builds passed, and merchant-web lint passed.

### Integration

Status: PARTIAL

Evidence: Support API, private attachment metadata, authenticated download, Admin moderation action, Merchant Web form, durable notification outbox, retention worker, and order-service refund read-after-write reconciliation are wired to database-backed services; authenticated cross-app creation, delivery/read receipts, and failure-recovery drills remain deferred.

### E2E

Status: NOT_RUN

Evidence: Customer/courier/merchant issue creation, evidence, escalation, refund/compensation, and duplicate-action browser E2E remain queued.

### Migration

Status: PASS

Evidence: Goose applied `20261005000007_support_case_attachments.sql` and `20261005000008_support_case_resolution_codes.sql` to the local PgBouncer database; attachment metadata, indexes, grant, 30-day retention default, and controlled resolution-code constraint were created.

### Observability

Status: PARTIAL

Evidence: Support actions and both workers emit structured audit/correlation-aware logs with retry/dead/cleanup-failure states; live SLA/worker metrics and alerts remain deferred.

### Security / Privacy

Status: PARTIAL

Evidence: Tenant-scoped case access, reference ownership validation, redaction, role/threshold policy, private attachment download, magic-byte validation, idempotent checksum deduplication, moderation gate, and retention cleanup state exist; full abuse tests and failure/recovery drills remain.

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

- Customer/courier update delivery/read receipt and support escalation under authenticated cross-app conditions.
- Refund/compensation threshold, authenticated duplicate replay, and recovery drill.
- Authenticated staging/browser/device evidence.

## Locally Actionable Remaining

- Complete customer approval for issue changes and quality-score appeal/SLA semantics if required by the final P0-008 product flow; then run the deferred cross-app/release verification.

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

Customer approval/quality-score appeal semantics, authenticated customer/courier delivery proof, retention failure/recovery drill, and staging/device E2E.

## Next Eligible Task

CURRENT TASK — continue working; do not advance to P0-009 until the remaining P0-008 capability requirements are either implemented or explicitly scoped out by product.
