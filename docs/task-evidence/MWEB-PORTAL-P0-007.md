---
task_id: MWEB-PORTAL-P0-007
status: PARTIAL
reality_2026_003: PARTIAL
reality_2026_011: PASS
implementation_ref: WORKTREE-2026-10-05-payment-exception-actions
tests: PASS
integration: PARTIAL
e2e: NOT_RUN
migration: PASS
migration_na_reason: "N/A — existing finance tables remain canonical; this batch adds an append-only exception-action history migration."
observability: NOT_RUN
security_privacy: PARTIAL
rollback_recovery: PARTIAL
task_scope_external_proof_required: true
external_runtime_validation: NOT_RUN
release_readiness: NOT_RUN
release_followups: "Staging/UAT, live Xendit webhook/polling, vault secret provisioning, and full reconciliation recovery proof remain deferred."
unproven_requirements: "Live provider behavior, production vault response, and full ledger-to-payout reconciliation E2E."
known_blockers: NONE
locally_actionable_remaining: "Add authenticated provider webhook contract coverage and ledger-to-payout reconciliation flow before release gate; the local vault boundary is fail-closed and ready for owner/provider configuration."
blocker_resolution_attempts: NONE
unblock_condition: NONE
owner_action_required: false
owner_action_summary: NONE
verification_after_unblock: "Run authenticated finance browser flow, provider UNKNOWN/retry scenario, reconciliation invariant checks, and staging cross-app E2E."
dependency_chain_blocked: false
next_eligible_task: NONE
updated_at: 2026-10-05
---

# Evidence — MWEB-PORTAL-P0-007

## Acceptance Criteria Source

- Portal tidak menampilkan `berhasil` untuk payout/payment hanya karena request HTTP 200; status provider dan ledger harus authoritative.
- Setiap nominal dapat direkonsiliasi ke order IDs dan settlement IDs; total halaman, export, dan API konsisten.
- Refund, partial refund, adjustment, tax, commission, dan promo funding terpisah jelas serta tidak menduplikasi ledger entry.
- Payout account dan invoice sensitif dimasking; export membutuhkan permission dan audit.
- Mismatch menghasilkan alert/ticket dan tidak diam-diam dikoreksi oleh frontend.

## Scope Implemented

- Halaman keuangan tetap memakai settlement, withdrawal, dan finance statement dari API server; tidak menghitung ulang saldo dari angka presentasi.
- Ringkasan rekening payout menampilkan bank, pemilik, status verifikasi, dan nomor hanya dalam bentuk empat digit terakhir.
- Catatan transaksi menampilkan entry server-authoritative, nominal debit/kredit terpisah, serta peringatan pencocokan yang perlu ditinjau.
- Permintaan payout tetap guarded oleh TOTP/step-up, approval Admin terpisah, rentang nominal, saldo tersedia, dan idempotency key.
- Form perubahan rekening payout memakai endpoint server-authoritative yang sudah ada, meminta approval dengan `change_type=bank_account`, mengirim idempotency key, tidak menampilkan nomor rekening penuh, dan menunggu verifikasi ulang setelah perubahan.
- Admin memiliki antrean approval tenant-aware untuk perubahan merchant; approval/reject dikunci row-level, requester tidak dapat menyetujui atau menolak permintaannya sendiri, expiry dipaksakan oleh database path, dan alasan/referensi keputusan disimpan.
- Ekspor catatan keuangan tersedia melalui `POST /merchant/finance-statement/export`; CSV dibentuk dari projection immutable yang sama dengan halaman statement, memisahkan entry, total, dan discrepancy, serta diaudit oleh middleware mutation.
- Admin memiliki keputusan exception payment `OPEN → IN_REVIEW → RESOLVED/ACCEPTED` dengan row lock, role/TOTP/idempotency guard, catatan wajib, append-only `payment_reconciliation_exception_actions`, dan audit log. Keputusan hanya mengubah queue projection; payment intent, provider evidence, ledger, dan nominal payout tidak diubah.
- Provider payout berstatus `UNKNOWN` kini disimpan sebagai state retryable yang mencegah redispatch duplikat; worker recovery melakukan polling terkontrol dan hanya mengubah state setelah provider mengembalikan status authoritative.
- Adapter payout Xendit kini tersambung melalui Integration Gateway dengan idempotency key, status query, normalisasi status provider, serta masking response; konfigurasi default tetap `stub` dan tidak diklaim sebagai provider live.
- Dispatcher payout hanya membaca `courier_payout_accounts` kanonik dan menyelesaikan nomor rekening melalui `PAYOUT_ACCOUNT_VAULT_URL` pada boundary provider; vault yang kosong/gagal menahan payout dan menulis audit tanpa fallback ke kolom rekening legacy.
- Rekonsiliasi kini juga mengeluarkan exception kritis untuk provider `UNKNOWN` dan payout `failed` tanpa reversal `payout_failed`; frontend tidak mengoreksi ledger secara diam-diam.

