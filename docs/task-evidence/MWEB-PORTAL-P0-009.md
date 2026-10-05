---
task_id: MWEB-PORTAL-P0-009
status: PARTIAL
reality_2026_003: PARTIAL
reality_2026_011: PASS
implementation_ref: 1f239626
tests: PASS
integration: PARTIAL
e2e: NOT_RUN
migration: N/A
migration_na_reason: "No persistent schema change in this realtime UI increment."
observability: NOT_RUN
security_privacy: PARTIAL
rollback_recovery: PARTIAL
task_scope_external_proof_required: true
external_runtime_validation: NOT_RUN
release_readiness: NOT_RUN
release_followups: "Replay/DLQ, metrics/alerts, browser notification policy, worker restart, and staging/device recovery proof remain deferred."
unproven_requirements: "Replay/DLQ implementation, freshness/lag metrics and alerts, browser notification preference/delivery receipt, worker restart recovery, and full disconnect/duplicate/late-event/multiple-tab recovery E2E."
known_blockers: NONE
locally_actionable_remaining: "Implement the remaining replay, metrics, notification policy, and worker recovery paths, then run recovery scenarios."
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

## Files Changed

- `merchant-web/src/lib/realtime.ts` — sequence/version-aware deduplication untuk event order.
- `merchant-web/src/pages/Orders.tsx` — freshness timestamp dan stale-data warning.
- `merchant-web/src/components/Layout.tsx` — network state dan server notification inbox yang sudah ada.

## Commands / Checks Run

    command: npm run lint (merchant-web)
    result: PASS — 0 errors; existing non-blocking warnings only.

    command: VITE_API_URL=http://127.0.0.1:8080/api/v1 VITE_WEB_ORIGIN=http://127.0.0.1:3086 npm run build (merchant-web)
    result: PASS — TypeScript and Vite production build completed.

## Remaining Requirements

Replay/DLQ, freshness/lag metrics and alerts, browser notification policy, worker restart recovery, and full staging/browser/device resilience proof remain PARTIAL/NOT_RUN. This evidence does not claim release readiness.

