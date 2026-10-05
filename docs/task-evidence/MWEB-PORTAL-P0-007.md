---
task_id: MWEB-PORTAL-P0-007
status: PARTIAL
reality_2026_003: PARTIAL
reality_2026_011: PASS
implementation_ref: f22748fe
tests: PASS
integration: PARTIAL
e2e: NOT_RUN
migration: PASS
migration_na_reason: "N/A — finance schema and existing settlement tables are used; this batch adds no new finance migration."
observability: NOT_RUN
security_privacy: PARTIAL
rollback_recovery: PARTIAL
task_scope_external_proof_required: true
external_runtime_validation: NOT_RUN
release_readiness: NOT_RUN
release_followups: "Staging/UAT, payout-provider webhook, maker-checker console, export audit, and reconciliation recovery remain deferred."
unproven_requirements: "Independent approval console, provider webhook/polling UNKNOWN handling, mismatch queue actions, audited export, and full ledger-to-payout reconciliation E2E."
known_blockers: NONE
locally_actionable_remaining: "Implement and verify the independent approval console, provider UNKNOWN, mismatch action, audited export, and reconciliation workflows before release gate."
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

## Files Changed

- `merchant-web/src/pages/Settlements.tsx` — summary rekening masked, perubahan rekening guarded approval, finance statement, dan reconciliation warning.
- `merchant-web/src/lib/types.ts` — tipe statement/discrepancy dan metadata rekening merchant.
- `backend/merchant-service/internal/service/report_service.go` — settlement/withdrawal authority yang sudah ada dan dipakai UI.
- `backend/merchant-service/internal/repository/postgres_report_repository.go` — statement/discrepancy persistence yang sudah ada.

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

## Remaining Requirements

Provider webhook/polling UNKNOWN, independent maker-checker approval console, mismatch queue actions, audited export, and staging/cross-app reconciliation proof remain PARTIAL/NOT_RUN. The browser form is wired to the real step-up/approval-guarded endpoint, but its authenticated TOTP and Admin approval path remain unverified. This evidence does not claim production finance readiness.
