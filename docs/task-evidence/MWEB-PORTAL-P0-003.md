---
task_id: MWEB-PORTAL-P0-003
status: PARTIAL

reality_2026_003: PARTIAL
reality_2026_011: PASS

implementation_ref: WORKTREE-2026-10-05-substitution-http-idempotency

tests: PASS
integration: NOT_RUN
e2e: NOT_RUN

migration: PASS
migration_na_reason: "N/A — migration applicable untuk atomic substitution resolution dan sudah diverifikasi pada database Docker/PgBouncer."

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
- Merchant Web menampilkan panel timeline dan ringkasan pembayaran/refund dari endpoint authoritative; tidak menghitung ulang total atau status dari data UI. Queue juga mencakup seluruh status assignment/pickup/delivery serta terminal failed/refund/dispute dari order-service.
- Merchant Web kini mengambil katalog aktif dari database untuk memilih item pengganti dan mengirim proposal substitution melalui merchant-service ke internal order-service. Customer decision tetap authoritative di order-service; portal tidak menerima harga dari client.
- Existing reject/refund item flow tetap dipakai dan tidak diganti dengan mock atau angka hardcode.
- Resolusi substitution memakai migration `20261005000001`, row lock, guard `resolved = false`, dan unique pending-item index agar keputusan customer tidak dapat diproses dua kali.
- Mutation HTTP item-unavailable, proposal, dan keputusan customer sekarang memakai `RequireIdempotencyKey` berbasis PostgreSQL; proxy Merchant Web meneruskan key yang sama ke internal order-service sehingga retry payload yang sama dapat direplay tanpa membuat command kedua.
- Merchant Web order list/detail di-refresh melalui realtime event dan polling fallback sehingga perubahan server dapat masuk kembali setelah reconnect.
- Merchant cancellation setelah order diterima (preparing/searching/accepted/picking_up) sekarang melewati endpoint internal order-service. Ownership merchant diverifikasi ulang terhadap order canonical; state machine memutuskan kelayakan, lalu refund policy, pelepasan courier leg, audit event, inventory release, dan tip refund tetap berada di order-service.
- Merchant rejection pada status `pending_merchant` sekarang memakai boundary internal yang sama; structured `reject_reason` dan `charge_cancellation_fee_to=merchant` ikut masuk ke request canonical sehingga transition, audit, refund penuh, pelepasan stok/leg, dan fee merchant tidak lagi terpecah dalam update langsung + worker refund terpisah.

## Files Changed

- `backend/merchant-service/internal/domain/merchant_order.go` — optional transition/detail repository contracts.
- `backend/merchant-service/internal/domain/merchant_service.go` — detail, timeline, courier, and financial read models plus service method.
- `backend/merchant-service/internal/repository/postgres_merchant_order_repository.go` — atomic merchant transition and database-backed detail query.
- `backend/merchant-service/internal/service/merchant_service.go` — route merchant actions through atomic transition capability with compatibility fallback.
- `backend/merchant-service/internal/handler/merchant_handler.go` and `backend/merchant-service/cmd/api/main.go` — authenticated detail route.
- `merchant-web/src/lib/types.ts`, `merchant-web/src/pages/Orders.tsx`, `merchant-web/src/components/OrderCard.tsx` — detail/timeline UI wired to API.
- `backend/order-service/internal/handler/food_substitution_handler.go` dan `backend/order-service/cmd/api/main.go` — internal service boundary untuk proposal merchant dengan API key dan merchant identity.
- `backend/order-service/internal/handler/internal_merchant_order_handler.go`, `backend/order-service/internal/service/order_read.go`, dan `backend/order-service/cmd/api/main.go` — internal merchant-cancel boundary dengan API key, ownership check, canonical transition, dan reason refund.
- `backend/order-service/internal/domain/order_transition.go`, `internal/repository/postgres_order_transition_repository.go`, dan `internal/service/order_read.go` — policy fee/reject reason ikut ditulis dalam transaksi lifecycle canonical.
- `backend/merchant-service/internal/service/substitution_service.go`, domain/handler/routes — authenticated portal proxy untuk proposal substitution.
- `backend/order-service/cmd/api/main.go`, `backend/merchant-service/internal/domain/requests.go`, `backend/merchant-service/internal/handler/merchant_handler.go`, `backend/merchant-service/internal/service/substitution_service.go`, dan `merchant-web/src/pages/Orders.tsx` — HTTP idempotency untuk command substitution/item-unavailable serta forwarding key portal.
- `merchant-web/src/pages/Orders.tsx` dan `merchant-web/src/components/StatusBadge.tsx` — queue dan label status courier/terminal diperluas agar tidak menghilangkan order yang sudah ditugaskan, gagal, refund, atau dispute.
- `backend/merchant-service/internal/domain/merchant_service.go`, `internal/service/merchant_service.go`, `internal/handler/merchant_handler.go`, dan `cmd/api/main.go` — cancel capability, route, friendly error mapping, dan permission boundary.
- `merchant-web/src/pages/Orders.tsx`, `merchant-web/src/components/OrderCard.tsx`, `merchant-web/src/components/StatusBadge.tsx` — aksi pembatalan dengan alasan wajib, idempotency key, dan canonical `cancelled` tab.
- `TASKS.md`, `task-merchant-web-growth-p0-p2-2026.md` — record owner-approved feature-first sequencing and active work.

