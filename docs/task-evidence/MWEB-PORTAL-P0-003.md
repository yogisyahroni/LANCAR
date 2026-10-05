---
task_id: MWEB-PORTAL-P0-003
status: PARTIAL

reality_2026_003: PARTIAL
reality_2026_011: PASS

implementation_ref: WORKTREE-2026-10-05

tests: PASS
integration: NOT_RUN
e2e: NOT_RUN

migration: N/A
migration_na_reason: "Vertical slice ini memakai kolom/tabel order food, event, payment, refund, dan settlement yang sudah ada; belum ada perubahan schema baru pada increment ini."

observability: NOT_RUN
security_privacy: PARTIAL
rollback_recovery: NOT_RUN

task_scope_external_proof_required: true
external_runtime_validation: NOT_RUN

release_readiness: NOT_RUN
release_followups: "Cross-app Customer → Merchant → Courier → selesai/refund, staging runtime, device/reconnect/replay, accessibility, security, observability, rollback, dan release gate sengaja ditunda sesuai owner-approved feature-first sequencing."

unproven_requirements: "Customer-to-courier lifecycle runtime proof; timeout/reconnect/out-of-order/duplicate-click E2E; customer approval substitution; cancellation/refund/dispute full path; receipt/print proof from staging; cross-app event delivery."
known_blockers: NONE

locally_actionable_remaining: "Lanjutkan implementasi lifecycle order, substitution/customer decision, issue/refund/dispute, realtime fallback, dan cross-app wiring. Setelah seluruh capability portal selesai, jalankan queue verifikasi yang ditunda dan perbaiki semua failure."

blocker_resolution_attempts: "Tidak ada blocker eksternal yang dipakai untuk menghentikan implementasi. Build web sempat berhenti karena VITE_API_URL belum diset, lalu dijalankan ulang dengan konfigurasi local yang sesuai."
unblock_condition: NONE

owner_action_required: false
owner_action_summary: NONE
verification_after_unblock: "Run authenticated browser E2E, staging smoke, Customer/Courier/Merchant Android flow, duplicate/stale/out-of-order/reconnect replay, and release-gate checks after feature scope is complete."

dependency_chain_blocked: false
next_eligible_task: NONE

updated_at: 2026-10-05
---

# Evidence — MWEB-PORTAL-P0-003

## Acceptance Criteria Source

Original requirements from `task-merchant-web-growth-p0-p2-2026.md`:

- Customer membuat order dan payment/authorization tercatat.
- Merchant menerima order, melihat SLA, dan menerima atau menolak dengan reason.
- Merchant memproses item serta item unavailable/substitution dengan kesempatan persetujuan customer.
- Kitchen/merchant menandai preparing, ready for pickup, dan handoff ke kurir.
- Courier mendapat assignment/pickup/delivery dan customer menerima konfirmasi.
- Merchant melihat detail, timeline, receipt, dan terminal state delivered/cancelled/refunded/partially refunded/disputed/failed.
- Transition authoritative, idempotent, punya actor/timestamp/state version/reason; refresh, multi-tab, duplicate click, reconnect, dan out-of-order event harus aman.

## Scope Implemented

- Merchant accept, ready, dan reject pada repository produksi sekarang memakai transition atomik berbasis row lock, server-side lifecycle guard, audit `order_events`, actor role, reason, event version, dan idempotency key stabil per order/action.
- Endpoint `GET /api/v1/merchant/orders/{id}` ditambahkan dengan ownership/tenant check di database.
- Detail order mengembalikan snapshot item, payment state/method, state version, courier assignment/status dengan nomor dimasking, ringkasan subtotal/biaya/promo/refund/net settlement, freshness timestamp, dan ordered transition timeline.
- Merchant Web menampilkan panel timeline dan ringkasan pembayaran/refund dari endpoint authoritative; tidak menghitung ulang total atau status dari data UI.
- Existing reject/refund item flow tetap dipakai dan tidak diganti dengan mock atau angka hardcode.

## Files Changed

- `backend/merchant-service/internal/domain/merchant_order.go` — optional transition/detail repository contracts.
- `backend/merchant-service/internal/domain/merchant_service.go` — detail, timeline, courier, and financial read models plus service method.
- `backend/merchant-service/internal/repository/postgres_merchant_order_repository.go` — atomic merchant transition and database-backed detail query.
- `backend/merchant-service/internal/service/merchant_service.go` — route merchant actions through atomic transition capability with compatibility fallback.
- `backend/merchant-service/internal/handler/merchant_handler.go` and `backend/merchant-service/cmd/api/main.go` — authenticated detail route.
- `merchant-web/src/lib/types.ts`, `merchant-web/src/pages/Orders.tsx`, `merchant-web/src/components/OrderCard.tsx` — detail/timeline UI wired to API.
- `TASKS.md`, `task-merchant-web-growth-p0-p2-2026.md` — record owner-approved feature-first sequencing and active work.

## Commands / Checks Run

    command: gofmt -w backend/merchant-service/internal/domain/merchant_order.go backend/merchant-service/internal/domain/merchant_service.go backend/merchant-service/internal/service/merchant_service.go backend/merchant-service/internal/repository/postgres_merchant_order_repository.go backend/merchant-service/internal/handler/merchant_handler.go backend/merchant-service/cmd/api/main.go
    result: PASS

    command: go test ./... (working directory backend/merchant-service)
    result: PASS

    command: VITE_API_URL=http://127.0.0.1:8080/api/v1 VITE_WEB_ORIGIN=http://127.0.0.1:3086 npm run build (working directory merchant-web)
    result: PASS

## Task-Local Verification

### Tests

Status: PASS

Evidence: Merchant service package tests passed after the transition/detail implementation. The web TypeScript/Vite production build passed with the project-required local API configuration.

### Integration

Status: NOT_RUN

Evidence: Docker service rebuild and live database request against the new detail route are deferred until the feature-first implementation batch is complete.

### E2E

Status: NOT_RUN

Evidence: Browser cross-app order lifecycle, duplicate click, refresh/multi-tab, reconnect/out-of-order event, courier handoff, customer substitution decision, cancel/refund/dispute, and receipt proof remain explicitly queued for the post-feature verification pass.

### Migration

Status: N/A

Evidence: No new migration was introduced by this vertical slice. It consumes existing food order, `order_events`, payment, refund, and merchant settlement schema.

### Security / Privacy

Status: PARTIAL

Evidence: Database ownership is checked on the detail and transition paths; customer/courier phone values are masked in terminal/courier detail views. Full security scan, tenant/RBAC matrix, rate-limit, and release-gate checks remain deferred.

### Rollback / Recovery

Status: NOT_RUN

Evidence: Deferred with the owner-approved verification queue; no recovery result is claimed.

## Deferred Verification Queue

- Customer creates food order → payment authorization → database → Merchant Web notification/detail.
- Merchant accept/reject/prepare/ready → Courier assignment/pickup/delivery → Customer confirmation.
- Timeout, duplicate click, refresh, multi-tab, reconnect, replayed/out-of-order event, worker restart, item unavailable, substitution approval/rejection, cancel, refund, partial refund, dispute, and failed states.
- Staging Docker rebuild/migration/runtime smoke, Android physical/emulator flows, security/accessibility/observability, rollback/recovery, and production release gate.

The queue is intentionally recorded as deferred, not passed.