## Files Changed

- `merchant-web/src/pages/Settlements.tsx` — summary rekening masked, perubahan rekening guarded approval, finance statement, dan reconciliation warning.
- `admin-dashboard/src/pages/MerchantSecurityApprovals.tsx` — antrean Admin untuk approve/reject approval merchant dengan alasan/referensi.
- `backend/admin-service/src/controllers/merchantSecurityApprovals.controller.ts` — list dan maker-checker decision API yang diaudit.
- `backend/admin-service/src/routes/admin.routes.ts` — route list/approve/reject dengan role, TOTP, dan idempotency guard.
- `database/migrations/20261005000006_merchant_security_approval_decisions.sql` — metadata reject dan index keputusan approval.
- `merchant-web/src/lib/types.ts` — tipe statement/discrepancy dan metadata rekening merchant.
- `backend/merchant-service/internal/service/report_service.go` — settlement/withdrawal authority yang sudah ada dan dipakai UI.
- `backend/merchant-service/internal/repository/postgres_report_repository.go` — statement/discrepancy persistence yang sudah ada.
- `backend/admin-service/src/controllers/platformOperations.controller.ts` — endpoint keputusan exception payment dengan transition guard dan audit.
- `backend/admin-service/src/routes/admin.routes.ts` — route exception decision dengan role, TOTP, dan idempotency guard.
- `admin-dashboard/src/pages/PlatformOperations.tsx` — queue exception payment dan form keputusan operator.
- `database/migrations/20261005000012_payment_reconciliation_exception_actions.sql` — riwayat keputusan exception append-only/idempotent.
- `database/migrations/20261005000014_payout_provider_unknown_recovery.sql` — state UNKNOWN, active-dispatch guard, recovery index, dan polling batch config.
- `backend/admin-service/src/services/payoutProviderDispatcher.ts` — provider status UNKNOWN dan polling recovery tanpa redispatch.
- `backend/admin-service/src/services/payoutProviderDispatcher.ts` — canonical payout-account join dan fail-closed vault resolver.
- `backend/admin-service/src/workers/payout-dispatcher-worker.ts` — menjalankan recovery polling bersama dispatcher.
- `backend/admin-service/src/controllers/finance.controller.ts` — menerima status provider UNKNOWN sebagai hasil ambigu yang retryable.
- `backend/integration-gateway/internal/provider/xendit.go` — create/query disbursement Xendit dengan reference provider.
- `backend/integration-gateway/internal/handler/payment_handler.go` — boundary internal query status disbursement.
- `database/migrations/20261005000015_payout_reconciliation_completeness.sql` — check type exception provider UNKNOWN dan reversal payout gagal.
- `backend/admin-service/src/services/payoutReconciliation.ts` — exception reconciliation tambahan.
- `docker-compose.yml` — DATABASE_URL durable untuk POS gateway, provider/vault/AV configuration boundaries.

