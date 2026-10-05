---
task_id: MWEB-PORTAL-P0-009
status: PARTIAL
reality_2026_003: PARTIAL
reality_2026_011: PASS
implementation_ref: a9a7beef
tests: PASS
integration: PARTIAL
e2e: NOT_RUN
migration: N/A
migration_na_reason: "No persistent schema change in this realtime UI increment."
observability: PARTIAL
security_privacy: PARTIAL
rollback_recovery: PARTIAL
task_scope_external_proof_required: true
external_runtime_validation: NOT_RUN
release_readiness: NOT_RUN
release_followups: "Communication delivery worker/replay drill, freshness/lag SLO alerts, browser notification delivery receipt, worker restart, and staging/device recovery proof remain deferred."
unproven_requirements: "Delivery-worker replay/DLQ execution, freshness/lag SLO alerts, browser notification delivery receipt, worker restart recovery, and full disconnect/duplicate/late-event/multiple-tab recovery E2E."
known_blockers: NONE
locally_actionable_remaining: "Implement/verify the delivery worker and replay/DLQ execution path, freshness/lag SLO alerts, and delivery receipt projection; then run recovery scenarios."
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
- Order-service sudah memiliki kontrak canonical communication dengan idempotent event creation, preference/quiet-hours policy, delivery receipt state, retry cap, dead-letter classification, replay endpoint, dan aggregate delivery-health endpoint untuk Admin.

## Files Changed

- `merchant-web/src/lib/realtime.ts` — sequence/version-aware deduplication untuk event order.
- `merchant-web/src/pages/Orders.tsx` — freshness timestamp dan stale-data warning.
- `merchant-web/src/components/Layout.tsx` — network state dan server notification inbox yang sudah ada.
- `merchant-web/src/pages/Settings.tsx` — preferensi notifikasi operasional dan browser permission state.
- `backend/order-service/internal/handler/communication_handler.go` — receipt, replay, preference, dan delivery-health routes.
- `backend/order-service/internal/repository/communication_repository.go` — idempotency, retry cap, dead-letter classification, dan aggregate health query.

## Commands / Checks Run

    command: npm run lint (merchant-web)
    result: PASS — 0 errors; existing non-blocking warnings only.

    command: VITE_API_URL=http://127.0.0.1:8080/api/v1 VITE_WEB_ORIGIN=http://127.0.0.1:3086 npm run build (merchant-web)
    result: PASS — TypeScript and Vite production build completed.

    command: npm run lint (merchant-web)
    result: PASS — 0 errors; existing non-blocking warnings only.

    command: git diff --check
    result: PASS — no whitespace errors.

    command: git push origin staging
    result: PASS — implementation commit `a9a7beef` pushed to branch `staging`; this confirms branch synchronization only, not public deployment or UAT.

## Remaining Requirements

Replay/DLQ, freshness/lag metrics and alerts, browser notification policy, worker restart recovery, and full staging/browser/device resilience proof remain PARTIAL/NOT_RUN. This evidence does not claim release readiness.
