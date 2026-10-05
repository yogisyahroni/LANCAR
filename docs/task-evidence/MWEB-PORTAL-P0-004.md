---
task_id: MWEB-PORTAL-P0-004
status: PARTIAL

reality_2026_003: PARTIAL
reality_2026_011: PASS
implementation_ref: WORKTREE-2026-10-05
tests: PASS
integration: PASS
e2e: NOT_RUN
migration: PASS
migration_na_reason: "N/A — migration applicable dan sudah diverifikasi dengan goose pada database Docker/PgBouncer."
observability: NOT_RUN
security_privacy: PARTIAL
rollback_recovery: PASS
task_scope_external_proof_required: true
external_runtime_validation: NOT_RUN
release_readiness: NOT_RUN
release_followups: "Authenticated staging, browser/device E2E, sold-out race/reconnect, upload security/virus scan, multi-outlet projection, and release gate masih ditunda sampai feature scope selesai."
unproven_requirements: "Full catalog review approval, sold-out race proof, image policy/virus scan, multi-outlet central-vs-local projection, and authenticated staging E2E."
known_blockers: NONE
locally_actionable_remaining: "Tambahkan review/approval catalog, upload security policy, multi-outlet projection, dan contract tests untuk stale-cache/sold-out sebelum deferred runtime verification."
blocker_resolution_attempts: NONE
unblock_condition: NONE
owner_action_required: false
owner_action_summary: NONE
verification_after_unblock: "Run merchant-to-customer catalog E2E, sold-out race, modifier validation, import replay, rollback, and image policy checks."
dependency_chain_blocked: false
next_eligible_task: NONE
updated_at: 2026-10-05
---

# Evidence — MWEB-PORTAL-P0-004

## Acceptance Criteria Source

- Merchant mengelola kategori, item, foto, nama/deskripsi, harga, prep time, visibility, jam tersedia, stok, dan sold-out.
- Variant/modifier memiliki pilihan wajib/opsional, minimum/maksimum, price delta, dependency, dan konflik yang tervalidasi server.
- Bulk import/export memiliki schema validation, preview/dry-run, rollback/versioning, duplicate detection, image constraints, dan audit.
- Draft → review → publish → rollback menghasilkan catalog customer yang konsisten dan dapat ditelusuri.

## Scope Implemented

- Import CSV Merchant Web sekarang mengirim raw CSV satu kali ke `/merchant/menu/import`.
- Server menjadi pemilik parsing, validation, idempotency, audit, dan batch commit; browser tetap hanya menampilkan preview.
- Import tidak lagi melakukan loop POST per baris yang dapat meninggalkan catalog setengah tersimpan.
- Readiness catalog menghitung versi catalog, item eligible, moderation pending, invalid field, dan publikasi terakhir dari database.
- Publish membuat snapshot immutable berisi item, gambar, dan modifier di dalam transaksi serta idempotent terhadap actor/merchant.
- Rollback membuat publikasi baru dari snapshot target tanpa memutasi riwayat publikasi.
- Customer detail dan discovery preview membaca publikasi terbaru; availability, stok, jadwal, dan enforcement tetap dibaca dari state live untuk mencegah order sold-out.
- Migration `20261005000002` dan repair backfill `20261005000003` membuat serta mengisi snapshot publikasi pada database Docker.

## Verification

    command: VITE_API_URL=http://127.0.0.1:8080/api/v1 VITE_WEB_ORIGIN=http://127.0.0.1:3086 npm run build (working directory merchant-web)
    result: PASS

    command: go test ./... (working directory backend/merchant-service)
    result: PASS

    command: go test ./... (working directory backend/order-service)
    result: PASS

    command: npm test -- --runInBand src/supportCasesContract.test.ts src/services/supportCasePolicy.test.ts (working directory backend/admin-service)
    result: PASS — 2 suites, 5 tests

    command: goose -dir database/migrations postgres "postgres://postgres:1234@localhost:6432/tembus_session?sslmode=disable" up
    result: PASS — migrations 20261005000001, 20261005000002, and 20261005000003 applied to Docker/PgBouncer database.

    command: docker compose up -d --build merchant-service order-service merchant-web
    result: PASS — merchant, order, and web containers healthy; health endpoints returned 200.

    command: Authenticated local API readiness/publication, publish, rollback, customer detail, and customer discovery preview
    result: PASS — local Docker database/API returned 200/201; catalog snapshot and modifier data were visible to customer detail/discovery. This is local integration evidence, not staging proof.

## Task-Local Verification

### Tests

Status: PASS

Evidence: Merchant/order package tests and Merchant Web production build passed.

### Integration

Status: PASS

Evidence: Docker services were rebuilt and authenticated readiness/publication/publish/rollback plus customer detail/discovery requests were executed against the service-visible database.

### E2E

Status: NOT_RUN

Evidence: Full browser customer checkout, stale-cache sold-out race, multi-outlet switching, and upload/security flows remain in the deferred feature verification queue.

### Migration

Status: PASS

Evidence: Goose applied the catalog publication schema and item backfill to the Docker/PgBouncer database; customer and merchant routes then used the tables successfully.

### Observability

Status: NOT_RUN

Evidence: Structured request logs exist, but freshness/lag dashboards and alert proof are deferred.

### Security / Privacy

Status: PARTIAL

Evidence: Publication and rollback require authenticated merchant ownership and idempotency; upload MIME/dimension/virus/CDN policy and full tenant/RBAC review remain unproven.

### Rollback / Recovery

Status: PASS

Evidence: Authenticated rollback from publication version 2 to version 1 created publication version 3 from the immutable snapshot. Production/staging rollback drill remains deferred.

## External Runtime / Release Validation

### Is external proof required by the original TASK-ID?

Value: `true`

Reason: The acceptance criteria require customer-visible catalog consistency and the broader portal release gate requires authenticated cross-app proof.

### External Runtime Validation

Status: NOT_RUN

Evidence: Local Docker integration passed; authenticated staging and customer/courier device flows have not run.

### Release Readiness

Status: NOT_RUN

Evidence: Release gate is intentionally deferred until the remaining portal capabilities are implemented.

### Release Follow-ups

- Authenticated staging catalog publish/rollback.
- Customer checkout with stale cache and sold-out race.
- Image upload validation, malware/virus scan, CDN fallback, alt text, and expiry.
- Multi-outlet scope/override and rollback proof.

## Locally Actionable Remaining

- Implement/verify catalog review approval and moderation handoff.
- Complete image security policy and multi-outlet catalog projection.
- Add stale-cache/sold-out race and modifier contract coverage.

## External Blockers

NONE

## Owner Action Required

NONE

## Reality Gate Evaluation

### REALITY-2026-003 — Evidence-based Definition of Done

Status: PARTIAL

Evidence: Implementation, local integration, migration, and rollback are real and recorded; original acceptance requirements remain for review, image security, multi-outlet, and full E2E.

### REALITY-2026-011 — No Fake Completeness

Status: PASS

Evidence: Local Docker results are explicitly separated from staging/release claims; remaining requirements remain unproven.

## Unproven / Remaining

Full original catalog review/moderation, multi-outlet central-vs-local behavior, image security/virus/CDN policy, stale-cache sold-out race, and authenticated staging E2E.

## Next Eligible Task

CURRENT TASK — continue working