## Commands / Checks Run

    command: gofmt -w backend/merchant-service/internal/domain/merchant_order.go backend/merchant-service/internal/domain/merchant_service.go backend/merchant-service/internal/service/merchant_service.go backend/merchant-service/internal/repository/postgres_merchant_order_repository.go backend/merchant-service/internal/handler/merchant_handler.go backend/merchant-service/cmd/api/main.go
    result: PASS

    command: go test ./... (working directory backend/merchant-service)
    result: PASS

    command: VITE_API_URL=http://127.0.0.1:8080/api/v1 VITE_WEB_ORIGIN=http://127.0.0.1:3086 npm run build (working directory merchant-web)
    result: PASS

    command: go test ./... (working directory backend/order-service)
    result: PASS

    command: go test ./... (working directory backend/merchant-service)
    result: PASS

    command: VITE_API_URL=http://127.0.0.1:8080/api/v1 VITE_WEB_ORIGIN=http://127.0.0.1:3086 npm run build (working directory merchant-web, after substitution UI wiring)
    result: PASS

    command: go test ./... (working directory backend/order-service)
    result: PASS

    command: goose -dir database/migrations postgres "postgres://postgres:1234@localhost:6432/tembus_session?sslmode=disable" up
    result: PASS — substitution resolution migration applied to Docker/PgBouncer database.

    command: docker compose up -d --build merchant-service order-service merchant-web
    result: PASS — local merchant/order/web containers healthy; this is not staging deployment evidence.

    command: go test ./internal/domain ./internal/handler ./internal/service ./cmd/api (working directory backend/order-service)
    result: PASS — merchant cancellation edges (preparing/accepted/picking_up allowed; picked_up rejected) are covered by the food state-machine tests.

    command: go test ./internal/domain ./internal/handler ./internal/service ./cmd/api (working directory backend/merchant-service)
    result: PASS — cancellation service/handler compiles and existing merchant service tests remain green.

    command: VITE_API_URL=https://api.bawain.my.id/api/v1 VITE_SOCKET_URL=wss://api.bawain.my.id/ws npm run build (working directory merchant-web)
    result: PASS — production TypeScript/Vite build.

    command: docker compose up -d --build --no-deps order-service merchant-service merchant-web; HTTP GET localhost health endpoints
    result: PASS — all three containers rebuilt; order=200, merchant=200, web=200. Worker startup remained healthy.

    command: curl POST /api/v1/internal/orders/merchant-cancel without X-Internal-Api-Key
    result: PASS — returns 401 ERR_UNAUTHORIZED and does not execute a transition.

    command: go test ./internal/domain ./internal/handler ./internal/service ./cmd/api (working directory backend/order-service, after unified merchant reject boundary)
    result: PASS — policy normalization and canonical cancellation/rejection code compile with existing order tests.

    command: go test ./internal/domain ./internal/handler ./internal/service ./cmd/api (working directory backend/merchant-service, after unified merchant reject boundary)
    result: PASS — merchant rejection/cancellation client compiles and existing service/handler tests remain green.

    command: git diff --check
    result: PASS

    command: go test ./... (working directory backend/order-service)
    result: PASS — seluruh package order-service tetap lulus setelah route idempotency dipasang.

    command: go test ./... (working directory backend/merchant-service)
    result: PASS — seluruh package merchant-service tetap lulus setelah proxy key ditambahkan.

    command: go build ./... (working directory backend/order-service dan backend/merchant-service)
    result: PASS

    command: VITE_API_URL=https://api.bawain.my.id/api/v1 VITE_WS_URL=wss://api.bawain.my.id VITE_SOCKET_URL=https://api.bawain.my.id npm run build && npm run lint (working directory merchant-web)
    result: PASS — build/lint lulus; lint hanya melaporkan 17 warning existing dan 0 error.

    command: docker compose up -d --build --no-deps order-service merchant-service merchant-web; HTTP GET localhost health endpoints
    result: PASS — ketiga image rebuild dan order=200, merchant=200, web=200.

