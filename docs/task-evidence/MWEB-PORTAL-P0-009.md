---
task_id: MWEB-PORTAL-P0-009
status: PARTIAL
reality_2026_003: PARTIAL
reality_2026_011: PASS
implementation_ref: 617d127b
tests: PASS
integration: PARTIAL
e2e: NOT_RUN
migration: PASS
migration_na_reason: NONE
observability: PARTIAL
security_privacy: PARTIAL
rollback_recovery: PARTIAL
task_scope_external_proof_required: true
external_runtime_validation: NOT_RUN
release_readiness: NOT_RUN
release_followups: "Replay/DLQ fault-injection drill, worker restart recovery, and full staging/browser/device resilience proof remain deferred until the feature-complete portal pass is finished."
unproven_requirements: "Full disconnect/duplicate/late-event/multiple-tab recovery E2E, replay/DLQ fault-injection proof, provider timeout proof, and release readiness."
known_blockers: NONE
locally_actionable_remaining: "NONE for feature implementation; recovery and staging/device validation are intentionally deferred to the qualification phase after all portal capabilities are implemented."
blocker_resolution_attempts: NONE
unblock_condition: NONE
owner_action_required: false
owner_action_summary: NONE
verification_after_unblock: "Run browser disconnect/reconnect, duplicate/late sequence, multi-tab, worker restart, provider timeout, and event freshness measurements in staging."
dependency_chain_blocked: false
next_eligible_task: NONE
updated_at: 2026-10-05
---

# Evidence — MWEB-PORTAL-P0-009

## Acceptance Criteria Source

- Simulasi disconnect, duplicate event, event terlambat, refresh, multiple tabs, worker restart, dan provider timeout menghasilkan state akhir yang benar.
- Merchant tahu apakah data live, stale, atau sedang disinkronkan; UI tidak menampilkan angka yang tampak live tanpa freshness.
- SLO/SLA order notification, accept latency, command error, and data freshness dicatat dan memiliki alert.
- Recovery test membuktikan order tidak hilang, tidak terima dua kali, dan tidak membuat settlement ganda.

## Scope Implemented

- Order board tetap memuat snapshot server secara berkala dan saat menerima invalidation event; event tidak pernah menjadi sumber state.
- Event realtime sekarang menyimpan sequence/version terakhir per order dan mengabaikan duplicate atau event yang datang terlambat.
- Papan pesanan menampilkan waktu sinkronisasi terakhir dan banner stale ketika refresh gagal, sehingga tidak menyamarkan data lama sebagai data live.
- Layout portal sudah memiliki network degraded/offline state dan inbox notifikasi dari server.
- Portal Settings sekarang membaca dan menyimpan preferensi notifikasi operasional dari endpoint database-authoritative, serta menyediakan permintaan permission notifikasi desktop tanpa menganggap permission sebagai delivery success.
- Order-service sudah memiliki kontrak canonical communication dengan idempotent event creation, preference/quiet-hours policy, delivery receipt state, retry cap, dead-letter classification, replay endpoint, aggregate delivery-health endpoint untuk Admin, dan worker durable yang claim dengan `FOR UPDATE SKIP LOCKED`, recover row `processing` yang stale, mencatat retry/dead-letter, serta mengirim in-app receipt setelah projection tersedia.
- Read receipt inbox kini memperbarui projection `communication_deliveries` dalam transaksi yang sama, sehingga state yang dilihat user dan receipt delivery tidak berjalan sendiri-sendiri.
- Admin delivery health sekarang mengembalikan alert untuk delivery dead-letter dan queued/processing yang stale lebih dari 60 detik.

## Files Changed

- `merchant-web/src/lib/realtime.ts` — sequence/version-aware deduplication untuk event order.
- `merchant-web/src/pages/Orders.tsx` — freshness timestamp dan stale-data warning.
- `merchant-web/src/components/Layout.tsx` — network state dan server notification inbox yang sudah ada.
- `merchant-web/src/pages/Settings.tsx` — preferensi notifikasi operasional dan browser permission state.
- `backend/order-service/internal/handler/communication_handler.go` — receipt, replay, preference, dan delivery-health routes.
- `backend/order-service/internal/repository/communication_repository.go` — idempotency, durable claim/recovery/failure transitions, receipt projection, retry cap, dead-letter classification, dan health/lag query.
- `backend/order-service/internal/repository/notification_repo.go` — transactional inbox read receipt projection.
- `backend/order-service/internal/worker/communication_delivery_worker.go` — durable delivery worker dan provider failure classification.
- `backend/order-service/internal/worker/communication_delivery_worker_test.go` — unit contract provider timeout, HTTP failure, invalid token, dan missing provider.
- `backend/order-service/cmd/api/main.go` — worker wiring pada runtime order-service.
- `database/migrations/20261005000011_communication_delivery_worker.sql` — delivery status/claim/recovery fields dan index.
- `admin-dashboard/src/pages/CommunicationDeliveryHealth.tsx` — alert stale/dead-letter untuk operator.

## Commands / Checks Run

    command: npm run lint (merchant-web)
    result: PASS — 0 errors; existing non-blocking warnings only.

    command: VITE_API_URL=http://127.0.0.1:8080/api/v1 VITE_WEB_ORIGIN=http://127.0.0.1:3086 npm run build (merchant-web)
    result: PASS — TypeScript and Vite production build completed.

    command: npm run lint (merchant-web)
    result: PASS — 0 errors; existing non-blocking warnings only.

    command: git diff --check
    result: PASS — no whitespace errors.

    command: goose -dir database/migrations postgres <local database URL> up && goose ... status
    result: PASS — migration `20261005000011_communication_delivery_worker.sql` applied; database reports current version `20261005000011`.

    command: go test ./internal/worker ./internal/repository ./internal/handler ./internal/service ./cmd/api (backend/order-service)
    result: PASS — targeted worker, repository, handler, service, and API packages.

    command: VITE_API_URL=https://api.bawain.my.id VITE_SOCKET_URL=wss://api.bawain.my.id/ws npm run build (admin-dashboard)
    result: PASS — TypeScript/Vite production build completed; only existing chunk-size warning.

    command: docker compose up -d --build --no-deps order-service admin-dashboard
    result: PASS — images rebuilt and containers recreated.

    command: docker compose ps order-service admin-dashboard; Invoke-WebRequest http://localhost:8083/health; Invoke-WebRequest http://localhost:3086/
    result: PASS — order-service healthy, order health `200`, admin dashboard `200`.

    command: docker logs --since 20s tembus-order
    result: PASS — `communication_delivery_worker_started` present; no worker error after the SQL claim/failure fixes.

    command: docker compose exec -T db psql -U postgres -d tembus <delivery health query>
    result: PASS — canonical delivery-health query executes against Docker PostgreSQL; no delivery events existed in the current 24-hour window.

    command: git push origin staging
    result: PASS — implementation commit `617d127b` pushed to branch `staging`; this confirms branch synchronization only, not public deployment or UAT.

## Remaining Requirements

Replay/DLQ and worker restart are implemented but their fault-injection proof is deferred. Full staging/browser/device resilience and release readiness remain NOT_RUN. This evidence does not claim release readiness.