## Commands / Checks Run

    command: npm run lint (merchant-web)
    result: PASS — 0 errors; existing non-blocking warnings only.

    command: VITE_API_URL=http://127.0.0.1:8080/api/v1 VITE_WEB_ORIGIN=http://127.0.0.1:3086 npm run build (merchant-web)
    result: PASS — TypeScript and Vite production build completed.

    command: go test ./... (backend/merchant-service)
    result: PASS — targeted merchant-service suite passed before this UI-only increment.

    command: docker compose up -d --build merchant-service merchant-web
    result: PASS — rebuilt and restarted local merchant-service and merchant-web images.

    command: Invoke-WebRequest http://localhost:8085/health; Invoke-WebRequest http://localhost:3086/
    result: PASS — merchant-service returned HTTP 200/healthy and merchant-web returned HTTP 200.

    command: Invoke-WebRequest GET /api/v1/merchant/audit-logs?limit=5 and format=csv with sanitized merchant portal headers
    result: PASS — JSON and CSV audit endpoints returned HTTP 200 with tenant-scoped empty data.

    command: goose -dir database/migrations postgres "postgres://postgres:1234@localhost:6432/tembus_session?sslmode=disable" up
    result: PASS — applied 20261005000006_merchant_security_approval_decisions.sql.

    command: npm run build (backend/admin-service)
    result: PASS — TypeScript compilation completed.

    command: go test ./... (backend/merchant-service)
    result: PASS — finance export service/handler contract compiled with the existing merchant service suite.

    command: npx tsc -b; npx vite build (merchant-web)
    result: PASS — finance export action and download UI compiled and bundled.

    command: docker compose up -d --build --no-deps merchant-service merchant-web; GET /health; GET /
    result: PASS — refreshed containers started; merchant-service and merchant-web returned HTTP 200.

    command: unauthenticated POST /api/v1/merchant/finance-statement/export
    result: PASS — request was rejected with HTTP 401; export remains behind merchant authentication and scope resolution.

    command: npm run lint (admin-dashboard)
    result: PASS — 0 errors; repository has existing non-blocking warnings.

    command: VITE_API_URL=https://api.bawain.my.id/api/v1 VITE_SOCKET_URL=wss://api.bawain.my.id npm run build (admin-dashboard)
    result: PASS — production env validation, TypeScript compilation, and Vite build completed.

    command: goose -dir database/migrations postgres "postgres://postgres:1234@localhost:6432/tembus_session?sslmode=disable" up
    result: PASS — applied 20261005000012_payment_reconciliation_exception_actions.sql.

    command: npm test -- --runInBand src/platformHardeningContract.test.ts src/routes.test.ts (backend/admin-service)
    result: PASS — 2 suites, 40 tests.

    command: npm run build (backend/admin-service)
    result: PASS — TypeScript compilation completed with the exception decision controller.

    command: npm test -- --runInBand src/services/paymentExceptionPolicy.test.ts (backend/admin-service)
    result: PASS — 1 suite, 2 tests covering valid review/reopen transitions and invalid terminal jumps.

    command: VITE_API_URL=https://api.bawain.my.id/api/v1 VITE_WS_URL=wss://api.bawain.my.id VITE_SOCKET_URL=https://api.bawain.my.id npm run build (admin-dashboard)
    result: PASS — dashboard exception queue compiled and bundled; existing large-chunk warning only.

    command: docker compose up -d --build --no-deps admin-service admin-dashboard; GET http://localhost:8081/health; GET http://localhost:3084/
    result: PASS — both images rebuilt; admin-service healthy and both endpoints returned HTTP 200.

    command: docker compose up -d --build --no-deps admin-service; docker compose ps admin-service
    result: PASS — latest policy/controller image rebuilt and container returned to healthy state.

    command: unauthenticated PATCH http://localhost:8080/api/v1/admin/payment/exceptions/:id
    result: PASS — gateway rejected the protected decision route with HTTP 401.

    command: npm test -- --runInBand src/services/payoutProviderDispatcher.test.ts (backend/admin-service)
    result: PASS — 1 suite, 7 tests; idempotent dispatch, provider limit, kill switch, Xendit gateway payload boundary, payload masking, and webhook signature checks remain green.

    command: npm run build (backend/admin-service)
    result: PASS — TypeScript compilation completed with UNKNOWN recovery polling.

    command: goose -dir database/migrations postgres "postgres://postgres:1234@localhost:6432/tembus_session?sslmode=disable" up
    result: PASS — applied 20261005000014_payout_provider_unknown_recovery.sql.

    command: npm test -- --runInBand src/services/payoutReconciliation.test.ts src/services/payoutProviderDispatcher.test.ts
    result: PASS — 2 suites, 9 tests; provider UNKNOWN, missing payout reversal, and vault-boundary resolution are covered.

    command: go test ./internal/... && go build ./cmd/api (backend/integration-gateway)
    result: PASS — provider interface, Xendit adapter, query boundary, and existing gateway packages compiled and passed.

    command: docker compose up -d --build --no-deps admin-service; GET http://localhost:8081/health
    result: PASS — admin-service image rebuilt and returned HTTP 200.

    command: goose -dir database/migrations postgres "postgres://postgres:1234@localhost:6432/tembus_session?sslmode=disable" up
    result: PASS — applied 20261005000015_payout_reconciliation_completeness.sql.

    command: docker compose build integration-gateway admin-service merchant-service merchant-web
    result: PASS — all four updated images compiled and were exported successfully.

    command: docker compose up -d --no-deps integration-gateway admin-service merchant-service merchant-web
    result: PASS — updated containers restarted; integration gateway logged durable POS state initialization.

    command: Invoke-WebRequest http://localhost:8081/health; Invoke-WebRequest http://localhost:8085/health; Invoke-WebRequest http://localhost:3086/; Invoke-WebRequest http://localhost:8080/health
    result: PASS — admin-service, merchant-service, merchant-web, and API gateway returned HTTP 200.

## Remaining Requirements

Live provider webhook/polling, production vault response, and staging/cross-app reconciliation proof remain PARTIAL/NOT_RUN. The local Xendit adapter/query boundary, canonical vault resolver, audited export, exception queue, UNKNOWN recovery, and ledger reversal checks are wired to guarded server paths, but no real provider call or production finance readiness is claimed.