## Task-Local Verification

### Tests

Status: PASS

Evidence: Merchant and order-service package tests passed after unifying rejection and cancellation on the canonical order boundary. The web TypeScript/Vite production build passed with the project-required API configuration. Frontend lint returned 0 errors and existing warnings only.

### Integration

Status: NOT_RUN

Evidence: Docker service rebuild and live database request against the new detail/substitution routes are deferred until the feature-first implementation batch is complete.

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
- Merchant Web loads active menu from database → proposes substitution through merchant-service → order-service validates merchant ownership and server price → customer decision.
- Merchant accept/reject/prepare/ready → Courier assignment/pickup/delivery → Customer confirmation.
- Timeout, duplicate click, refresh, multi-tab, reconnect, replayed/out-of-order event, worker restart, item unavailable, substitution approval/rejection, cancel, refund, partial refund, dispute, and failed states.
- Staging Docker rebuild/migration/runtime smoke, Android physical/emulator flows, security/accessibility/observability, rollback/recovery, and production release gate.

The queue is intentionally recorded as deferred, not passed.

## External Runtime / Release Validation

### Is external proof required by the original TASK-ID?

Value: `true`

Reason: Original acceptance explicitly requires browser cross-app Customer → Merchant → Courier → Customer proof.

### External Runtime Validation

Status: NOT_RUN

Evidence: Local service integration was rebuilt, but authenticated staging/device/cross-app lifecycle is deferred.

### Release Readiness

Status: NOT_RUN

Evidence: Release gate waits for the remaining portal feature slices.

### Release Follow-ups

- Full customer payment/order → merchant accept/reject/prepare/ready → courier pickup/delivery → customer completion.
- Timeout, duplicate click, refresh, multi-tab, reconnect/out-of-order/replay, cancellation, partial refund, dispute, receipt/print, and notification proof.

## Locally Actionable Remaining

- Complete courier/customer event delivery, timeout/reconnect/replay tests, cancellation/refund/dispute cross-app proof, and receipt/print verification. The merchant cancellation capability is implemented locally but still needs authenticated cross-app proof.

## External Blockers

NONE

## Owner Action Required

NONE

## Reality Gate Evaluation

### REALITY-2026-003 — Evidence-based Definition of Done

Status: PARTIAL

Evidence: Server-authoritative order detail/transition/substitution implementation and local package verification exist; cross-app original acceptance remains unproven.

### REALITY-2026-011 — No Fake Completeness

Status: PASS

Evidence: Deferred lifecycle/device/staging results are recorded as NOT_RUN and are not represented as success.

## Unproven / Remaining

Full cross-app lifecycle, timeout/reconnect/out-of-order/duplicate E2E, courier handoff, cancel/refund/dispute, receipt/print, and staging/device proof.

## Next Eligible Task

CURRENT TASK — continue working
