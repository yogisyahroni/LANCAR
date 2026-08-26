# Merchant App SLA — 11.4 (FCM alert + prep timer + partial reject)

Branch `agent/merchant-sla` (worktree `LANCAR-wt-merchant`). Android merchant app only.

## What changed (DONE)
1. **Order alert reliable (FCM)** — app now wires Firebase Cloud Messaging.
   - `OrderAlertService` (FirebaseMessagingService) receives data-only push
     (`type=new_food_order`) from `push_service.go` and shows the local
     `order_baru` HIGH-importance notification in **foreground / background / killed**.
   - `DeviceTokenRegistrar` registers the FCM token to backend
     `POST /api/v1/device-tokens` (FOOD-BIKE-064) on login + on `onNewToken`.
   - `OrderPollWorker` (WorkManager, 15 min) is the **fallback** so the SLA alert
     still fires when FCM is absent (placeholder `google-services.json`, no Play Services, etc).
   - `google-services.json` placeholder + firebase-messaging + work-runtime deps added.
   - *Realistic-for-build-without-secret:* placeholder `google-services.json`
     (project_number/key are stubs). Replace with the real Firebase project file
     before release. push_service.go already sends to registered tokens.

2. **Prep timer countdown (FB-125 done + 11.4 UI)** — `OrderCard` now shows a live
   `mm:ss` countdown to `foodReadyAt` (backend = accepted_at + prep_time_minutes),
   turns red/"waktu habis" at 0. `HomeViewModel.tickPrepTimers()` ticks every 1s.

3. **Partial reject UI (11.4)** — "Sebagian Item Habis" button on `preparing` orders
   opens `PartialRejectOrderDialog`: pick unavailable items (qty) + reason →
   `POST /api/v1/merchant/orders/{id}/reject-items` with `ItemRejectRequest[]`.

## BLOCKED / needs another agent (backend)
- **The merchant-facing `POST /api/v1/merchant/orders/{id}/reject-items` endpoint
  does NOT exist yet.** Only the internal `/api/v1/internal/refunds/items`
  (FB-080 `CreateItemRefund`, no auth) exists. The app client + UI are ready and
  call the new route; the backend must add the merchant-authenticated route that
  validates the merchant owns the order, then calls `CalculateItemRefund`
  (FB-080) — ongkir not refunded by default per spec. Until then the partial-reject
  button will 404. This is backend scope (not touched per task rules).

## Build
`cd android-app-merchant && ./gradlew compileDebugKotlin` → BUILD SUCCESSFUL.
(Requires network for first Firebase/WorkManager artifact download.)
