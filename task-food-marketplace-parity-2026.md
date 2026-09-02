# Task — LANCAR Multi-Service Marketplace 2026: End-to-End Parity, UI/UX & Production Hardening

> **Historical filename retained intentionally:** `task-food-marketplace-parity-2026.md`.
> File ini awalnya audit Food. File yang sama sekarang menjadi **master implementation checklist** untuk seluruh marketplace LANCAR agar histori task Food tidak terputus.

**Status:** OPEN  
**Priority:** P0 → P2  
**Baseline branch:** `staging`  
**Services in scope:** Paket On-Demand, Food, Tambal Ban, Aggregator Paket Antar-Kota, Towing  
**Customer surfaces:** Android untuk 5 layanan; Customer Web untuk Paket On-Demand + Aggregator  
**Operational surfaces:** Merchant Android (Food), Courier Android, Admin Dashboard, Order Service, Merchant Service, Payment, Routing/Maps, Integration Gateway, Notifications, Tracking, Observability, QA  
**Benchmark principle:** gunakan pola operasional marketplace/logistics modern sebagai referensi fungsi; jangan clone proprietary UI.

---

# 0. CARA MENGGUNAKAN MASTER TASK

- [ ] Semua checkbox tetap kosong sampai implementasi, test, observability, dan acceptance criteria benar-benar selesai.
- [ ] Screen/endpoint yang sudah terlihat bukan berarti flow production-ready.
- [ ] Harga, ETA, availability, order state, payout, refund, carrier status, dan financial result harus server-authoritative.
- [ ] Semua order creation dan mutation finansial wajib mempunyai idempotency strategy.
- [ ] Realtime/WebSocket/push hanyalah transport optimasi; REST snapshot tetap authoritative recovery path.
- [ ] Semua manual override admin wajib menyimpan actor, reason, previous value, new value, timestamp, dan correlation/trace id.
- [ ] Edit file existing jika ownership masih tepat; buat file baru hanya jika separation of concern membaik.
- [ ] Nama file baru di task adalah rekomendasi implementasi dan harus dicek terhadap tree/schema terbaru sebelum dibuat.
- [ ] Jangan launch production sebelum seluruh P0 dan mandatory E2E scenario applicable green.

---

# 1. BATAS DOMAIN YANG WAJIB DIPEGANG

## 1.1 Paket On-Demand ≠ Aggregator Antar-Kota

### Paket On-Demand

Paket On-Demand adalah pengiriman lokal/instant yang lifecycle utamanya dikontrol LANCAR dan kurir LANCAR.

Canonical happy path:

`customer → pickup/dropoff → package facts → quote → payment → matching → courier pickup → PIN/QR/proof → live GPS → POD → completed → settlement`

Exception yang relevan:

`cancel → failed pickup → failed delivery → internal recovery/re-attempt/support → resolved`

- [ ] Jangan menjadikan **return-to-sender** sebagai state wajib/happy path Paket On-Demand.
- [ ] Return lokal boleh ada sebagai **salah satu recovery decision** jika failed delivery membutuhkan barang dikembalikan kepada sender.
- [ ] Jangan menjadikan istilah `dispute` sebagai CTA default customer Paket On-Demand; gunakan `Bantuan`, `Laporkan Masalah`, atau `Ajukan Klaim` sesuai konteks.
- [ ] Lost/damaged Paket On-Demand adalah internal incident/claim LANCAR, bukan carrier claim eksternal.

### Aggregator Paket Antar-Kota

Aggregator adalah orchestration layer untuk ekspedisi/3PL eksternal. Setelah handoff ke carrier, lifecycle mengikuti fakta, capability, SLA, dan policy provider yang dipilih.

Canonical high-level path:

`customer → origin/destination → package facts → compare carrier rates → select provider service → payment → create shipment/AWB → first-mile/handoff → carrier lifecycle → delivered/exception → provider-driven resolution → reconciliation`

- [ ] Return-to-sender, carrier claim, lost, damaged, delivery attempt, POD carrier, COD, insurance, cancellation, pickup request, dan exception mengikuti capability/policy provider.
- [ ] LANCAR tidak boleh mengarang aturan global yang bertentangan dengan carrier.
- [ ] LANCAR menyimpan normalized status untuk UX, tetapi raw provider status/code/payload reference tetap disimpan.

---

# 2. AUDITED BASELINE — TEMUAN PENTING

## 2.1 Aggregator Customer Web — P0 blocker

`frontend/src/components/orders/AggregatorWizard.tsx` sudah mempunyai wizard, bulk upload/polling, pilihan provider, tarif, dan review; tetapi manual flow masih memiliki simulated success/redirect tanpa persisted create-order nyata. Flow juga masih perlu dibersihkan dari fixed origin/mock/static provider truth.

- [ ] Hilangkan fake success.
- [ ] Hilangkan fixed-origin `CGK` dari production path.
- [ ] Provider/city/service option berasal dari backend/provider capability, bukan daftar statik UI.
- [ ] Browser tidak memanggil third-party geocoding/provider API secara langsung jika secret/rate-policy seharusnya server-side.

## 2.2 Integration Gateway sudah punya fondasi adapter

Existing core:

- `backend/integration-gateway/internal/domain/provider.go`
- `backend/integration-gateway/internal/handler/logistics_handler.go`
- `backend/integration-gateway/internal/handler/tracking_webhook_handler.go`
- `backend/integration-gateway/internal/provider/jne_adapter.go`
- `backend/integration-gateway/internal/provider/jnt_adapter.go`
- `backend/integration-gateway/internal/provider/circuit_breaker.go`
- `backend/integration-gateway/internal/provider/retry_http.go`

Current `Logistics3PLProvider` sudah mempunyai `CheckTariff`, `CreateOrder`, `TrackOrder`, tetapi contract masih terlalu kecil untuk menjadi universal carrier platform.

- [ ] Pertahankan Integration Gateway sebagai boundary external logistics.
- [ ] Jangan pindahkan JNE/J&T-specific mapping ke customer app atau core order UI.
- [ ] Refactor menuju capability-based provider architecture pada `AGG-2026-010` s.d. `AGG-2026-013`.

## 2.3 Provider-specific approximation harus dihilangkan

Contoh audited gap:

- J&T adapter masih memiliki ETA fallback hardcoded `1-3 hari`.
- JNE/J&T tracking mapping masih terlalu cepat menyederhanakan banyak event menjadi `MANIFESTED/IN_TRANSIT/DELIVERED`.

- [ ] Jangan fabricate provider SLA jika API/provider config resmi tidak memberi nilai.
- [ ] Jika ETA tidak tersedia, return `null/unavailable` dengan source metadata yang jelas.
- [ ] Simpan raw provider event sebelum normalize.

## 2.4 Towing jangan rewrite dari nol

Courier sudah mempunyai dedicated Towing flow (`TowingFlow.kt`, `TowingFlowScreen.kt`, `TowingFlowViewModel.kt`, inspection, loading/unloading proof, progress, report, POD).

- [ ] Harden kontrak/state/proof existing.
- [ ] Perbaiki customer booking metadata, capability matching, quote/requote, consent adjustment, tracking, dan claim.

## 2.5 Tambal Ban + Towing backend memang berbagi contract

Existing shared files:

- `backend/order-service/internal/domain/tambalban.go`
- `backend/order-service/internal/handler/tambalban_handler.go`

- [ ] Jangan split hanya karena nama file.
- [ ] Split Towing hanya jika state/pricing/dependencies sudah materially berbeda.

## 2.6 Food task lama dipertahankan

- [ ] ID `FOOD-2026-001` sampai `FOOD-2026-026` tetap menjadi referensi continuity.

---

# PART A — CROSS-SERVICE PLATFORM FOUNDATION

## CORE-2026-001 — Canonical service-aware order contract [P0]

**Files to edit**
- `backend/order-service/internal/domain/order.go`
- `backend/order-service/internal/domain/order_food.go`
- `backend/order-service/internal/domain/tambalban.go`
- `backend/order-service/internal/service/order_create.go`
- `backend/order-service/internal/service/order_read.go`
- `backend/order-service/internal/service/order_service.go`
- `backend/order-service/internal/handler/order_handler.go`
- `backend/order-service/internal/handler/parcel_handler.go`
- `backend/order-service/cmd/api/main.go`
- `android-app-customer/app/src/main/java/com/tembus/customer/data/model/CustomerModels.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/data/model/Order.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/data/model/ServiceModels.kt`
- `android-app/app/src/main/java/com/tembus/courier/data/model/Order.kt`
- `frontend/src/app/(portal)/orders/[id]/orderDetailTypes.ts`
- `frontend/src/app/(portal)/orders/[id]/orderDetailUtils.ts`

**Recommended new files**
- `backend/order-service/internal/domain/order_contract.go`
- `docs/contracts/order-state-contract-2026.md`

**Checklist**
- [x] Canonical `service_category`: `package_on_demand`, `food`, `tambal_ban`, `aggregator`, `towing`.
- [x] `service_code/service_sub_type` menjadi detail service, bukan pengganti category.
- [x] Common envelope: id, customer, order state, money state, timestamps, actor ownership, quote id, state version, correlation id.
- [x] Typed service metadata: parcel facts, food facts, roadside facts, aggregator/provider facts, towing facts.
- [x] Towing/Tambal required facts tidak hanya hidup di `item_description` free-text.
- [x] Tambahkan `contract_version` atau equivalent untuk perubahan payload material.
- [x] Legacy mapper/backfill tidak mengarang data yang tidak diketahui.
- [x] Unknown/new subtype dirender degraded-safe oleh Android/Web/Courier/Admin.
- [ ] Staging migration/backfill dan authenticated multi-surface runtime verification selesai.

---

## CORE-2026-002 — Shared idempotency [P0]

**Files to edit**
- `backend/order-service/internal/service/order_create.go`
- `backend/order-service/internal/service/order_food.go`
- `backend/order-service/internal/service/payment_service.go`
- `backend/order-service/internal/service/refund_service.go`
- `backend/order-service/internal/handler/order_handler.go`
- `backend/order-service/internal/handler/food_handler.go`
- `backend/order-service/internal/middleware/redis_helper.go`
- `android-app-customer/app/src/main/java/com/tembus/customer/data/repository/OrderRepository.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/data/api/TEMBUSApiService.kt`
- `frontend/src/lib/api.ts`

**Recommended new files**
- `backend/order-service/internal/domain/idempotency.go`
- `backend/order-service/internal/service/idempotency_service.go`
- `backend/order-service/internal/repository/idempotency_repository.go`
- `database/migrations/<timestamp>_add_order_idempotency_keys.sql`

**Checklist**
- [x] Require idempotency key pada semua create-order dan financial mutation applicable di order-service mutation utama serta admin-service mutation routes.
- [x] Persist key + actor + operation + request fingerprint + result reference + expiry melalui `api_idempotency_keys`.
- [x] Same key/same fingerprint returns original result melalui response replay tanpa menjalankan handler ulang.
- [x] Same key/different payload returns conflict dengan error terstruktur.
- [x] Client mempertahankan key selama retry dari satu user intent pada flow order/payment web dan mobile yang sudah diaudit.
- [x] Deduplicate payment callback, refund, payout, carrier webhook/event, AWB create, service adjustment melalui existing event/reference uniqueness guards dan shared request middleware pada entrypoint yang menerima client mutation.
- [ ] Authenticated staging concurrency/replay matrix membuktikan 10 parallel/repeated creates menghasilkan tepat satu order/financial obligation.

_Local implementation is complete and verified in the current branch; authenticated staging concurrency and persisted DB evidence remain the only unchecked gate._

---

## CORE-2026-003 — Server-authoritative quote [P0]

**Files to edit**
- `backend/order-service/internal/domain/pricing.go`
- `backend/order-service/internal/service/pricing_service.go`
- `backend/order-service/internal/handler/order_handler.go`
- `backend/order-service/internal/handler/food_handler.go`
- `backend/order-service/internal/handler/tambalban_handler.go`
- `android-app-customer/app/src/main/java/com/tembus/customer/data/repository/OrderRepository.kt`
- `frontend/src/hooks/useLogisticsTariff.ts`
- `frontend/src/components/orders/OrderSummary.tsx`

**Recommended new files**
- `backend/order-service/internal/domain/quote.go`
- `backend/order-service/internal/service/quote_service.go`
- `backend/order-service/internal/repository/quote_repository.go`
- `database/migrations/<timestamp>_add_order_quote_snapshots.sql`

**Checklist**
- [x] Quote berisi `quote_id`, service/category, input fingerprint, price components, total, currency, ETA/source, policy/rule version, expiry pada order-service pricing response.
- [x] Create order consumes valid quote, rejects expired/mismatched quote, atau returns `REQUOTE_REQUIRED` dengan quote ID dan current total untuk diff UI.
- [x] Address/package/service input fingerprint dapat divalidasi saat dikirim kembali; changed quote fingerprint/snapshot ditolak sebelum create pada order-service contract.
- [x] Client total tidak pernah authoritative; order-service reloads the Redis quote and uses its server-calculated total.
- [x] Quote snapshot yang benar-benar dipakai order disimpan pada `orders.pricing_snapshot` untuk audit/support.
- [x] Customer Android/Web quote clients send the canonical fingerprint, quote snapshot, quote identity, and expiry on the supported on-demand/service quote flows; local payload wiring is covered, while runtime cross-surface parity remains a staging gate.
- [ ] Authenticated staging matrix membuktikan expiry, changed address/package/service invalidation, cross-surface quote parity, dan persisted quote snapshot.

_Local quote contract and server enforcement are complete; authenticated staging parity remains the explicit external gate._

---

## CORE-2026-004 — Canonical state machine + actor authorization [P0]

**Files to edit**
- `backend/order-service/internal/domain/order.go`
- `backend/order-service/internal/service/order_service.go`
- `backend/order-service/internal/service/order_matching.go`
- `backend/order-service/internal/service/order_food.go`
- `backend/order-service/internal/service/order_food_merchant.go`
- `backend/order-service/internal/service/order_events.go`
- `backend/order-service/internal/service/order_status_guard_test.go`
- `backend/order-service/internal/handler/proof_handler.go`
- `backend/order-service/internal/handler/delivery_webhook_handler.go`
- `android-app/app/src/main/java/com/tembus/courier/domain/CourierFlow.kt`
- `android-app/app/src/main/java/com/tembus/courier/domain/TambalBanFlow.kt`
- `android-app/app/src/main/java/com/tembus/courier/domain/TowingFlow.kt`

**Recommended new files**
- `backend/order-service/internal/domain/order_state_machine.go`
- `backend/order-service/internal/service/order_transition_service.go`
- `backend/order-service/internal/service/order_transition_service_test.go`
- `database/migrations/<timestamp>_add_order_state_version.sql`

**Checklist**
- [x] Allowed transition defined per service + actor.
- [x] Optimistic version/row locking prevents race.
- [x] Terminal state tidak mundur karena delayed/replayed event.
- [x] State + audit + required proof/ledger effects transactional.
- [x] Duplicate event idempotent; invalid transition typed error.
- [x] Admin override reasoned/audited.

---

## CORE-2026-005 — Payment/refund/payout/settlement/reconciliation invariants [P0]

**Files to edit**
- `backend/order-service/internal/domain/payment.go`
- `backend/order-service/internal/domain/refund.go`
- `backend/order-service/internal/domain/payout.go`
- `backend/order-service/internal/domain/ledger.go`
- `backend/order-service/internal/service/payment_service.go`
- `backend/order-service/internal/service/refund_service.go`
- `backend/order-service/internal/service/payout_service.go`
- `backend/order-service/internal/service/merchant_settlement_service.go`
- `admin-dashboard/src/pages/finance/reconciliationPanel.tsx`
- `admin-dashboard/src/pages/finance/ledgerPanel.tsx`
- `admin-dashboard/src/pages/finance/treasury/ManualReviewSection.tsx`
- `admin-dashboard/src/pages/finance/treasury/ServiceSettlementSection.tsx`

**Recommended new files**
- `backend/order-service/internal/service/reconciliation_service.go`
- `backend/order-service/internal/worker/reconciliation_worker.go`
- `backend/order-service/internal/service/reconciliation_service_test.go`
- `database/migrations/<timestamp>_add_reconciliation_exceptions.sql`

**Checklist**
- [x] Model unpaid/pending/paid/refunding/refunded/settled/failed explicitly.
- [x] Reconcile order total ↔ payment ↔ subsidy/voucher ↔ courier ↔ merchant ↔ carrier ↔ platform ↔ tax ↔ refund.
- [x] Completed-with-money-mismatch masuk exception queue.
- [x] Manual correction menggunakan compensating entry, bukan overwrite history.
- [x] Dashboard filter discrepancy by service/provider/date.

---

## CORE-2026-006 — Proof/PIN/QR/signature chain-of-custody [P0]

**Files to edit**
- `backend/order-service/internal/handler/proof_handler.go`
- `backend/order-service/internal/service/order_service.go`
- `android-app/app/src/main/java/com/tembus/courier/ui/screens/scan/ScanScreen.kt`
- `android-app/app/src/main/java/com/tembus/courier/ui/screens/scan/ScanViewModel.kt`
- `android-app/app/src/main/java/com/tembus/courier/ui/screens/pod/ProofOfDeliveryScreen.kt`
- `android-app/app/src/main/java/com/tembus/courier/ui/screens/pod/ProofOfDeliveryViewModel.kt`
- `android-app/app/src/main/java/com/tembus/courier/ui/screens/pod/SignaturePad.kt`
- `android-app/app/src/main/java/com/tembus/courier/data/repository/ServiceReportProofUploader.kt`

**Recommended new files**
- `backend/order-service/internal/domain/handoff.go`
- `backend/order-service/internal/service/handoff_service.go`
- `backend/order-service/internal/service/handoff_service_test.go`
- `database/migrations/<timestamp>_add_handoff_verification.sql`

**Checklist**
- [x] Proof requirement matrix per service/stage.
- [x] One-time token binds order + actor + stage + expiry + attempts.
- [x] Replay/wrong actor/wrong order rejected.
- [x] Proof immutable after stage final.
- [x] Completion blocked if mandatory proof missing.
- [ ] Authenticated staging multi-actor proof/PIN/QR flow and deployed migration verification completed.

---

## CORE-2026-007 — Realtime/offline recovery [P0]

**Files to edit**
- `backend/order-service/internal/handler/websocket_handler.go`
- `backend/order-service/internal/service/order_events.go`
- `backend/order-service/internal/service/tracking_service.go`
- `android-app-customer/app/src/main/java/com/tembus/customer/util/SocketManager.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/worker/CustomerResyncWorker.kt`
- `android-app/app/src/main/java/com/tembus/courier/util/SocketManager.kt`
- `android-app/app/src/main/java/com/tembus/courier/worker/OrderSyncWorker.kt`
- `frontend/src/hooks/useWebSocket.ts`
- `frontend/src/lib/socket.ts`

**Checklist**
- [x] Event ordering/version contract.
- [x] Ignore duplicate/older events.
- [x] Reconnect fetches authoritative snapshot.
- [x] Push tidak mutasi state authoritative secara buta.
- [ ] Offline only queues safe/idempotent mutation.

---

## CORE-2026-008 — Typed recoverable errors [P0]

**Files to edit**
- `backend/order-service/internal/domain/errors.go`
- `backend/order-service/internal/middleware/base_middleware.go`
- `backend/order-service/internal/middleware/validator.go`
- `android-app-customer/app/src/main/java/com/tembus/customer/data/api/TEMBUSApiService.kt`
- `frontend/src/lib/api.ts`
- `android-app/app/src/main/java/com/tembus/courier/ui/components/ErrorReference.kt`

**Checklist**
- [x] Standardize `REQUOTE_REQUIRED`, `OUT_OF_SERVICE_AREA`, `NO_COURIER`, `PROVIDER_UNAVAILABLE`, `ITEM_UNAVAILABLE`, `INVALID_TRANSITION`, `PAYMENT_PENDING`, `PROOF_REQUIRED`, `HANDOFF_INVALID`, `SCHEDULE_INVALID`, `CAPABILITY_MISMATCH`, `CARRIER_RATE_EXPIRED`, `CARRIER_EVENT_UNKNOWN`.
- [x] Error carries correlation id.
- [ ] Client renders next action, not raw internal error.

---

# PART B — PAKET ON-DEMAND END-TO-END

## PKG-2026-001 — Coordinate-safe pickup & destination [P0]

**Files to edit**
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/booking/BookingScreen.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/booking/BookingViewModel.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/booking/BookingComponents.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/profile/AddressBookScreen.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/profile/AddressBookViewModel.kt`
- `frontend/src/components/orders/AddressPicker.tsx`
- `frontend/src/components/orders/OnDemandOrderForm.tsx`
- `frontend/src/components/orders/OnDemandOrderFormContent.tsx`

**Checklist**
- [x] Atomic pickup/dropoff object: id/label/lat/lng/city/postal/receiver/contact/instruction.
- [x] Saved/manual/pinned address updates coordinates and invalidates quote.
- [x] Manual text cannot submit without resolved coordinate.
- [x] Reject `0,0` and stale GPS before quote/order submission.
- [ ] Out-of-service-area rejection is verified against the authoritative staging coverage response.
- [x] Final route review before order.

---

## PKG-2026-002 — Package facts + quote parity Android/Web [P0]

**Files to edit**
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/booking/BookingViewModel.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/data/model/CustomerModels.kt`
- `frontend/src/components/orders/OrderSchemas.ts`
- `frontend/src/components/orders/OnDemandOrderFormContent.tsx`
- `frontend/src/components/orders/OrderSummary.tsx`
- `backend/order-service/internal/service/pricing_service.go`
- `backend/order-service/internal/handler/parcel_handler.go`

**Checklist**
- [x] Weight, dimensions, volumetric weight, quantity, category, item value, fragile/prohibited flags, size tier, receiver, delivery-code policy.
- [x] Package-fact change forces requote.
- [x] Android/Web render the same authoritative breakdown from the server response.
- [ ] Authenticated staging parity proves matching quote responses and persisted package facts.

---

## PKG-2026-003 — Create → payment → matching without duplicate assignment [P0]

**Files to edit**
- `android-app-customer/app/src/main/java/com/tembus/customer/data/repository/OrderRepository.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/booking/BookingViewModel.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/payment/PaymentViewModel.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/data/api/TEMBUSApiService.kt`
- `backend/order-service/internal/service/order_create.go`
- `backend/order-service/internal/service/order_matching.go`
- `backend/order-service/internal/handler/order_handler.go`
- `backend/order-service/internal/repository/postgres_repository.go`
- `backend/order-service/internal/repository/payout_repo.go`
- `backend/order-service/internal/service/payout_service.go`
- `database/migrations/20260901000001_unique_leg_payout.sql`
- `android-app/app/src/main/java/com/tembus/courier/ui/screens/OnDemandOfferScreens.kt`
- `android-app/app/src/main/java/com/tembus/courier/ui/components/OnDemandIncomingOfferSwipePanel.kt`

**Checklist**
- [x] Create consumes the server quote and a stable idempotency key across Android retries; Web/admin already require the same key.
- [x] Matching validates approved capability, vehicle/radius rules, online state, capacity, and idle/conditional availability before dispatch.
- [x] Two-courier accept race has one atomic winner through row locking/status-guarded assignment; the loser receives `ERR_ORDER_ALREADY_ASSIGNED`.
- [x] No-supply expands configured radii, expires offer batches, emits the no-courier event, exposes retry, and leaves the order cancellable.
- [x] Reassign does not duplicate payout reservation: one leg-fee payout is idempotently read and protected by a unique order-leg index.
- [ ] Authenticated staging concurrency/replay matrix and persisted DB evidence.

_Implementation is complete and locally verified in commit `6ea78dbf`; authenticated staging E2E remains an external evidence gate._

---

## PKG-2026-004 — Pickup verification & custody [P0]

**Files to edit**
- `android-app/app/src/main/java/com/tembus/courier/ui/screens/order/MandatoryPickupChecklist.kt`
- `android-app/app/src/main/java/com/tembus/courier/ui/screens/order/PackageChecklistCard.kt`
- `android-app/app/src/main/java/com/tembus/courier/ui/screens/scan/ScanScreen.kt`
- `android-app/app/src/main/java/com/tembus/courier/ui/screens/order/OnDemandProofPanel.kt`
- `backend/order-service/internal/handler/proof_handler.go`

**Checklist**
- [x] Arrived precedes pickup verification — Android exposes `pickup_arrived`; admin proof endpoint rejects earlier pickup evidence with `ERR_PICKUP_ARRIVAL_REQUIRED`; order-service enforces the same gate for on-demand package scans.
- [x] Package identity/condition/quantity checked when required — existing authoritative proof path validates package code/count and records scan/photo evidence; pickup photo remains mandatory before completion.
- [x] PIN/QR/proof before `picked_up` — status route is policy/idempotency guarded, pickup proof requires arrival plus barcode/photo evidence, and completion advances only after scan + photo.
- [x] Pickup evidence immutable — migration installs append-only `package_scans` update trigger; corrections must be represented as new evidence events.
- [ ] Authenticated staging flow, deployed migration/trigger, and persisted custody evidence verified end-to-end.

---

## PKG-2026-005 — Live tracking, ETA & communication [P0]

**Files to edit**
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/tracking/TrackingScreen.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/tracking/TrackingViewModel.kt`
- `backend/order-service/internal/service/tracking_service.go`
- `backend/order-service/internal/handler/tracking_handler.go`
- `frontend/src/app/track/[token]/page.tsx`
- `frontend/src/app/(portal)/orders/[id]/RouteSnapshotPanel.tsx`

**Checklist**
- [x] ETA backend sourced.
- [x] Show GPS staleness.
- [x] Mask contact by lifecycle/privacy policy.
- [x] Public tracking token scoped/expiring/revocable.
- [ ] Offline reconnect uses snapshot.

---

## PKG-2026-006 — Delivery / POD / Failed Delivery / Recovery Flow [P0]

> **Important:** ini adalah Paket On-Demand LANCAR. `return-to-sender` bukan mandatory carrier lifecycle. Return hanya salah satu possible recovery decision setelah failed delivery.

**Files to edit**
- `android-app/app/src/main/java/com/tembus/courier/ui/screens/pod/ProofOfDeliveryScreen.kt`
- `android-app/app/src/main/java/com/tembus/courier/ui/screens/pod/ProofOfDeliveryViewModel.kt`
- `android-app/app/src/main/java/com/tembus/courier/ui/screens/order/RegularFailedDeliveryPanel.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/detail/OrderDetailScreen.kt`
- `frontend/src/app/(portal)/orders/[id]/OrderDetailContent.tsx`
- `backend/order-service/internal/handler/proof_handler.go`
- `backend/order-service/internal/service/order_service.go`

**Recommended new file if recovery rules become complex**
- `backend/order-service/internal/service/ondemand_delivery_recovery_service.go`

**Checklist**
- [x] POD may require photo/signature/PIN based on service/risk policy.
- [x] Failed delivery records structured reason + evidence.
- [x] Recovery options are policy driven: `retry`, `contact receiver`, `return_to_sender`, `cancel`, `support_review`.
- [x] `return_to_sender` only appears when applicable; do not force every failed delivery into return.
- [x] Recipient mismatch follows safe handoff rule.
- [x] Settlement does not finalize without required proof/state invariants.
- [x] Customer CTA is `Bantuan/Laporkan Masalah/Ajukan Klaim`, not generic marketplace dispute.
- [x] Internal lost/damaged claim links to LANCAR evidence and operational incident, not external carrier workflow.
- [ ] Authenticated staging courier → customer recovery/POD flow and deployed migration verification completed.

---

## PKG-2026-007 — Customer Web parity [P1]

**Files to edit**
- `frontend/src/app/(portal)/orders/new/ondemand/page.tsx`
- `frontend/src/components/orders/OnDemandOrderForm.tsx`
- `frontend/src/components/orders/OnDemandOrderFormContent.tsx`
- `frontend/src/components/orders/AddressPicker.tsx`
- `frontend/src/components/orders/OrderSummary.tsx`
- `frontend/src/components/orders/PaymentModal.tsx`
- `frontend/src/app/(portal)/orders/page.tsx`
- `frontend/src/app/(portal)/orders/[id]/OrderDetailContent.tsx`

**Recommended new files**
- `frontend/e2e/ondemand-package-flow.spec.ts`
- `frontend/src/hooks/useCreateOnDemandOrder.ts`

**Checklist**
- [ ] Web journey: login → address → package facts → quote → payment → created → history → detail → tracking → completed/support if needed.
- [x] Refresh/back/retry is idempotent.
- [x] Mobile responsive and keyboard-accessible.
- [x] Web/Android share price/state semantics.
- [ ] Authenticated staging journey from login through payment, history, tracking, completion/support, and deployed API verification completed.

---

## PKG-2026-008 — Paket UI/UX trust pass [P1]

**Files to edit**
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/components/ServiceGridMenu.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/components/ServiceIcons.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/main/DashboardScreen.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/history/OrderHistoryScreen.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/detail/OrderDetailScreen.kt`
- `frontend/src/app/(portal)/dashboard/page.tsx`
- `frontend/src/app/(portal)/orders/page.tsx`

**Checklist**
- [x] Distinguish `Paket Instan` from `Ekspedisi Antar-Kota` by icon/subtitle/ETA/price expectation.
- [x] Progressive disclosure.
- [x] Final review: route, package summary, ETA, total, receiver, cancellation policy.
- [x] History badges are service-aware.
- [ ] Authenticated staging visual/interaction verification completed on Android and web.

---

# PART C — FOOD MARKETPLACE 2026

> Food tetap mengikuti `CORE-*` foundation.

## FOOD-2026-001 — Coordinate-safe food checkout [P0]

**Files to edit**
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/food/FoodCheckoutScreen.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/food/FoodViewModel.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/data/model/FoodModels.kt`
- `backend/order-service/internal/handler/food_handler.go`
- `backend/order-service/internal/service/order_food.go`

- [x] Atomic address+coordinate destination.
- [x] Saved/manual/pinned change coordinates.
- [x] Discovery GPS not silently reused as checkout destination.
- [ ] Address change requotes.

## FOOD-2026-002 — Authoritative Food Quote [P0]

**Files to edit**
- `backend/order-service/internal/handler/food_handler.go`
- `backend/order-service/internal/service/order_food.go`
- `backend/order-service/internal/repository/food_repository.go`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/food/FoodCheckoutScreen.kt`

**Recommended new file only if shared quote cannot express Food cleanly**
- `backend/order-service/internal/service/food_quote_service.go`

- [ ] Validate merchant/item/variant/stock/voucher/radius/tax/fee/schedule.
- [x] Return itemized total + ETA + expiry.
- [x] Create consumes quote/requote diff.

## FOOD-2026-003 — Idempotent Food create [P0]

**Files to edit**
- `backend/order-service/internal/service/order_food.go`
- `backend/order-service/internal/handler/food_handler.go`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/food/FoodViewModel.kt`

- [x] Apply CORE idempotency.
- [x] Duplicate callback cannot duplicate notification/dispatch/ledger.

## FOOD-2026-004 — Secure merchant handoff [P0]

**Files to edit**
- `backend/order-service/internal/service/order_food.go`
- `backend/order-service/internal/handler/proof_handler.go`
- `android-app-merchant/app/src/main/java/com/tembus/merchant/ui/screens/home/StitchOrdersDashboardScreen.kt`
- `android-app/app/src/main/java/com/tembus/courier/ui/screens/scan/ScanScreen.kt`

- [x] One-time PIN/QR binds order/merchant/courier or pickup customer/state/expiry.
- [x] Verify + picked_up atomic.
- [x] Replay/wrong actor rejected.

## FOOD-2026-005 — Server-authoritative ETA/readiness [P0]

**Files to edit**
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/food/FoodHomeScreen.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/food/MerchantDetailScreen.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/food/FoodCheckoutScreen.kt`
- `backend/order-service/internal/service/order_food.go`
- `backend/order-service/internal/service/matching_service.go`

- [x] Remove fabricated client ETA.
- [x] ETA includes prep/supply/pickup travel/traffic/batching/confidence.
- [ ] Measure predicted vs actual.

## FOOD-2026-006 — Contactless end-to-end [P0]

**Files to edit**
- `FoodCheckoutScreen.kt`
- `backend/order-service/internal/domain/order_food.go`
- `backend/order-service/internal/service/order_food.go`
- courier `ProofOfDeliveryScreen.kt`

- [x] Persist contactless + structured instructions.
- [x] Courier sees instruction before delivery.
- [ ] Contactless-compatible POD.

## FOOD-2026-007 — Canonical Food state machine + cross-app tests [P0]

**Files to edit**
- `backend/order-service/internal/domain/order_food.go`
- `backend/order-service/internal/service/order_food.go`
- `backend/order-service/internal/service/order_food_merchant.go`
- `backend/order-service/internal/service/order_status_guard_test.go`

**Recommended new file**
- `backend/order-service/internal/service/order_food_state_machine_test.go`

**Mandatory scenarios**
- [ ] Happy path payment→accept→prepare→assign→handoff→delivery→settlement.
- [ ] Duplicate create.
- [ ] Payment fail/late callback.
- [ ] Merchant reject/timeout.
- [ ] Item unavailable/substitution.
- [ ] Scheduled activation.
- [ ] No courier/reassign.
- [ ] Wait/early-ready/late-ready.
- [ ] Invalid/replayed handoff.
- [ ] Contactless.
- [ ] Partial refund/edit.
- [ ] Socket reconnect/out-of-order events.

## FOOD-2026-008 — Location/privacy permission hardening [P0]

**Files to edit**
- `android-app-customer/app/src/main/AndroidManifest.xml`
- `android-app-customer/app/src/main/java/com/tembus/customer/receiver/BootReceiver.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/service/LocationTrackerService.kt`
- Food customer screens

- [x] Least privilege location.
- [x] Manual/saved address works without location permission.
- [ ] No unjustified boot background tracking.

## FOOD-2026-009 — Food finance invariants [P0]

**Files to edit**
- `backend/order-service/internal/service/payment_service.go`
- `backend/order-service/internal/service/refund_service.go`
- `backend/order-service/internal/service/merchant_settlement_service.go`
- `admin-dashboard/src/pages/MerchantSettlements.tsx`
- `admin-dashboard/src/pages/finance/reconciliationPanel.tsx`

- [ ] Reject/timeout/cancel/courier failure/edit/tip/refund/settlement reconcile.
- [ ] Promo subsidy and merchant payable explicit.

## FOOD-2026-010 — Customer Pickup/self-pickup [P1]
- [ ] Delivery vs Pickup.
- [ ] No courier fee/dispatch for Pickup.
- [ ] Ready notification + pickup PIN/QR.
- [ ] No-show/cancel policy.

## FOOD-2026-011 — Merchant Busy vs Paused [P1]
- [x] Busy extends prep/ETA while accepting orders.
- [x] Pause stops new orders.
- [ ] Timed busy supported.

## FOOD-2026-012 — Quantity-aware inventory [P1]
- [x] Stock/sales limit + reset schedule.
- [x] Atomic reserve/decrement/release.
- [x] Prevent oversell.

## FOOD-2026-013 — Substitution/customer approval [P1]
- [ ] Merchant proposes item delta.
- [ ] Customer approve/reject/timeout.
- [ ] Price/promo/refund recalculated atomically.

## FOOD-2026-014 — Discovery/ranking [P1]
- [ ] Cuisine/filter/sort/recent/favorites/popular.
- [ ] Server-ranked pagination.
- [ ] Sponsored content labeled and separated from organic.

## FOOD-2026-015 — Operating hours [P1]
- [ ] Regular/holiday/temp closure/last-order/future schedule.

## FOOD-2026-016 — Food checkout options [P1]
- [ ] Cutlery, merchant note, delivery note, gift/receiver privacy.

## FOOD-2026-017 — Courier wait/merchant issue [P1]
- [ ] Arrived, not-ready, wait timer, ready signal.
- [ ] Structured pickup issues/evidence.

## FOOD-2026-018 — Merchant kitchen cockpit [P1]
- [ ] New/scheduled/preparing/ready/completed lanes.
- [ ] SLA countdown and printer failure isolation.

## FOOD-2026-019 — Ratings/reviews trust [P1]
- [ ] Rating count/detail, merchant reply/report, food vs delivery rating, fraud controls.

## FOOD-2026-020 — Group orders/split payment [P2]
- [ ] Shared cart, deadline, creator control, optional split.

## FOOD-2026-021 — Membership/free delivery [P2]
- [ ] Entitlement + subsidy accounting + exclusions.

## FOOD-2026-022 — Personalized ranking [P2]
- [ ] Privacy-aware signals + cold-start + experiment framework.

## FOOD-2026-023 — Sponsored placement [P2]
- [ ] Ad labeling/campaign/attribution/fraud/organic isolation.

## FOOD-2026-024 — Multi-store/Mix & Match [P2]
- [ ] Separate orchestration project; preserve single-merchant invariants.

## FOOD-2026-025 — POS/KDS [P2]

**Recommended new files**
- `backend/integration-gateway/internal/domain/pos_provider.go`
- `backend/integration-gateway/internal/handler/pos_handler.go`

- [ ] Order injection/ack, catalog/stock sync, reconciliation, connector health.

## FOOD-2026-026 — Adaptive UI/accessibility [P2]
- [ ] Phone/tablet/foldable, dynamic text, screen reader, touch target, contrast, reduced motion.

---

# PART D — TAMBAL BAN END-TO-END

## TIRE-2026-001 — Emergency location + structured problem [P0]

**Files to edit**
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/service/TambalBanHomeScreen.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/service/TambalBanHomeViewModel.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/service/ServiceBookingScreen.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/service/ServiceBookingViewModel.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/components/VehicleDetailInput.kt`

- [ ] No `0,0` transactional fallback.
- [ ] User can correct pin.
- [ ] Capture vehicle/tire/problem/spare/notes/photo where useful.
- [ ] Location change refreshes technician/quote.

## TIRE-2026-002 — Capability-safe technician discovery [P0]

**Files to edit**
- customer `NearbyCouriersScreen.kt`, `NearbyCouriersViewModel.kt`, `CourierDetailScreen.kt`
- `backend/order-service/internal/domain/tambalban.go`
- `backend/order-service/internal/handler/tambalban_handler.go`
- `backend/order-service/internal/service/availability_service.go`
- `backend/order-service/internal/service/matching_service.go`

- [ ] Exact motor/mobil capability filtering.
- [ ] ETA/distance/rating/service price/availability shown.
- [ ] Preferred technician revalidated on create.

## TIRE-2026-003 — Quote + on-site adjustment approval [P0]

**Files to edit**
- customer `ServiceBookingScreen.kt`, `ServiceBookingViewModel.kt`
- courier `ServiceUpgradeScreen.kt`, `ServiceUpgradeViewModel.kt`
- `backend/order-service/internal/service/pricing_service.go`

**Recommended new files**
- `backend/order-service/internal/domain/service_adjustment.go`
- `backend/order-service/internal/service/service_adjustment_service.go`
- `backend/order-service/internal/handler/service_adjustment_handler.go`
- `database/migrations/<timestamp>_add_service_adjustments.sql`

- [ ] Initial quote snapshot.
- [ ] Extra material/work becomes structured adjustment.
- [ ] Customer explicitly approves price delta.
- [ ] Approval + money + audit is atomic/idempotent.

## TIRE-2026-004 — Arrival→inspection→repair→proof→completion [P0]

**Files to edit**
- courier `TambalBanFlow.kt`, `TambalBanFlowScreen.kt`, `TambalBanFlowViewModel.kt`, `InspectTireScreen.kt`, `TambalBanReportCard.kt`
- `backend/order-service/internal/domain/tambalban.go`
- `backend/order-service/internal/handler/tambalban_handler.go`

- [ ] Server-enforced lifecycle.
- [ ] Before/after proof as configured.
- [ ] Structured material/duration/report.
- [ ] Customer sees human-readable stages.

## TIRE-2026-005 — Settlement/warranty/claim/rating [P0]
- [ ] Settlement after proof invariant.
- [ ] Customer sees final report + approved adjustment.
- [ ] Warranty/claim, if offered, links immutable evidence.
- [ ] Rating distinguishes technician service quality where useful.

## TIRE-2026-006 — Emergency-first UI/UX [P1]
- [ ] First screen asks vehicle/problem/location.
- [ ] Technician cards prioritize ETA/capability/rating/estimate.
- [ ] Tracking language: menuju Anda→tiba→inspeksi→pengerjaan→selesai.

---

# PART E — AGGREGATOR PAKET ANTAR-KOTA END-TO-END

> **Core principle:** Aggregator adalah universal carrier orchestration. Business layer LANCAR tidak boleh menjadi kumpulan `if provider == JNE/JNT/...`.

## AGG-2026-001 — Remove CGK/mock/static provider truth [P0]

**Files to edit**
- `frontend/src/components/orders/AggregatorWizard.tsx`
- `frontend/src/components/orders/AggregatorForm.tsx`
- `frontend/src/components/orders/OrderSchemas.ts`
- `frontend/src/app/(portal)/orders/new/aggregator/page.tsx`
- `backend/order-service/internal/handler/parcel_handler.go`
- `backend/integration-gateway/internal/domain/provider.go`
- `backend/integration-gateway/internal/handler/logistics_handler.go`

**Recommended new files**
- `frontend/src/hooks/useLogisticsLocations.ts`
- `frontend/src/hooks/useLogisticsProviders.ts`
- `frontend/src/types/logistics.ts`

- [x] Origin from validated pickup address/provider location mapping.
- [x] Destination resolved to canonical/provider-compatible location code.
- [x] Provider/service list comes from backend capability registry.
- [ ] Provider circuit-open/unavailable not selectable.
- [x] No production mock city/provider fallback.

---

## AGG-2026-002 — Backend-mediated location normalization [P0]

**Files to edit**
- `frontend/src/components/orders/AggregatorWizard.tsx`
- `frontend/src/components/orders/AddressPicker.tsx`
- `backend/integration-gateway/internal/handler/maps_handler.go`
- `backend/integration-gateway/internal/provider/maps_factory.go`
- `backend/integration-gateway/internal/provider/tomtom.go`
- `backend/order-service/internal/repository/maps_repository.go`

**Recommended new file**
- `backend/integration-gateway/internal/handler/logistics_location_handler.go`

- [x] Remove direct browser third-party geocode.
- [x] Normalize display label separately from city/district/postal/provider code.
- [ ] Provider-location mapping is server controlled/cacheable/auditable.

---

## AGG-2026-003 — Authoritative carrier rate snapshot [P0]

**Files to edit**
- `frontend/src/components/orders/AggregatorWizard.tsx`
- `frontend/src/hooks/useLogisticsTariff.ts`
- `backend/integration-gateway/internal/handler/logistics_handler.go`
- `backend/integration-gateway/internal/provider/jne_adapter.go`
- `backend/integration-gateway/internal/provider/jnt_adapter.go`
- `backend/integration-gateway/internal/provider/logistics_test.go`
- `backend/order-service/internal/handler/parcel_handler.go`
- `backend/order-service/internal/service/payment_link_service.go`

**Recommended new files**
- `backend/order-service/internal/domain/aggregator_quote.go`
- `backend/order-service/internal/service/aggregator_quote_service.go`
- `backend/order-service/internal/service/aggregator_quote_service_test.go`

- [x] Rate input includes normalized origin/destination, chargeable weight, dimensions, value/category, insurance/COD flags as supported.
- [x] Persist provider code, native service code/name, optional normalized category, gross/net tariff, ETA/source, rule version, expiry.
- [x] Preserve native provider service codes such as JNE `REG/YES/...` or J&T equivalents.
- [x] Do not fabricate ETA. Remove hardcoded fallback such as generic `1-3 hari` unless it comes from explicit provider configuration with provenance.
- [x] Rate change after review returns requote.
- [ ] Authenticated staging/provider verification covers quote input, persisted snapshot, expiry, and changed-input requote.

---

## AGG-2026-004 — Replace manual fake-success with real create [P0]

**Files to edit**
- `frontend/src/components/orders/AggregatorWizard.tsx`
- `frontend/src/app/(portal)/orders/new/aggregator/page.tsx`
- `frontend/src/lib/api.ts`
- `frontend/src/components/orders/PaymentModal.tsx`
- `backend/order-service/internal/handler/parcel_handler.go`
- `backend/order-service/internal/service/order_create.go`
- `backend/order-service/cmd/api/main.go`

**Recommended new file**
- `frontend/src/hooks/useCreateAggregatorOrder.ts`

- [x] Final submit calls real create mutation with quote + idempotency key.
- [x] Persisted order reference before success navigation.
- [x] Payment session is requested only after the order is persisted; AWB/first-mile remains a server-side post-payment handoff owned by AGG-2026-006.
- [x] Refresh/retry rehydrates the persisted order and reuses the payment idempotency key.
- [x] API failure cannot show success.
- [ ] Authenticated staging/provider verification covers create → payment → refresh/retry → AWB/first-mile handoff.

---

## AGG-2026-005 — Bulk upload safety/resume [P0]

**Files to edit**
- `frontend/src/components/orders/AggregatorWizard.tsx`
- `frontend/src/app/(portal)/orders/bulk/page.tsx`
- `frontend/src/components/orders/bulk/UploadStep.tsx`
- `frontend/src/components/orders/bulk/ReviewStep.tsx`
- `frontend/src/components/orders/bulk/PaymentStep.tsx`
- `frontend/src/lib/csv.ts`

**Recommended tests**
- `frontend/e2e/aggregator-bulk-flow.spec.ts`
- `backend/order-service/internal/service/order_bulk_idempotency_test.go`

- [x] Per-row validation/error report.
- [x] Job and child rows idempotent.
- [x] Partial success visible.
- [x] Payment binds exact job/order set version.
- [x] Job resume after refresh is server-backed and owner scoped.
- [ ] Authenticated staging/Redis verification covers upload → review → process → payment-link recovery.

---

## AGG-2026-006 — First-mile pickup → AWB → carrier handoff [P0]

**Files to edit**
- `backend/order-service/internal/service/payment_link_service.go`
- `backend/order-service/internal/service/resi_service.go`
- `backend/order-service/internal/handler/resi_handler.go`
- `backend/order-service/internal/handler/proof_handler.go`
- courier `PackageChecklistCard.kt`, `ScanScreen.kt`
- `frontend/src/app/(portal)/resi/page.tsx`
- `frontend/src/app/(portal)/resi/[id]/page.tsx`
- `admin-dashboard/src/pages/settings/logisticsawb.tsx`

**Recommended new files**
- `backend/order-service/internal/domain/carrier_handoff.go`
- `backend/order-service/internal/service/carrier_handoff_service.go`

**Checklist**
- [x] AWB creation state defined and idempotent.
- [x] Support three first-mile modes when provider capability allows: `lancar_pickup`, `provider_pickup`, `customer_dropoff`.
- [x] Mode comes from provider capability/service option, not hardcoded customer UI.
- [x] LANCAR first-mile chain of custody proof when LANCAR handles pickup.
- [x] Carrier handoff records provider/AWB/time/location/evidence/actor.
- [x] After carrier acceptance, provider events invoke the acceptance recorder and normalized lifecycle consumer.
- [ ] Authenticated staging/provider webhook verification covers acceptance → normalized lifecycle → tracking updates.

---

## AGG-2026-007 — Normalize carrier events without losing raw truth [P0]

**Files to edit**
- `backend/integration-gateway/internal/handler/tracking_webhook_handler.go`
- `backend/integration-gateway/internal/domain/provider.go`
- `backend/order-service/internal/handler/delivery_webhook_handler.go`
- `backend/order-service/internal/service/tracking_service.go`
- `backend/order-service/internal/service/order_events.go`
- `frontend/src/app/(portal)/orders/[id]/OrderDetailContent.tsx`
- `frontend/src/app/(portal)/resi/[id]/page.tsx`

**Recommended new files**
- `backend/integration-gateway/internal/domain/carrier_event.go`
- `backend/integration-gateway/internal/provider/carrier_event_normalizer.go`
- `backend/integration-gateway/internal/provider/carrier_event_normalizer_test.go`
- `database/migrations/<timestamp>_add_carrier_event_inbox.sql`

- [x] Persist event id/hash, raw provider status/code/description/location/timestamp and raw-payload reference before processing.
- [x] Normalize to canonical statuses but never discard raw values.
- [x] Provider event dedupe/replay protection.
- [x] Out-of-order event cannot regress terminal state.
- [x] Unknown status is stored/observable and shown as safe generic customer state rather than guessed.
- [ ] Authenticated staging/provider replay verifies unknown-status persistence, dedupe, and customer rendering.

---

## AGG-2026-008 — Provider-driven COD / return / lost / damaged / claim finance [P0]

**Files to edit**
- `backend/order-service/internal/domain/aggregator_finance.go`
- `backend/order-service/internal/service/aggregator_finance_service.go`
- `backend/order-service/internal/repository/aggregator_finance_repo.go`
- `backend/order-service/internal/handler/aggregator_finance_handler.go`
- `frontend/src/app/(portal)/orders/[id]/OrderDetailContent.tsx`
- `frontend/src/app/(portal)/disputes/page.tsx`
- `admin-dashboard/src/pages/Disputes.tsx`
- `admin-dashboard/src/pages/FinanceContent.tsx`

**Recommended new files**
- `backend/order-service/internal/domain/aggregator_claim.go`
- `backend/order-service/internal/service/aggregator_claim_service.go`
- `backend/order-service/internal/handler/aggregator_claim_handler.go`

**Checklist**
- [x] COD shown only when selected provider/service supports it.
- [x] Return-to-sender lifecycle follows provider status/policy and records fee owner.
- [x] Lost/damaged claim references carrier, AWB, item value, insurance, provider liability, evidence, claim reference/status.
- [x] Customer compensation/refund and provider reimbursement never double-credit ledger.
- [x] LANCAR does not impose one global retry/return SLA across all carriers unless contractually configured per provider.
- [ ] Authenticated staging/provider finance reconciliation verifies COD gating, return policy, and claim settlement end to end.

---

## AGG-2026-009 — Aggregator customer web decision UX [P1]

**Files to edit**
- `frontend/src/app/(portal)/orders/new/aggregator/page.tsx`
- `frontend/src/components/orders/AggregatorWizard.tsx`
- `frontend/src/components/orders/AggregatorForm.tsx`
- `frontend/src/components/orders/AddressPicker.tsx`
- `frontend/src/components/orders/OrderSummary.tsx`

- [x] Steps: Pickup → Receiver/Package → Compare Carrier → Review & Pay.
- [x] Carrier cards show provider/service name, ETA/source, chargeable weight, price, capabilities, limitations.
- [x] First-mile LANCAR vs external-carrier stage visually distinct.
- [x] Success only after persisted order.
- [ ] Authenticated staging browser proof confirms quote → persisted order → payment recovery with real provider responses.

---

## AGG-2026-010 — Universal capability-based provider architecture [P0]

**Problem**  
`Logistics3PLProvider` yang hanya mempunyai `CheckTariff/CreateOrder/TrackOrder` terlalu sempit untuk carrier dengan pickup, webhook, POD, cancellation, COD, return, insurance, claim, label, atau capability berbeda. Sebaliknya satu giant interface akan memaksa provider mengimplementasikan fitur yang tidak mereka punya.

**Files to edit**
- `backend/integration-gateway/internal/domain/provider.go`
- `backend/integration-gateway/internal/handler/logistics_handler.go`
- `backend/integration-gateway/cmd/api/main.go`
- `backend/integration-gateway/internal/provider/jne_adapter.go`
- `backend/integration-gateway/internal/provider/jnt_adapter.go`

**Recommended new files**
- `backend/integration-gateway/internal/domain/logistics_provider.go`
- `backend/integration-gateway/internal/domain/logistics_capability.go`
- `backend/integration-gateway/internal/provider/logistics_registry.go`
- `backend/integration-gateway/internal/service/logistics_orchestrator.go`
- `docs/contracts/logistics-provider-adapter-2026.md`

**Capability interfaces / contracts to support as applicable**
- `TariffProvider`
- `ShipmentProvider`
- `TrackingPullProvider`
- `TrackingWebhookProvider`
- `PickupProvider`
- `CancellationProvider`
- `LabelProvider`
- `PODProvider`
- `InsuranceProvider`
- `CODProvider`
- `ReturnProvider`
- `ClaimProvider`

**Checklist**
- [x] Every provider has canonical provider id/code/name and declared capability set.
- [x] Provider that does not support a capability is not forced to fake it.
- [x] Orchestrator selects operation based on declared capability.
- [x] Customer-facing provider/service options are generated from backend registry/result.
- [x] Native provider service code/name is preserved.
- [x] Provider credentials/config live server-side.
- [x] Circuit breaker/retry/timeout policy configurable per provider.
- [x] Adding provider does not require edits in customer Android, customer web, payment core, or generic order detail unless genuinely introducing new UX capability.
- [ ] Authenticated staging verifies registry/capability/service payload against live provider configuration.

---

## AGG-2026-011 — Provider-specific webhook adapters + polling fallback [P0]

**Problem**  
`tracking_webhook_handler.go` currently owns JNE/J&T parsing in a central switch. This will become unmaintainable as providers grow.

**Files to edit**
- `backend/integration-gateway/internal/handler/tracking_webhook_handler.go`
- `backend/integration-gateway/cmd/api/main.go`
- `backend/integration-gateway/internal/provider/jne_adapter.go`
- `backend/integration-gateway/internal/provider/jnt_adapter.go`

**Recommended new files**
- `backend/integration-gateway/internal/domain/logistics_webhook.go`
- `backend/integration-gateway/internal/provider/jne_webhook.go`
- `backend/integration-gateway/internal/provider/jnt_webhook.go`
- `backend/integration-gateway/internal/service/carrier_event_processor.go`
- `backend/integration-gateway/internal/worker/tracking_poll_worker.go`

**Checklist**
- [x] Provider-specific signature/auth verification belongs to provider webhook adapter.
- [x] Adapter parses native payload into canonical `CarrierEvent`.
- [x] Webhook-capable provider uses webhook as primary event source where appropriate.
- [x] Tracking-pull-only provider uses polling worker.
- [x] Webhook provider may still use periodic pull reconciliation if supported.
- [x] Provider with neither supported webhook nor pull is surfaced as degraded/manual tracking capability.
- [x] Central handler routes provider→adapter but does not contain growing provider-specific parsing switch.
- [ ] Authenticated staging verifies webhook-primary delivery, polling fallback, reconciliation, and degraded/manual exposure.

---

## AGG-2026-012 — Raw + normalized carrier status model [P0]

**Files to edit**
- `backend/integration-gateway/internal/domain/provider.go`
- `backend/integration-gateway/internal/handler/tracking_webhook_handler.go`
- `backend/integration-gateway/internal/provider/jne_adapter.go`
- `backend/integration-gateway/internal/provider/jnt_adapter.go`
- `backend/order-service/internal/service/tracking_service.go`
- `frontend/src/app/(portal)/orders/[id]/OrderDetailContent.tsx`
- `frontend/src/app/(portal)/resi/[id]/page.tsx`

**Recommended new files**
- `backend/integration-gateway/internal/provider/status_mapper.go`
- `backend/integration-gateway/internal/provider/status_mapper_test.go`

**Canonical normalized status target**
- `CREATED`
- `AWB_ISSUED`
- `PICKUP_SCHEDULED`
- `PICKED_UP`
- `HANDED_TO_CARRIER`
- `IN_TRANSIT`
- `AT_SORTING_CENTER`
- `OUT_FOR_DELIVERY`
- `DELIVERED`
- `DELIVERY_FAILED`
- `EXCEPTION`
- `RETURN_REQUESTED`
- `RETURN_IN_TRANSIT`
- `RETURNED_TO_SENDER`
- `LOST`
- `DAMAGED`
- `CANCELLED`
- `UNKNOWN`

**Checklist**
- [x] Store `provider_status`, `provider_status_code`, `provider_status_description`, `provider_location`, `provider_timestamp`.
- [x] Also store normalized LANCAR status.
- [x] Mapping is provider-specific/configurable/tested.
- [x] Customer UI can show friendly status plus useful provider detail.
- [x] Unknown raw status does not get incorrectly coerced to `IN_TRANSIT`.
- [ ] Staging migration and live provider payload verification confirm mapping/rollback behavior.

---

## AGG-2026-013 — Provider onboarding = adapter only, no core rewrite [P0 release gate]

**Recommended new tests/files**
- `backend/integration-gateway/internal/provider/provider_contract_test.go`
- `backend/integration-gateway/internal/provider/provider_fixture_test.go`
- `backend/integration-gateway/internal/provider/testdata/jne/`
- `backend/integration-gateway/internal/provider/testdata/jnt/`
- `docs/runbooks/onboard-logistics-provider.md`

**Checklist**
- [x] Contract test suite can be reused for a new provider adapter.
- [x] Fixtures cover rate, create shipment/AWB, tracking, errors, timeout, duplicate event, unknown status.
- [x] Capability matrix is validated at startup/config load.
- [x] New provider has health/readiness diagnostics.
- [x] Onboarding runbook documents credentials, base URL, sandbox/prod, location mapping, service mapping, webhook route/signature, polling, SLA source, COD/insurance/return/claim capabilities.
- [x] Demonstrate with one additional stub/fake provider that registration requires no customer UI/core order edits.
- [ ] External sandbox/staging contract verification and live readiness validation completed.

---

# PART F — TOWING END-TO-END

## TOW-2026-001 — Structured Towing booking [P0]

**Files to edit**
- customer `ServiceBookingScreen.kt`, `ServiceBookingViewModel.kt`, `VehicleDetailInput.kt`, `ServiceModels.kt`
- `backend/order-service/internal/domain/tambalban.go`
- `backend/order-service/internal/handler/tambalban_handler.go`

**Recommended new customer files only if generic screen becomes branch-heavy**
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/service/TowingBookingScreen.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/service/TowingBookingViewModel.kt`

- [x] Exact pickup and normalized destination.
- [x] Vehicle type/make/model/condition/access constraints structured.
- [x] Remove parcel-shaped placeholders like `small`, zero dimensions, fake receiver/phone.
- [x] Route preview/operator visible.
- [x] Local client/server booking contract tests reject incomplete vehicle, contact, address, and coordinate data.
- [ ] Staging/Docker end-to-end booking verification with real backend data.

## TOW-2026-002 — Capability/vehicle-safe matching [P0]
- [x] Validate towing motor/mobil capability.
- [x] Capacity/vehicle compatibility.
- [x] Active job/radius/availability.
- [x] Incompatible preferred courier cannot be forced.
- [x] Local contract coverage verifies normal and preferred dispatch guards and duplicate-offer exclusion.
- [ ] Staging/Docker matching verification with real courier capability and active-job data.

## TOW-2026-003 — Route/toll quote + explicit requote [P0]

**Files to edit**
- customer service booking files
- `backend/order-service/internal/service/pricing_service.go`
- `backend/order-service/internal/handler/tambalban_handler.go`
- courier `ServiceUpgradeScreen.kt`

- [x] Actual pickup→dropoff route.
- [x] Toll/service/operator/platform/insurance components.
- [x] No vague silent admin adjustment.
- [x] Customer consent for material increase.
- [x] Local contract coverage verifies expiry/route-change/material-increase consent and explicit toll inclusion semantics.
- [ ] Staging/Docker verification of provider toll data and live requote/payment flow.

## TOW-2026-004 — Inspection→loading→transit→unloading→completion proof [P0]

**Files to edit**
- courier `TowingFlow.kt`, `TowingFlowScreen.kt`, `TowingFlowViewModel.kt`, `InspectVehicleScreen.kt`, `TowingProgressSteps.kt`, `TowingReportCard.kt`, `ServiceReportProofUploader.kt`
- `backend/order-service/internal/domain/tambalban.go`
- `backend/order-service/internal/handler/tambalban_handler.go`

  - [x] Before-condition proof.
  - [x] Loading proof before transit.
  - [x] Unloading/destination verification before complete.
  - [x] Completion proof/signature server validated.
- [x] Local service contract verifies destination timestamp and proof/signature retrieval.
  - [ ] Staging/Docker lifecycle proof verification with real upload, order state, and signature persistence.

## TOW-2026-005 — Damage claim protection [P0]
  - [x] Before evidence immutable after transit begins.
  - [x] Before/after same vehicle/order/operator is bound through dispatch metadata, `order_legs.vehicle_id`, and the server-side towing report lookup.
  - [x] Liability decision requires an authorized reviewer, reason, timestamp, and immutable audit event.
  - [x] Compensation reconciles exactly once against an approved amount with a settlement, insurance, or platform-reserve reference.
  - [ ] Staging/Docker damage-claim and compensation reconciliation verification.

## TOW-2026-006 — Customer tracking parity [P0]
- [x] Human-readable stages: menuju pickup→tiba→inspeksi→loading→perjalanan→unloading→selesai.
- [x] ETA/route refresh.
- [x] Snapshot recovery.
- [ ] Staging/Docker tracking verification with real towing order, GPS, and reconnect.

## TOW-2026-007 — Conditional backend split [P1]

**Recommended only if complexity threshold is reached**
- `backend/order-service/internal/domain/towing.go`
- `backend/order-service/internal/handler/towing_handler.go`
- `backend/order-service/internal/service/towing_service.go`
- `backend/order-service/internal/repository/towing_repository.go`

- [x] Split only if Towing state/pricing/dependency/claim logic materially diverges from Tambal Ban.
- [ ] Staging/Docker regression verification after the boundary split.

## TOW-2026-008 — Towing UI/UX trust [P1]
- [x] Pickup/destination visible before quote.
- [x] Compatibility explained before operator selection.
- [x] Adjustment requires explicit consent.
- [x] Before-condition evidence is customer-visible trust surface.
- [ ] Staging/Docker visual and interaction verification for the towing trust flow.

---

# PART G — CUSTOMER WEB PLATFORM

## WEB-2026-001 — No fake/optimistic transaction success [P0]

**Files to edit**
- `frontend/src/components/orders/AggregatorWizard.tsx`
- `frontend/src/components/orders/OnDemandOrderForm.tsx`
- `frontend/src/components/orders/PaymentModal.tsx`
- `frontend/src/lib/api.ts`

- [x] Success requires persisted server resource.
- [x] Timeout shows pending/retry, not success.
- [x] Duplicate submit reuses idempotency key.
- [ ] Staging/Docker transaction and payment recovery verification.

## WEB-2026-002 — Service-aware history/detail/resi [P1]

**Files to edit**
- `frontend/src/app/(portal)/orders/page.tsx`
- `frontend/src/app/(portal)/orders/[id]/page.tsx`
- `frontend/src/app/(portal)/orders/[id]/OrderDetailContent.tsx`
- `frontend/src/app/(portal)/orders/[id]/orderDetailTypes.ts`
- `frontend/src/app/(portal)/orders/[id]/orderDetailUtils.ts`
- `frontend/src/app/(portal)/resi/page.tsx`
- `frontend/src/app/(portal)/resi/[id]/page.tsx`

**Recommended new components**
- `frontend/src/components/orders/OrderServiceBadge.tsx`
- `frontend/src/components/orders/OrderTimeline.tsx`
- `frontend/src/components/orders/OrderPriceBreakdown.tsx`

- [x] Paket Instan vs Aggregator uses correct vocabulary.
- [x] LANCAR first-mile vs external carrier visually distinct.
- [x] Money state separated from delivery state.
- [ ] Staging/Docker history, detail, and resi visual verification recorded.

## WEB-2026-003 — Accessibility/responsive/failure recovery [P1]
- [x] Keyboard/focus/form error/screen-reader status.
- [x] Sticky CTA/modal works mobile.
- [x] Error/offline states have explicit recovery.
- [ ] Staging/Docker authenticated responsive and failure-recovery verification recorded.

---

# PART H — SHARED CUSTOMER & COURIER UI/UX

## UX-2026-001 — Dashboard IA for 5 services [P1]

**Files to edit**
- customer `DashboardScreen.kt`, `ServiceGridMenu.kt`, `ServiceIcons.kt`, `RootNavGraph.kt`, `Screen.kt`

- [x] Distinct labels/icons/purpose.
- [x] Recommended: `Paket Instan`, `Food`, `Tambal Ban`, `Ekspedisi Antar-Kota`, `Towing`.
- [x] Emergency services visually distinct.
- [ ] Android device/staging navigation verification with live service registry.

## UX-2026-002 — One order-detail shell, service-specific sections [P1]

**Files to edit**
- customer `OrderHistoryScreen.kt`, `OrderDetailScreen.kt`, `OrderDetailViewModel.kt`

**Recommended new files**
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/detail/OrderDetailSections.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/detail/OrderActionPolicy.kt`

- [x] Shared shell + typed service sections.
- [x] Action policy by state+service.
- [x] Unknown state safe.
- [ ] Android device/staging detail-flow verification with real service orders.

## UX-2026-003 — Courier service-mode clarity [P1]
- [x] Active capabilities clear before offers.
- [x] Offer shows service/capability/earnings/route/proof requirement.
- [x] Food/Paket/Tambal/Towing cues distinct.
- [ ] Android device/staging offer verification with live capability and service data recorded.

## UX-2026-004 — Notification/deep-link consistency [P1]
- [x] Push includes service/order/target/event version.
- [x] Stale push cannot regress UI.
- [x] Deep link always snapshot-reconciles.
- [ ] FCM/WebSocket/device runtime verification with real versioned events recorded.

---

# PART I — ADMIN / OPERATIONS

## OPS-2026-001 — Unified operational timeline [P0]

**Files to edit**
- `admin-dashboard/src/components/ActiveOrdersTable.tsx`
- `admin-dashboard/src/pages/Orders.tsx`
- `admin-dashboard/src/pages/AuditLogs.tsx`
- `admin-dashboard/src/pages/Disputes.tsx`
- `admin-dashboard/src/components/LiveMap.tsx`
- `admin-dashboard/src/lib/api.ts`

**Recommended new backend files if needed**
- `backend/order-service/internal/service/order_audit_service.go`
- `backend/order-service/internal/handler/order_audit_handler.go`

- [x] Filter by service/subtype/provider/merchant/courier/payment state.
- [x] Timeline shows actor/state/proof/payment/refund/provider events/override.
- [x] Provider raw event accessible to ops without leaking to normal customer surface.
- [ ] Authenticated staging/Docker verification covers each filter, timeline, and raw-event role boundary.

## OPS-2026-002 — Exception queues [P0]

**Recommended page if current Orders overloaded**
- `admin-dashboard/src/pages/OrderExceptions.tsx`

- [ ] No courier/technician/operator.
- [ ] Payment pending SLA breach.
- [ ] Paid/create/dispatch mismatch.
- [ ] AWB create failed/provider circuit open.
- [ ] Unknown/out-of-order carrier event.
- [ ] Merchant timeout/readiness issue.
- [ ] Service adjustment awaiting approval.
- [ ] Missing proof.
- [ ] Completed but reconciliation mismatch.

---

# PART J — OBSERVABILITY

## OBS-2026-001 — Common transaction telemetry [P0]
- [ ] Quote latency/success/requote.
- [ ] Duplicate prevented.
- [ ] Create→payment→dispatch latency.
- [ ] Match/reassign/no-supply.
- [ ] Transition errors.
- [ ] Realtime reconnect mismatch.
- [ ] Financial exceptions.
- [ ] Proof/handoff failures.

## OBS-2026-002 — Service KPIs [P1]
- [ ] Paket: match/pickup/delivery SLA, failed delivery, recovery path, POD issue.
- [ ] Food: merchant response/prep accuracy/wait/handoff/refund.
- [ ] Tambal: technician ETA/onsite/adjustment/claim.
- [ ] Aggregator: provider rate success, provider mix, AWB failures, webhook/poll freshness, carrier SLA, return/lost/damaged, COD/claim reconciliation.
- [ ] Towing: operator match/arrival/loading/transit/adjustment/damage claim.

---

# PART K — AUTOMATED TESTING / QA GATES

## QA-2026-001 — Paket Android E2E [P0]

**Recommended new tests**
- `android-app-customer/app/src/androidTest/java/com/tembus/customer/PackageOrderFlowTest.kt`
- `backend/order-service/internal/service/order_package_e2e_test.go`

- [ ] Address variants.
- [ ] Quote expiry.
- [ ] Duplicate submit.
- [ ] Payment fail/late callback.
- [ ] Courier race/reassign/no supply.
- [ ] Pickup verification.
- [ ] Offline tracking.
- [ ] Failed delivery→retry/support/optional return resolution→POD as applicable.

## QA-2026-002 — Food cross-app E2E [P0]
- [ ] Complete `FOOD-2026-007` mandatory scenarios.

## QA-2026-003 — Tambal Ban E2E [P0]
- [ ] GPS/manual pin/capability/unavailable technician/adjustment/proof/settlement/claim.

## QA-2026-004 — Aggregator Web E2E [P0]

**Recommended new file**
- `frontend/e2e/aggregator-order-flow.spec.ts`

- [ ] Real origin/provider/rate source.
- [ ] Persisted manual create; fake redirect fails test.
- [ ] Duplicate submit.
- [ ] Provider unavailable/rate expiry.
- [ ] Payment/AWB success/failure.
- [ ] First-mile/handoff.
- [ ] Provider webhook progression.
- [ ] Polling-only provider progression.
- [ ] Unknown status preserved safely.
- [ ] Provider-driven return/lost/damaged scenario only when capability/policy applies.

## QA-2026-005 — Towing E2E [P0]
- [ ] Pickup/dropoff/capability/quote/requote/proof/transit/unloading/cancel/damage evidence.

## QA-2026-006 — Paket Web E2E [P0]
- [ ] Create→quote→payment→history→tracking→completion.
- [ ] Refresh/back/retry idempotency.
- [ ] Failed delivery support path.

## QA-2026-007 — Concurrency/replay suite [P0]

**Recommended new files**
- `backend/order-service/internal/service/order_concurrency_test.go`
- `backend/order-service/internal/service/webhook_replay_test.go`
- `backend/order-service/internal/service/financial_invariants_test.go`

- [ ] Parallel create.
- [ ] Parallel courier accept.
- [ ] Duplicate payment/refund/carrier callbacks.
- [ ] Out-of-order events.
- [ ] Terminal immutability.

## QA-2026-008 — Logistics provider contract suite [P0]

**Files/recommended files**
- `backend/integration-gateway/internal/provider/provider_contract_test.go`
- `backend/integration-gateway/internal/provider/provider_fixture_test.go`
- provider testdata directories

- [ ] Every registered provider passes capability declaration validation.
- [ ] Tariff mapping preserves native service code.
- [ ] Missing ETA stays unavailable rather than fabricated.
- [ ] Create shipment is idempotent or safely deduplicated by LANCAR reference.
- [ ] Tracking normalization keeps raw truth.
- [ ] Webhook signature/replay tests when webhook capability exists.
- [ ] Polling tests when tracking-pull capability exists.

---

# PART L — DATABASE / MIGRATIONS

## DATA-2026-001 — Schema changes [P0]

**Migration directory:** `database/migrations/`

**Recommended migration names — inspect existing schema first**
- `database/migrations/<timestamp>_add_order_idempotency_keys.sql`
- `database/migrations/<timestamp>_add_order_quote_snapshots.sql`
- `database/migrations/<timestamp>_add_order_state_version.sql`
- `database/migrations/<timestamp>_add_handoff_verification.sql`
- `database/migrations/<timestamp>_add_service_adjustments.sql`
- `database/migrations/<timestamp>_add_carrier_event_inbox.sql`
- `database/migrations/<timestamp>_add_logistics_provider_capabilities.sql`
- `database/migrations/<timestamp>_add_reconciliation_exceptions.sql`

- [ ] Reuse equivalent existing schema when semantics match.
- [ ] Add unique/index for idempotency/event dedupe/owner queries.
- [ ] Backfill legacy without fabricated facts.
- [ ] Separate large backfill from blocking migration where necessary.

---

# PART M — SECURITY / PRIVACY / FRAUD

## SEC-2026-001 — AuthZ/public token/data exposure [P0]

**Files to edit**
- `backend/order-service/internal/middleware/auth_middleware.go`
- `backend/order-service/internal/middleware/rate_limiter.go`
- `backend/order-service/internal/middleware/validator.go`
- `frontend/src/middleware.ts`
- `frontend/src/lib/customerSession.ts`
- `frontend/src/app/track/[token]/page.tsx`
- `admin-dashboard/src/lib/csrf.ts`

- [ ] Owner/role check for order/proof/job/payment/refund/claim.
- [ ] Public tracking token scoped/expiring/revocable.
- [ ] Provider credentials never reach browser/client.
- [ ] Rate limit geocode/quote/OTP/tracking/public mutation.

## SEC-2026-002 — Cross-service abuse controls [P1]
- [ ] Handoff brute-force rate-limited/audited.
- [ ] Fake GPS/impossible movement ops signals.
- [ ] Repeated post-dispatch cancellation surfaced.
- [ ] Provider webhook signature/replay protection capability-aware.
- [ ] High-risk financial override can require elevated/dual review.

---

# PART N — FINAL UI/UX ACCEPTANCE

## N1 — Paket On-Demand
- [ ] User understands pickup/destination/package/service/ETA/total/receiver/cancellation before pay.
- [ ] Tracking has one clear next step.
- [ ] Failed delivery surfaces recovery/help, not external-carrier jargon.
- [ ] Web/Android tell same state/price story.

## N2 — Food
- [ ] Discovery→menu→cart→destination→quote/pay→tracking is understandable.
- [ ] Merchant optimizes prep/SLA; courier optimizes pickup/handoff; customer optimizes confidence.

## N3 — Tambal Ban
- [ ] Short emergency flow, capability-aware technician, explicit adjustment consent.
- [ ] Before/after report builds trust.

## N4 — Aggregator
- [ ] Customer understands LANCAR first-mile vs external carrier responsibility.
- [ ] Carrier comparison is live/provider-derived.
- [ ] Native carrier service name/code preserved.
- [ ] Return/lost/damaged/COD/insurance only shown according to provider capability/policy.
- [ ] Unknown provider event never becomes fabricated certainty.

## N5 — Towing
- [ ] Pickup/destination/compatibility/route/price clear.
- [ ] Adjustment explicitly consented.
- [ ] Inspection/loading/unloading evidence protects both sides.

---

# PART O — GLOBAL DEFINITION OF DONE

A task is complete only when applicable boxes below are true:

- [ ] Domain/API contract documented.
- [ ] Server-side validation implemented.
- [ ] AuthZ/ownership enforced.
- [ ] Quote/pricing authoritative.
- [ ] Idempotency/retry behavior tested.
- [ ] State invariant tested.
- [ ] Required customer/merchant/courier/web/admin surfaces wired.
- [ ] Offline/reconnect behavior defined.
- [ ] Realtime cannot regress authoritative state.
- [ ] Payment/refund/payout/settlement reconciled.
- [ ] Manual override audited.
- [ ] Proof/handoff enforced server-side.
- [ ] Typed actionable errors rendered.
- [ ] Unit/integration/contract tests added.
- [ ] E2E or explicit staging validation exists.
- [ ] Observability/correlation id exists.
- [ ] Privacy/security review complete.
- [ ] No client-fabricated price/ETA/availability/provider status/order state.
- [ ] No fake transaction success.
- [ ] Aggregator provider-specific rules remain inside adapter/config/provider mapping boundary rather than leaking into customer/core code.

---

# RECOMMENDED IMPLEMENTATION ORDER

1. `AGG-2026-004` — remove fake success immediately.
2. `AGG-2026-010` + `AGG-2026-013` — establish capability-based provider contract/onboarding gate before adding many carriers.
3. `AGG-2026-001/002/003` — real origin/location/provider rate truth; remove fabricated ETA.
4. `CORE-2026-001/002/003/004` — canonical contract, idempotency, quote, state machine.
5. `CORE-2026-005/006/007/008` — finance, proof, recovery, errors.
6. Paket P0 with revised internal failed-delivery recovery model.
7. Food P0, then Food P1.
8. Tambal Ban P0.
9. Towing P0.
10. `AGG-2026-006/007/008/011/012` — AWB/handoff/events/provider-driven exception finance.
11. Admin exception/reconciliation.
12. QA contract/concurrency/E2E gates.
13. P1/P2 parity/accessibility/scale features.

---

# ARCHITECTURE GUARDRAILS

- Paket On-Demand is **LANCAR-controlled local delivery**. Do not copy external carrier return/claim semantics into its normal lifecycle.
- Aggregator is **universal carrier orchestration**. Carrier-specific API/service/status/policy belongs in Integration Gateway adapter/config mapping.
- `backend/integration-gateway` remains boundary for JNE/J&T/SiCepat/AnterAja/Ninja/Pos/Lion/TIKI/etc integration.
- New carrier should normally require a provider adapter, provider config/capabilities, mapping fixtures/tests, webhook/poll setup—not edits across customer app and order core.
- Preserve provider-native service/status data alongside normalized LANCAR representation.
- Never fabricate provider ETA/SLA/status.
- Provider with fewer capabilities is valid; UI shows only supported features.
- Keep `backend/order-service/internal/domain/tambalban.go` shared with Towing until divergence justifies split.
- Prefer shared quote/idempotency/transition/adjustment services where invariants are genuinely shared.
- Existing courier Towing flow should be hardened, not discarded.

---

# PART P — INTERNATIONAL / UBER-CLASS PLATFORM READINESS

> **Target:** bagian ini bukan sekadar menambah fitur customer. Tujuannya membuat LANCAR dapat berekspansi lintas negara/region tanpa fork aplikasi atau hardcode market, dan mempunyai control plane, reliability, risk, experimentation, support, data, serta developer surface yang dibutuhkan platform global.

## GLOB-2026-001 — Global market configuration plane [P0]

**Recommended new service/files — create only if no equivalent config service exists**
- `backend/platform-config-service/cmd/api/main.go`
- `backend/platform-config-service/internal/domain/market.go`
- `backend/platform-config-service/internal/domain/market_service_config.go`
- `backend/platform-config-service/internal/domain/legal_document.go`
- `backend/platform-config-service/internal/service/market_config_service.go`
- `backend/platform-config-service/internal/repository/market_config_repository.go`
- `backend/platform-config-service/internal/handler/market_config_handler.go`
- `backend/platform-config-service/internal/service/market_config_service_test.go`
- `admin-dashboard/src/pages/settings/MarketConfiguration.tsx`
- `database/migrations/<timestamp>_add_market_configuration.sql`
- `docs/contracts/market-configuration-2026.md`

**Checklist**
- [ ] Every market has canonical ISO country/region code, currency, default locale, timezone, measurement system, phone/address rules and launch state.
- [ ] Service availability is config-as-data per market/city; do not fork code for a country.
- [ ] Payment methods, logistics providers, map providers, tax policy references, insurance policy references and service hours are market scoped.
- [ ] Legal/privacy/terms document version and effective date are market scoped and auditable.
- [ ] Market config has version, effective-from, rollback version, actor and approval audit.
- [ ] Clients receive only public market config; credentials/secrets remain server-side.
- [ ] Unknown market or incomplete config fails closed for transactional features rather than falling back to Indonesia assumptions.

---

## GLOB-2026-002 — Multi-currency money, tax, FX and settlement model [P0]

**Files to edit**
- `backend/order-service/internal/domain/pricing.go`
- `backend/order-service/internal/domain/payment.go`
- `backend/order-service/internal/domain/ledger.go`
- `backend/order-service/internal/domain/payout.go`
- `backend/order-service/internal/service/pricing_service.go`
- `backend/order-service/internal/service/payment_service.go`
- `backend/order-service/internal/service/payout_service.go`
- `backend/order-service/internal/service/reconciliation_service.go`
- `frontend/src/components/orders/OrderSummary.tsx`
- `android-app-customer/app/src/main/java/com/tembus/customer/data/model/CustomerModels.kt`

**Recommended new files**
- `backend/order-service/internal/domain/money.go`
- `backend/order-service/internal/domain/tax.go`
- `backend/order-service/internal/domain/fx.go`
- `backend/order-service/internal/service/tax_service.go`
- `backend/order-service/internal/service/fx_service.go`
- `database/migrations/<timestamp>_add_money_currency_and_tax_context.sql`

**Checklist**
- [ ] Money uses integer minor units/decimal-safe representation with ISO-4217 currency; never binary float for financial truth.
- [ ] Quote/order/payment/refund/payout/ledger always carry currency explicitly.
- [ ] Currency exponent/rounding rules are currency-aware.
- [ ] Cross-currency flows record source amount, target amount, FX rate source, timestamp, spread/fee and locked rate reference.
- [ ] Tax calculation is jurisdiction-aware and stores tax rule/version used for the transaction.
- [ ] Settlement/reconciliation never compare amounts from different currencies without explicit conversion context.
- [ ] Client formatting uses server amount+currency, not hardcoded `Rp`.

---

## GLOB-2026-003 — Global identity, KYC/KYB, consent and compliance boundary [P0]

**Files to edit**
- `backend/auth-service/`
- `backend/merchant-service/`
- courier onboarding/document modules under `android-app/`
- `admin-dashboard/src/pages/settings/security.tsx`

**Recommended new service/files if no compliance domain exists**
- `backend/compliance-service/cmd/api/main.go`
- `backend/compliance-service/internal/domain/compliance_profile.go`
- `backend/compliance-service/internal/domain/consent.go`
- `backend/compliance-service/internal/domain/verification_requirement.go`
- `backend/compliance-service/internal/service/compliance_service.go`
- `backend/compliance-service/internal/handler/compliance_handler.go`
- `docs/contracts/compliance-market-policy-2026.md`

**Checklist**
- [ ] Customer/courier/merchant verification requirements are market/role based.
- [ ] Consent captures document version, locale, timestamp, actor and purpose.
- [ ] Data retention/deletion/export rules are market scoped.
- [ ] Sensitive verification artifacts use least-privilege access and dedicated retention policy.
- [ ] Launching a new market requires explicit compliance checklist instead of inheriting Indonesian rules silently.
- [ ] Restricted/regulated service categories can be disabled per market without app rebuild.

---

## GLOB-2026-004 — Multi-region architecture, data residency and disaster recovery [P0]

**Recommended new infra/docs — adapt to existing deployment tooling rather than duplicating it**
- `infra/regions/README.md`
- `infra/regions/region-catalog.yaml`
- `infra/terraform/modules/regional-stack/`
- `infra/terraform/modules/global-routing/`
- `infra/terraform/modules/data-replication/`
- `docs/architecture/multi-region-2026.md`
- `docs/runbooks/region-failover.md`
- `docs/runbooks/data-residency.md`

**Checklist**
- [ ] Define region affinity for user/order/provider data.
- [ ] Define which datasets may replicate cross-region and which must remain resident.
- [ ] Define RPO/RTO per domain instead of one global number.
- [ ] Global routing can stop sending traffic to an unhealthy region.
- [ ] Queue/event replication semantics are documented for failover and replay.
- [ ] Regional outage can degrade non-critical features while preserving safe order/payment state.
- [ ] Disaster recovery drill is exercised, measured and audited.
- [ ] Failover does not duplicate order, payment, payout, AWB or carrier mutation.

---

## GLOB-2026-005 — Canonical event and data platform [P0/P1]

**Files to edit**
- `backend/datalake-worker/`
- analytics/event emission in Order, Merchant, Courier, Payment and Integration Gateway services
- `admin-dashboard/src/pages/Analytics.tsx`

**Recommended new files**
- `docs/contracts/event-taxonomy-2026.md`
- `docs/contracts/pii-classification-2026.md`
- `backend/datalake-worker/internal/domain/event_envelope.go`
- `backend/datalake-worker/internal/service/event_validator.go`
- `backend/datalake-worker/internal/service/event_validator_test.go`

**Checklist**
- [ ] Canonical event envelope includes event id, type, schema version, occurred_at, produced_at, market, service, actor pseudonymous id, entity id and correlation/trace id.
- [ ] Event schemas are versioned/backward compatible.
- [ ] PII classification and retention are explicit per field/event.
- [ ] Duplicate/replayed events are identifiable.
- [ ] Analytics definitions for GMV, completed order, cancellation, refund, active courier/merchant and SLA are globally consistent.
- [ ] ML/experimentation consumes governed events, not ad-hoc production DB queries.

---

## GLOB-2026-006 — Marketplace intelligence: dispatch, ETA, supply-demand and batching [P1]

**Files to edit**
- `backend/order-service/internal/service/matching_service.go`
- `backend/order-service/internal/service/order_matching.go`
- `backend/order-service/internal/service/tracking_service.go`
- `backend/order-service/internal/repository/maps_repository.go`

**Recommended new service/files when data volume justifies separation**
- `backend/marketplace-intelligence-service/cmd/api/main.go`
- `backend/marketplace-intelligence-service/internal/domain/dispatch_candidate.go`
- `backend/marketplace-intelligence-service/internal/domain/eta_prediction.go`
- `backend/marketplace-intelligence-service/internal/service/dispatch_service.go`
- `backend/marketplace-intelligence-service/internal/service/eta_service.go`
- `backend/marketplace-intelligence-service/internal/service/demand_forecast_service.go`
- `backend/marketplace-intelligence-service/internal/service/dispatch_service_test.go`

**Checklist**
- [ ] Dispatch candidate scoring can consider ETA, distance, vehicle/capability, workload, acceptance probability, completion probability and marketplace constraints.
- [ ] Food matching can combine merchant prep readiness, courier arrival prediction, waiting risk and batching compatibility.
- [ ] ETA model separates prediction from authoritative order state and exposes confidence/source.
- [ ] Model/rule version is logged per decision for audit and experiment analysis.
- [ ] Cold-start/rule-based fallback exists when ML service is unavailable.
- [ ] Intelligence service failure cannot corrupt order state; safe deterministic fallback exists.

---

## GLOB-2026-007 — Central fraud/risk decision engine [P0/P1]

**Recommended new service/files**
- `backend/risk-service/cmd/api/main.go`
- `backend/risk-service/internal/domain/risk_signal.go`
- `backend/risk-service/internal/domain/risk_decision.go`
- `backend/risk-service/internal/service/risk_service.go`
- `backend/risk-service/internal/service/rule_engine.go`
- `backend/risk-service/internal/repository/risk_repository.go`
- `backend/risk-service/internal/handler/risk_handler.go`
- `admin-dashboard/src/pages/RiskReview.tsx`
- `database/migrations/<timestamp>_add_risk_decisions.sql`

**Checklist**
- [ ] Risk signals can cover account/device/payment/promo/GPS/handoff/refund/claim/provider/collusion patterns.
- [ ] Standard decisions: `ALLOW`, `CHALLENGE`, `REVIEW`, `HOLD`, `BLOCK` with reason codes.
- [ ] Transactional service asks risk engine at defined checkpoints rather than scattering fraud if-statements.
- [ ] Risk timeout has explicit fail-open/fail-closed policy per operation and market.
- [ ] Manual review records reviewer, evidence, decision and reason.
- [ ] Sensitive attributes are not used for targeting/decision unless legally justified and explicitly governed.

---

## GLOB-2026-008 — Experimentation and feature-flag platform [P1]

**Recommended new service/files**
- `backend/experiment-service/cmd/api/main.go`
- `backend/experiment-service/internal/domain/experiment.go`
- `backend/experiment-service/internal/domain/assignment.go`
- `backend/experiment-service/internal/service/assignment_service.go`
- `backend/experiment-service/internal/handler/experiment_handler.go`
- `admin-dashboard/src/pages/Experiments.tsx`
- `database/migrations/<timestamp>_add_experiments_and_assignments.sql`

**Checklist**
- [ ] Deterministic user/entity assignment with stable bucketing.
- [ ] Target by market, city, app version, service, user cohort and safe product attributes.
- [ ] Mutually-exclusive experiment namespaces supported where needed.
- [ ] Exposure event is recorded only when user actually sees/uses treatment.
- [ ] Guardrail metrics include crash/error, cancellation, refund, ETA/SLA and support contact—not conversion alone.
- [ ] Kill switch can immediately disable a treatment.
- [ ] Experiment config cannot change financial truth or bypass server validation.

---

## GLOB-2026-009 — SRE, capacity, chaos and error-budget program [P0]

**Recommended new docs/config**
- `docs/sre/service-catalog.md`
- `docs/sre/slo-catalog.md`
- `docs/sre/error-budget-policy.md`
- `docs/runbooks/incident-command.md`
- `docs/runbooks/payment-provider-outage.md`
- `docs/runbooks/maps-provider-outage.md`
- `docs/runbooks/logistics-provider-outage.md`
- `docs/runbooks/database-failover.md`
- `tests/load/`
- `tests/chaos/`

**Checklist**
- [ ] Every critical service has owner, dependency map, SLI/SLO and alerting threshold.
- [ ] Capacity model covers quote, order create, tracking, socket, payment callback and provider webhook peaks.
- [ ] Backpressure/load shedding protects transactional writes under overload.
- [ ] Circuit breaker/bulkhead/retry budgets prevent cascading failure.
- [ ] Chaos tests cover Redis, database replica, queue, maps, payment, carrier and notification failures.
- [ ] Error budget influences release pace for unstable critical services.
- [ ] Production incident has timeline, owner, severity, communication and postmortem workflow.

---

## GLOB-2026-010 — First-class customer/merchant/courier support case platform [P0]

**Recommended new service/files**
- `backend/support-service/cmd/api/main.go`
- `backend/support-service/internal/domain/case.go`
- `backend/support-service/internal/domain/case_action.go`
- `backend/support-service/internal/service/case_service.go`
- `backend/support-service/internal/handler/case_handler.go`
- `admin-dashboard/src/pages/Cases.tsx`
- `admin-dashboard/src/components/CaseTimeline.tsx`
- `database/migrations/<timestamp>_add_support_cases.sql`

**Checklist**
- [ ] Case links order, payment, refund, courier, merchant, carrier, proof, claim and reconciliation references without copying inconsistent state.
- [ ] Suggested/allowed actions are policy-driven by service/state/market.
- [ ] Support can resolve common edge cases without direct DB/SQL mutation.
- [ ] Compensation/refund actions call audited financial APIs and remain idempotent.
- [ ] SLA, ownership, escalation and reopen history are tracked.
- [ ] Sensitive proof/payment data is role restricted.

---

## GLOB-2026-011 — External developer API + webhook platform [P1]

**Recommended new files/service boundary**
- `backend/api-gateway/` for public routing/auth enforcement
- `backend/developer-platform-service/cmd/api/main.go`
- `backend/developer-platform-service/internal/domain/api_client.go`
- `backend/developer-platform-service/internal/domain/webhook_subscription.go`
- `backend/developer-platform-service/internal/service/webhook_delivery_service.go`
- `backend/developer-platform-service/internal/handler/developer_handler.go`
- `docs/developer/openapi.yaml`
- `docs/developer/webhooks.md`
- `docs/developer/idempotency.md`
- `docs/developer/sandbox.md`

**Checklist**
- [ ] External clients use scoped credentials/OAuth-equivalent, not internal API keys.
- [ ] Public API versioning/backward compatibility policy documented.
- [ ] Quote/create/get/cancel/track operations use idempotency and ownership scopes.
- [ ] Webhooks are signed, replay-protected, retryable and have delivery logs.
- [ ] Sandbox/test environment uses non-financial/provider-safe behavior.
- [ ] Rate limits/quotas and abuse controls per client.
- [ ] Developer API cannot bypass normal pricing/payment/risk/state invariants.

---

## GLOB-2026-012 — Global localization, RTL and accessibility system [P1]

**Files to edit**
- Android string/resources under customer, merchant and courier apps
- customer/merchant/courier formatting utilities
- `frontend/` localization setup

**Recommended new docs/files**
- `docs/product/localization-guidelines.md`
- `docs/product/translation-key-governance.md`

**Checklist**
- [ ] Core UI uses localization keys, not hardcoded Indonesian/English strings.
- [ ] Date/time/timezone/currency/number/address/phone formatting is locale aware.
- [ ] Layout is tested for long translations and RTL before entering RTL markets.
- [ ] Dynamic marketing content supports locale fallback chain.
- [ ] Critical legal/financial copy is versioned and market approved.
- [ ] Accessibility baseline remains valid after dynamic content/localization.

---

## GLOB-2026-013 — API/app compatibility and global release governance [P0]

**Recommended new docs/tests**
- `docs/architecture/api-versioning-policy.md`
- `docs/release/mobile-compatibility-matrix.md`
- `tests/contract/backward-compatibility/`

**Checklist**
- [ ] Backend supports documented minimum client versions during rollout window.
- [ ] Additive API changes are preferred; breaking changes require explicit version/migration path.
- [ ] Server knows app version/schema capability before returning unsupported dynamic features.
- [ ] Old app remains safely usable or receives explicit upgrade-required state; it must not silently misprice/misrender an order.
- [ ] Country launch has rollout/canary/rollback plan independent from mobile store release cadence.

---

## GLOB-2026-014 — Market launch readiness gate [P0 release gate]

**Recommended new docs**
- `docs/runbooks/launch-new-market.md`
- `docs/checklists/market-launch-readiness.md`

**Checklist**
- [ ] Market config/compliance/payment/maps/providers/tax/support/on-call/data residency complete.
- [ ] Localized customer/courier/merchant flows pass E2E.
- [ ] Currency/tax/refund/payout reconciliation passes.
- [ ] Provider and payment sandbox/live credential cutover rehearsed.
- [ ] Load/capacity and region-failover checks pass.
- [ ] Kill switches and rollback tested before launch.
- [ ] Market can be disabled/degraded without shipping a new app binary.

---

# PART Q — RUNTIME-CONFIGURABLE / SERVER-DRIVEN APPS

> **Goal:** marketing, product dan operations dapat mengubah non-code experience seperti banner, promo, urutan section, visibility service, campaign intro, copy, CTA, deep link, theme token tertentu dan rollout audience **tanpa build/release app baru**, tetapi transaction core tetap native + server-authoritative.
>
> **Hard boundary:** remote config **bukan remote-code delivery**. Jangan mengirim executable code/JavaScript untuk mengganti native transaction logic. Jangan memakai arbitrary WebView/HTML sebagai cara untuk melewati Play Store/App Store review.

## APP-2026-001 — Experience Configuration Service / control plane [P0]

**Recommended new service/files — use existing config/CMS service if equivalent already exists**
- `backend/experience-service/cmd/api/main.go`
- `backend/experience-service/internal/domain/experience_manifest.go`
- `backend/experience-service/internal/domain/experience_section.go`
- `backend/experience-service/internal/domain/experience_targeting.go`
- `backend/experience-service/internal/domain/experience_asset.go`
- `backend/experience-service/internal/service/experience_service.go`
- `backend/experience-service/internal/service/publish_service.go`
- `backend/experience-service/internal/repository/experience_repository.go`
- `backend/experience-service/internal/handler/experience_handler.go`
- `backend/experience-service/internal/service/experience_service_test.go`
- `database/migrations/<timestamp>_add_experience_manifests.sql`
- `docs/contracts/app-experience-schema-2026.md`

**Manifest must support**
- `manifest_id`
- `schema_version`
- `revision`
- `market/country`
- `locale`
- `surface` (`customer_android`, `customer_web`, `merchant_android`, `courier_android`)
- `min_app_version`
- optional `max_app_version`
- `starts_at/ends_at`
- `ttl/cache_policy`
- `targeting/experiment reference`
- `sections/components`
- `asset references`
- `checksum/signature`
- `published_at/published_by`

**Checklist**
- [ ] Draft/preview/publish/rollback lifecycle.
- [ ] Immutable published revision for audit.
- [ ] Client receives one resolved manifest appropriate to market/locale/version/cohort.
- [ ] Server rejects invalid component/property combinations before publication.
- [ ] Publish does not allow remote mutation of order/payment/state-machine rules.

---

## APP-2026-002 — Customer Android runtime-config SDK + last-known-good cache [P0]

**Files to edit**
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/main/DashboardScreen.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/components/ServiceGridMenu.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/navigation/RootNavGraph.kt`

**Recommended new files**
- `android-app-customer/app/src/main/java/com/tembus/customer/data/config/ExperienceConfigApi.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/data/config/ExperienceConfigRepository.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/data/config/ExperienceConfigStore.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/data/config/model/ExperienceManifest.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/domain/config/ExperienceConfigManager.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/experience/ExperienceRenderer.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/experience/AppStartupCoordinator.kt`
- `android-app-customer/app/src/test/java/com/tembus/customer/config/ExperienceConfigManagerTest.kt`

**Checklist**
- [ ] App starts from packaged defaults or last-known-good config; startup never waits indefinitely for network config.
- [ ] Refresh config asynchronously using ETag/revision/TTL.
- [ ] Cache is atomic: partially downloaded manifest/assets never replace last-known-good revision.
- [ ] Unsupported schema/component/property is ignored or falls back safely, never crashes home.
- [ ] Config is scoped by market/locale/app version/surface.
- [ ] Logout/account switch clears user-targeted assignment data that must not leak between accounts.

---

## APP-2026-003 — Server-driven home composition [P0/P1]

**Files to edit**
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/main/DashboardScreen.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/components/ServiceGridMenu.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/components/ServiceIcons.kt`

**Recommended new files**
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/experience/DynamicHomeRenderer.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/experience/components/DynamicHeroBanner.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/experience/components/DynamicPromoCarousel.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/experience/components/DynamicServiceGrid.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/experience/components/DynamicInfoCard.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/experience/components/DynamicQuickActions.kt`

**Initial safe component whitelist**
- `hero_banner`
- `campaign_strip`
- `promo_carousel`
- `service_grid`
- `quick_actions`
- `info_card`
- `notice`
- `spacer`

**Checklist**
- [ ] Backend can reorder/hide/show configured home sections without binary update.
- [ ] Service card visibility/order/subtitle/badge can be market/campaign targeted while actual service availability is revalidated by authoritative backend.
- [ ] Renderer only accepts precompiled whitelisted native component types.
- [ ] Unknown component type is skipped with telemetry.
- [ ] Remote config may change presentation, not price/order eligibility truth.
- [ ] Packaged safe home remains available if remote experience service is down.

---

## APP-2026-004 — Dynamic campaign intro / splash-like screen without rebuild [P1]

> **Platform limitation:** Android/iOS native OS launch splash must remain a local installed resource/theme and cannot depend on arbitrary remote network content at process start. The flexible solution is a **campaign intro layer immediately after native splash**, driven from cached remote config/assets.

**Files to edit**
- customer app launch/navigation flow under `android-app-customer/app/src/main/java/com/tembus/customer/ui/navigation/`
- existing Android launch theme/splash resources under `android-app-customer/app/src/main/res/`

**Recommended new files**
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/experience/CampaignIntroScreen.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/experience/CampaignIntroViewModel.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/domain/config/StartupCampaignPolicy.kt`

**Checklist**
- [ ] Native OS splash remains minimal/static/local for reliable startup.
- [ ] Optional campaign intro can use remotely managed image/animation asset and localized copy from cached manifest.
- [ ] Network fetch does not block first usable app screen; show campaign only when config+asset are already valid/cached or quickly available by policy.
- [ ] Campaign supports start/end time, market, locale, cohort, min app version, frequency cap, max impressions and dismiss/skip policy.
- [ ] Missing/expired/corrupt asset skips campaign and proceeds normally.
- [ ] Campaign can be remotely killed instantly.
- [ ] Next-campaign assets can be prefetched so a new promo can appear on subsequent launch without app update.

---

## APP-2026-005 — Dynamic header banner, promo, CTA and deep-link actions [P0]

**Recommended new files**
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/experience/components/DynamicHeaderBanner.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/experience/components/DynamicPromoCard.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/navigation/RemoteDeepLinkResolver.kt`
- `android-app-customer/app/src/test/java/com/tembus/customer/navigation/RemoteDeepLinkResolverTest.kt`

**Checklist**
- [ ] Banner image/copy/badge/CTA/deep-link can change remotely.
- [ ] Internal destination uses allowlisted typed route, not arbitrary string execution.
- [ ] External URL uses explicit domain allowlist and safe browser handoff.
- [ ] Promo banner eligibility is presentation-only; final promo/discount is validated by promo/pricing backend.
- [ ] Banner supports impression/click analytics with manifest revision + campaign id.
- [ ] Broken target cannot trap/crash user; fallback action is no-op or safe landing page.

---

## APP-2026-006 — Remote design tokens with hard safety bounds [P1]

**Recommended new files**
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/theme/RuntimeDesignTokens.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/theme/RuntimeThemeProvider.kt`
- `docs/contracts/runtime-design-tokens.md`

**Allowed examples**
- campaign accent/background token
- banner/card corner preset
- spacing preset
- campaign illustration asset
- badge style preset

**Checklist**
- [ ] Core brand/accessibility tokens have safe packaged defaults.
- [ ] Remote values are constrained by enum/range/contrast validation, not arbitrary styling instructions.
- [ ] Critical transaction screens may opt out of campaign theming.
- [ ] Unsupported theme token falls back safely.
- [ ] Do not remotely download executable UI code or arbitrary font binaries.

---

## APP-2026-007 — Feature flags, kill switches and staged rollout [P0]

**Files to edit**
- experience/config service from `APP-2026-001`
- relevant service availability/config endpoints
- Customer Android, Merchant Android, Courier Android and Customer Web entry points

**Checklist**
- [ ] Flags support `off`, `on`, percentage rollout, market/city, app version and cohort conditions.
- [ ] Emergency kill switch can hide/disable non-safe entry point without waiting for store release.
- [ ] Transaction already in progress is not abandoned because its entry flag turns off; active-order recovery remains accessible.
- [ ] Flag evaluation revision is logged for debugging/experiments.
- [ ] Financial/security invariant cannot be disabled by a marketing feature flag.
- [ ] High-blast-radius flags require elevated approval and rollback plan.

---

## APP-2026-008 — Safe audience targeting and scheduling [P0/P1]

**Checklist**
- [ ] Targeting may use market, city/zone, locale, app version, service usage cohort, new/existing user, merchant/courier role and explicit experiment assignment.
- [ ] Targeting rules have start/end timezone-aware schedule.
- [ ] Do not use sensitive personal attributes for marketing targeting.
- [ ] Server resolves complex targeting; client should not receive unnecessary audience-rule data.
- [ ] Preview tool can simulate market/version/cohort before publish.
- [ ] Default/fallback audience always defined.

---

## APP-2026-009 — Admin CMS: draft → preview → approve → publish → rollback [P0]

**Recommended new admin files**
- `admin-dashboard/src/pages/AppExperience.tsx`
- `admin-dashboard/src/pages/AppExperienceEditor.tsx`
- `admin-dashboard/src/components/experience/ExperiencePreview.tsx`
- `admin-dashboard/src/components/experience/TargetingEditor.tsx`
- `admin-dashboard/src/components/experience/AssetPicker.tsx`
- `admin-dashboard/src/components/experience/RevisionHistory.tsx`

**Checklist**
- [ ] Non-engineering user can create/schedule banner/campaign/home layout from approved component schema.
- [ ] Preview customer Android/web surfaces for selected market/locale/app version.
- [ ] Publish validation blocks missing asset, invalid deeplink, unsupported schema, bad schedule and inaccessible contrast.
- [ ] Revision history shows who changed what and supports one-click rollback to known-good revision.
- [ ] Two-step approval available for global/high-impact campaign.
- [ ] Publish can be canaried to internal/test cohort before public rollout.

---

## APP-2026-010 — Asset CDN, integrity, prefetch and lifecycle [P0]

**Recommended new files/service ownership**
- `backend/experience-service/internal/service/asset_service.go`
- `backend/experience-service/internal/domain/asset.go`
- `docs/runbooks/experience-asset-publishing.md`

**Checklist**
- [ ] Remote image/animation assets use HTTPS CDN/object storage; app never needs secret bucket credential.
- [ ] Manifest records content type, dimensions/aspect expectation, size limit, checksum/version and expiry/cache policy.
- [ ] Client validates content type/size and uses disk cache with bounded eviction.
- [ ] Prefetch only eligible upcoming assets; do not waste bandwidth downloading every campaign globally.
- [ ] Deleted/rolled-back campaign does not break old cached manifest; asset lifecycle respects manifest retention window.
- [ ] Low-bandwidth/data-saver fallback uses lighter asset or no campaign.

---

## APP-2026-011 — Remote-config security boundary / no remote code [P0]

**Files to edit**
- `backend/experience-service/`
- customer config renderer/deep-link resolver
- `backend/api-gateway/` validation/rate-limit boundary as applicable

**Checklist**
- [ ] Manifest has strict schema and maximum payload/component/asset limits.
- [ ] Payload/cache can be integrity-checked by revision/hash/signature strategy.
- [ ] Remote config never contains secrets, arbitrary JavaScript, SQL, shell, reflection target or executable bytecode.
- [ ] Arbitrary WebView HTML is not allowed for core order/payment/identity flows.
- [ ] Deep links and external domains are allowlisted.
- [ ] Server sanitizes user-visible remote text/URLs and prevents unsafe schemes.
- [ ] Compromised CMS account blast radius is limited by role/approval/audit/kill switch.

---

## APP-2026-012 — Experience observability + automated rollback guardrails [P0]

**Files to edit**
- `backend/experience-service/`
- `frontend/src/lib/clientLogger.ts`
- customer Android analytics/logging layer
- `admin-dashboard/src/pages/Analytics.tsx`

**Checklist**
- [ ] Measure manifest fetch success/latency/cache-hit/parse failure/schema fallback.
- [ ] Measure section render failure, broken asset, deeplink failure, campaign impression/click/dismiss.
- [ ] Dashboard can break metrics by manifest revision/market/app version.
- [ ] Crash/startup/network regression after a revision is detectable quickly.
- [ ] High-impact revision can automatically or manually rollback when guardrail threshold trips.
- [ ] Experiment/marketing metrics never replace core reliability guardrails.

---

## APP-2026-013 — Cross-surface runtime config parity [P1]

**Surfaces**
- Customer Android
- Customer Web
- Merchant Android
- Courier Android

**Recommended new files after customer implementation stabilizes**
- merchant-side config repository/renderer under `android-app-merchant/.../data/config/` and `.../ui/experience/`
- courier-side config repository/renderer under `android-app/.../data/config/` and `.../ui/experience/`
- `frontend/src/lib/experience/experienceClient.ts`
- `frontend/src/components/experience/ExperienceRenderer.tsx`

**Checklist**
- [ ] One backend experience service supports surface-specific schemas; do not force customer-home components onto courier/merchant.
- [ ] Merchant can receive dynamic operational notice/campaign/help content without changing kitchen/order state logic.
- [ ] Courier can receive dynamic safety/education/incentive/info modules without changing active-job state machine.
- [ ] Customer Web and Android can share campaign id/eligibility while rendering native surface-appropriate components.

---

## APP-2026-014 — Dynamic localized content packs [P1]

**Checklist**
- [ ] Marketing/banner/help copy can be published per locale without app release.
- [ ] Locale fallback order is explicit, e.g. `id-ID → id → default`.
- [ ] Missing translation does not expose raw localization key.
- [ ] Legal/financial/consent copy uses approved versioned content path, not casual marketing CMS override.
- [ ] Remote copy has length constraints so layout remains stable.

---

## APP-2026-015 — Minimum-version, soft-update and hard-update control [P0]

**Recommended new fields**
- `latest_version`
- `min_supported_version`
- `recommended_version`
- `update_mode`: `none|soft|hard`
- localized release/update message
- store destination per platform/market

**Checklist**
- [ ] Soft update is dismissible and never impersonates transaction failure.
- [ ] Hard update only used when old binary is genuinely unsafe/incompatible.
- [ ] Active order/support access strategy is defined before hard-blocking an old app.
- [ ] Version rule is market/platform scoped.
- [ ] Remote config is not used as a way to avoid required store review for new native capability/code.

---

## APP-2026-016 — Runtime experience contract/E2E/fuzz tests [P0]

**Recommended new tests**
- `backend/experience-service/internal/service/experience_contract_test.go`
- `android-app-customer/app/src/test/java/com/tembus/customer/config/ExperienceManifestParsingTest.kt`
- `android-app-customer/app/src/androidTest/java/com/tembus/customer/RuntimeExperienceFlowTest.kt`
- `frontend/e2e/runtime-experience.spec.ts`

**Mandatory scenarios**
- [ ] First install offline uses packaged default.
- [ ] Cached manifest renders while network refresh fails.
- [ ] New compatible revision updates banner/home order without app release.
- [ ] Invalid/unknown component safely skipped.
- [ ] Corrupt/oversized asset safely rejected.
- [ ] Campaign starts/expires by schedule correctly across timezone.
- [ ] Kill switch removes entry point but active order remains reachable.
- [ ] Old app ignores unsupported new component and remains usable.
- [ ] Bad revision rollback restores known-good experience.
- [ ] Promo shown remotely but server rejects ineligible promo at transaction boundary.

---

# WHAT CAN CHANGE WITHOUT APP UPDATE

After `APP-2026-*` is implemented, these are intended to be remotely changeable within prebuilt component/schema limits:

- [ ] Hero/header banners.
- [ ] Promo carousel/cards.
- [ ] Campaign intro immediately after native splash.
- [ ] Marketing images/animations and localized copy.
- [ ] Home section ordering.
- [ ] Show/hide existing service entry by market/rollout/kill-switch policy.
- [ ] Service badge/subtitle/marketing label.
- [ ] Existing CTA/deeplink destination from allowlisted routes.
- [ ] Campaign schedule/frequency/target cohort.
- [ ] Safe design-token presets.
- [ ] Feature exposure/experiment assignment.
- [ ] Operational notices/help content.
- [ ] Soft/hard minimum-version message/control.

# WHAT STILL REQUIRES AN APP UPDATE

- [ ] New executable/native business logic.
- [ ] New component type not already supported by the installed renderer.
- [ ] New OS permission/capability/SDK/native library.
- [ ] New payment/identity capability requiring native SDK or platform entitlement.
- [ ] New deep-link/navigation capability not present in installed app.
- [ ] Fundamental transaction-state/order logic changes.
- [ ] Arbitrary replacement of the OS-controlled native launch splash with network content.
- [ ] Arbitrary new app icon unless the platform-specific alternate icon/alias assets were already shipped and supported.

---

# GLOBAL EXPANSION IMPLEMENTATION ORDER

1. Finish existing Indonesia P0 transactional blockers first; global scale must not be built on fake-success or weak transaction invariants.
2. `APP-2026-001/002/007/011/015/016` — safe remote-config foundation, cache, kill switch, security, compatibility and tests.
3. `APP-2026-003/004/005/009/010/012` — dynamic home/campaign/CMS/assets/observability.
4. `GLOB-2026-001/002/003/013` — market config, money/tax, compliance and compatibility.
5. `GLOB-2026-009` + existing observability — SRE/SLO/capacity/chaos before multi-region launch.
6. `GLOB-2026-004` — multi-region/data residency/failover.
7. `GLOB-2026-005/008` — governed data + experimentation.
8. `GLOB-2026-007` — centralized risk engine.
9. `GLOB-2026-006` — marketplace intelligence/ML once trustworthy data volume exists.
10. `GLOB-2026-010` — first-class support case platform.
11. `GLOB-2026-011` — external developer API/webhooks after internal contracts stabilize.
12. `GLOB-2026-012/014` — localization/RTL/accessibility + full new-market launch gate.

---

# GLOBAL / RUNTIME EXPERIENCE GUARDRAILS

- Remote config controls **presentation and exposure**, not authoritative price/payment/order state.
- Native OS splash remains local; use a cached **campaign intro** after native splash for remotely changeable promotion.
- Never block startup on a fresh remote-config network request; use packaged defaults + last-known-good cache + async refresh.
- Server-driven UI uses a strict **whitelist of precompiled native components**. Unknown components are skipped safely.
- A remotely hidden service must not hide an already-active order or support path.
- Feature flags cannot bypass fraud, authorization, proof, payment or state-machine invariants.
- Marketing promo eligibility shown in UI must still be revalidated by authoritative promo/pricing backend.
- Country expansion must be config-driven and must not fork the app into Indonesia/SG/MY/etc codebases unless platform constraints truly require separate binaries.
- Every high-blast-radius experience revision has preview, audit, staged rollout, observability and rollback.
- Global readiness is proven through market launch drills, regional failure drills and transaction reconciliation—not by feature count alone.

---

# PART R — ADMIN EXPERIENCE CONTROL PLANE / GUI OPERATIONS

> **Non-negotiable product requirement:** setelah `APP-2026-*` selesai, setiap perubahan runtime experience yang memang didukung schema/component pada binary terpasang **wajib dapat dilakukan dari Admin Web GUI**. API tetap ada sebagai backend contract, tetapi operasi normal marketing/product/ops tidak boleh membutuhkan Postman, curl, SQL, edit database, edit JSON manual di server, perubahan environment variable, commit code, rebuild APK, atau release store.
>
> Admin Experience adalah **control plane**, bukan business-truth engine. Admin dapat mengatur presentation, exposure, targeting, rollout dan campaign. Harga, promo eligibility final, order state, payment, refund, fraud, settlement dan authorization tetap divalidasi service authoritative masing-masing.

## ADMEXP-2026-001 — Integrate App Experience into existing Admin navigation [P0]

**Existing Admin files to edit**
- `admin-dashboard/src/App.tsx`
- `admin-dashboard/src/components/DashboardLayout.tsx`
- `admin-dashboard/src/lib/api.ts`
- `admin-dashboard/src/pages/Banners.tsx`
- `admin-dashboard/src/pages/Promos.tsx`
- `admin-dashboard/src/pages/FeatureFlags.tsx`

**Recommended new Admin pages/components**
- `admin-dashboard/src/pages/experience/AppExperience.tsx`
- `admin-dashboard/src/pages/experience/HomeLayout.tsx`
- `admin-dashboard/src/pages/experience/Campaigns.tsx`
- `admin-dashboard/src/pages/experience/ServiceVisibility.tsx`
- `admin-dashboard/src/pages/experience/ExperienceAssets.tsx`
- `admin-dashboard/src/pages/experience/ExperienceApprovals.tsx`
- `admin-dashboard/src/pages/experience/ExperienceRevisions.tsx`
- `admin-dashboard/src/pages/experience/ExperienceAnalytics.tsx`
- `admin-dashboard/src/components/experience/ExperienceShell.tsx`
- `admin-dashboard/src/components/experience/ExperienceStatusBadge.tsx`

**Required Admin navigation**
- `App Experience → Overview`
- `App Experience → Home Layout`
- `App Experience → Banners & Promo Content`
- `App Experience → Campaign Intro`
- `App Experience → Service Visibility`
- `App Experience → Feature Flags`
- `App Experience → Kill Switches`
- `App Experience → Audience & Targeting`
- `App Experience → Scheduling`
- `App Experience → Asset Library`
- `App Experience → Deep Links`
- `App Experience → Design Tokens`
- `App Experience → App Version Policy`
- `App Experience → Preview`
- `App Experience → Approval Queue`
- `App Experience → Revisions & Rollback`
- `App Experience → Analytics`

**Checklist**
- [ ] Tambahkan satu group/menu `APP EXPERIENCE` di sidebar atau sub-navigation yang jelas di bawah Marketing & Promosi; jangan menyembunyikan control plane di Settings generik.
- [ ] Tambahkan protected routes pada `App.tsx` untuk seluruh halaman Experience.
- [ ] Existing `Banners`, `Promos`, dan `FeatureFlags` tidak boleh menjadi source of truth paralel yang menghasilkan conflict; reuse/shared-data-layer, migrate, atau redirect ke control plane baru.
- [ ] Existing admin users melihat menu sesuai permission; menu yang tidak authorized tidak hanya disembunyikan tetapi backend juga menolak akses.
- [ ] Active market/surface context selalu terlihat agar admin tahu apakah sedang mengubah Indonesia Customer Android, Singapore Customer Web, Courier Android, dll.

---

## ADMEXP-2026-002 — Explicit Admin RBAC / scope matrix [P0]

**Files to inspect/edit**
- `admin-dashboard/src/store/useAuthStore.ts`
- `admin-dashboard/src/App.tsx`
- `admin-dashboard/src/components/DashboardLayout.tsx`
- auth/role policy implementation in backend auth/admin middleware

**Recommended new files**
- `admin-dashboard/src/lib/experiencePermissions.ts`
- `backend/experience-service/internal/domain/admin_permission.go`
- `backend/experience-service/internal/service/admin_authorization_service.go`

**Target permission capabilities**
- `experience.read`
- `experience.draft.write`
- `experience.asset.write`
- `experience.targeting.write`
- `experience.feature_flag.write`
- `experience.kill_switch.execute`
- `experience.submit_approval`
- `experience.approve`
- `experience.publish`
- `experience.rollback`
- `experience.global.publish`
- `experience.version_policy.write`

**Suggested role semantics — map to existing centralized auth model rather than hardcoding duplicates if equivalent roles already exist**
- `marketing_editor`: banner/copy/assets/campaign draft; no global publish.
- `product_editor`: home composition, service exposure, staged rollout draft.
- `ops_admin`: operational notice and authorized emergency kill switches.
- `country_admin`: mutate only assigned market(s).
- `experience_approver`: approve high-impact changes within allowed scope.
- `experience_publisher`: publish approved revisions within allowed scope.
- `super_admin`: global emergency/admin authority with mandatory audit.

**Checklist**
- [ ] Market scope and surface scope enforced server-side.
- [ ] Indonesia admin cannot mutate Singapore/Malaysia/global configuration without explicit global scope.
- [ ] Global/high-blast-radius publish supports maker-checker/two-person approval.
- [ ] Where maker-checker is required, author cannot approve their own revision.
- [ ] Kill-switch permissions are narrower than ordinary marketing edit permission.
- [ ] Every denied action returns typed reason and is auditable.

---

## ADMEXP-2026-003 — Admin Experience API contract for every GUI action [P0]

**Recommended backend files**
- `backend/experience-service/internal/handler/admin_experience_handler.go`
- `backend/experience-service/internal/handler/admin_asset_handler.go`
- `backend/experience-service/internal/handler/admin_approval_handler.go`
- `backend/experience-service/internal/handler/admin_rollout_handler.go`
- `backend/experience-service/internal/service/admin_experience_service.go`
- `backend/experience-service/internal/service/admin_experience_service_test.go`
- `docs/contracts/admin-experience-api-2026.md`

**Required API capability — exact path may follow existing gateway conventions**
- `GET /admin/experience/manifests`
- `GET /admin/experience/manifests/{id}`
- `POST /admin/experience/manifests`
- `PUT/PATCH /admin/experience/manifests/{id}` for draft only
- `POST /admin/experience/manifests/{id}/validate`
- `POST /admin/experience/manifests/{id}/preview`
- `POST /admin/experience/manifests/{id}/submit-approval`
- `POST /admin/experience/manifests/{id}/approve`
- `POST /admin/experience/manifests/{id}/reject`
- `POST /admin/experience/manifests/{id}/publish`
- `POST /admin/experience/manifests/{id}/rollback`
- `GET/POST /admin/experience/assets`
- `GET /admin/experience/revisions`
- `GET /admin/experience/audit`
- `GET/POST /admin/experience/deep-links`
- `GET/POST /admin/experience/rollouts`
- `GET/POST /admin/experience/kill-switches`

**Checklist**
- [ ] Every production-changing button in Admin maps to an authenticated API operation; no direct DB writes from browser.
- [ ] Draft edit uses optimistic concurrency/revision/ETag so two admins cannot silently overwrite each other.
- [ ] Publish/rollback/kill-switch mutations are idempotent or protected against duplicate click/retry.
- [ ] API returns validation errors at field/component level so Admin can highlight the exact problem.
- [ ] Every mutation stores actor, role, market, surface, request id, previous revision, new revision, reason and timestamp.
- [ ] API cannot publish a manifest that bypasses schema/permission/approval rules.

---

## ADMEXP-2026-004 — App Experience Overview / operational cockpit [P0]

**Recommended page**
- `admin-dashboard/src/pages/experience/AppExperience.tsx`

**Overview must show**
- active revision by market/surface
- currently scheduled campaigns
- campaigns expiring soon
- active canary/staged rollouts
- active kill switches
- latest publish/rollback actor and time
- manifest fetch/render health
- unsupported/minimum app-version distribution warning
- broken asset/deep-link/schema warning
- draft awaiting approval count

**Checklist**
- [ ] Admin can filter by country/market, city/zone, surface, locale and app version.
- [ ] Clear separation of `LIVE`, `SCHEDULED`, `CANARY`, `DRAFT`, `AWAITING_APPROVAL`, `ROLLED_BACK`, `EXPIRED`.
- [ ] Overview links directly to offending revision/campaign/asset instead of only showing aggregate errors.
- [ ] Global overview never implies one market config is active everywhere.

---

## ADMEXP-2026-005 — Home Layout drag/drop editor [P0/P1]

**Recommended files**
- `admin-dashboard/src/pages/experience/HomeLayout.tsx`
- `admin-dashboard/src/components/experience/HomeLayoutBuilder.tsx`
- `admin-dashboard/src/components/experience/ComponentPalette.tsx`
- `admin-dashboard/src/components/experience/SectionPropertyEditor.tsx`

**Allowed initial components must match `APP-2026-003` whitelist**
- `hero_banner`
- `campaign_strip`
- `promo_carousel`
- `service_grid`
- `quick_actions`
- `info_card`
- `notice`
- `spacer`

**Per-section Admin fields**
- section id/internal name
- component type
- enabled state
- order/position
- localized title/subtitle/copy as supported
- asset reference where applicable
- CTA/deep-link reference where applicable
- safe design-token preset
- market/city/locale/app-version targeting override where allowed
- start/end schedule where allowed

**Required Admin workflow**
`App Experience → Home Layout → select market/surface → edit/drag sections → configure properties → Preview → Validate → Save Draft → Submit Approval/Publish`

**Checklist**
- [ ] Drag/drop reorder produces deterministic ordered schema, not pixel coordinates.
- [ ] Admin cannot add arbitrary component names not supported by registered schema.
- [ ] Required/safety-critical fallback sections cannot be accidentally deleted when the binary requires them.
- [ ] Duplicate/conflicting section IDs rejected.
- [ ] Device/app-version preview updates before publish.
- [ ] Reordering existing supported components requires no mobile rebuild.

---

## ADMEXP-2026-006 — Banner / promo content editor with field-level specification [P0]

**Existing files to integrate**
- `admin-dashboard/src/pages/Banners.tsx`
- `admin-dashboard/src/pages/Promos.tsx`

**Recommended new/shared files**
- `admin-dashboard/src/pages/experience/Campaigns.tsx`
- `admin-dashboard/src/components/experience/BannerEditor.tsx`
- `admin-dashboard/src/components/experience/PromoContentEditor.tsx`

**Required fields**

**General**
- internal campaign name
- campaign id/reference
- status: draft/scheduled/live/paused/expired
- target surface
- placement: `hero`, `header`, `carousel`, `campaign_strip`

**Content**
- image/animation asset
- fallback asset
- localized title
- localized subtitle/body
- optional badge
- CTA label
- typed CTA/deep-link destination
- accessibility/alt label where surface supports it

**Audience**
- market/country
- city/zone
- locale
- platform/surface
- min/max app version
- new/existing user or allowed non-sensitive cohort
- experiment/cohort reference if applicable

**Schedule & frequency**
- starts_at
- ends_at
- timezone
- frequency cap
- max impressions where applicable

**Release**
- internal preview only
- percentage rollout
- approval state
- publish action
- pause action
- rollback target

**Checklist**
- [ ] Admin can create, duplicate, edit draft, schedule, preview, pause and retire banner without code change.
- [ ] Asset dimensions/size/content type validated before save/publish.
- [ ] Invalid deep link blocks publish.
- [ ] Promo UI copy may advertise an offer but final discount remains validated by Promo/Pricing backend.
- [ ] Impression/click analytics attach campaign id + revision.

---

## ADMEXP-2026-007 — Campaign Intro editor for splash-like campaigns [P1]

**Recommended files**
- `admin-dashboard/src/pages/experience/CampaignIntro.tsx`
- `admin-dashboard/src/components/experience/CampaignIntroEditor.tsx`

**Required fields**
- campaign id/name
- primary image/animation asset
- low-bandwidth/fallback asset
- localized headline/body
- dismissible/skippable policy
- display duration/max duration within safe bounds
- starts_at/ends_at/timezone
- market/city/locale
- min/max app version
- target cohort
- frequency cap per user/device policy
- maximum impressions where applicable
- asset prefetch window
- emergency kill-switch state

**Checklist**
- [ ] Admin preview clearly labels this as **post-native-splash campaign intro**, not OS launch splash.
- [ ] Admin cannot configure network fetch as a mandatory startup blocker.
- [ ] Expired/unavailable asset automatically falls back/skip according to policy.
- [ ] Campaign can be scheduled days ahead and assets prefetched before activation.
- [ ] Kill action is available to authorized ops/publisher without app release.

---

## ADMEXP-2026-008 — Service Visibility + semantically distinct kill switches [P0]

**Recommended files**
- `admin-dashboard/src/pages/experience/ServiceVisibility.tsx`
- `admin-dashboard/src/pages/experience/KillSwitches.tsx`
- `admin-dashboard/src/components/experience/ServiceExposureEditor.tsx`
- `admin-dashboard/src/components/experience/KillSwitchConfirmation.tsx`

**Service visibility fields**
- service id/category
- enabled/disabled for discovery
- order/position
- marketing label/subtitle/badge
- market/country
- city/zone
- surface
- app-version range
- rollout percentage/cohort
- starts_at/ends_at
- fallback behavior

**Kill-switch types must be explicit**
- `marketing_hide`: hide entry/promo only; transaction capability unchanged.
- `new_order_gate`: prevent **new** order creation for selected service/market while preserving active-order access.
- `provider_gate`: disable a provider/carrier/payment/map capability when applicable without pretending the whole service is down.
- `checkout_gate`: stop new checkout/payment initiation safely when explicitly required.

**Checklist**
- [ ] Active orders, tracking, proof, support and refund/recovery entry remain reachable when discovery/new-order entry is disabled.
- [ ] Admin UI explains blast radius before execution and requires reason.
- [ ] High-impact kill switch supports expiry/auto-revert or explicit review time where useful.
- [ ] Business backend still validates service/provider availability; hiding UI is not the sole enforcement.
- [ ] Kill-switch action emits high-severity audit/notification to appropriate ops channel/dashboard.

---

## ADMEXP-2026-009 — Audience & targeting builder + scheduling calendar [P0/P1]

**Recommended files**
- `admin-dashboard/src/pages/experience/AudienceTargeting.tsx`
- `admin-dashboard/src/pages/experience/ExperienceSchedule.tsx`
- `admin-dashboard/src/components/experience/TargetingEditor.tsx`
- `admin-dashboard/src/components/experience/ScheduleEditor.tsx`
- `admin-dashboard/src/components/experience/TargetingSummary.tsx`

**Targeting dimensions**
- market/country
- city/zone
- locale
- surface/platform
- min/max app version
- service usage cohort where privacy-safe
- new/existing user
- merchant/courier role where surface applicable
- explicit experiment assignment
- percentage rollout bucket

**Checklist**
- [ ] Complex targeting resolves server-side; browser/client does not receive unnecessary sensitive rule data.
- [ ] Sensitive personal attributes are unavailable in marketing targeting UI.
- [ ] Start/end schedule always shows effective timezone and converted admin-local preview.
- [ ] Conflict detector warns when two active campaigns compete for the same exclusive placement.
- [ ] Default/fallback audience/config is visible before publish.
- [ ] Preview can simulate at least one matching and one non-matching audience case.

---

## ADMEXP-2026-010 — Asset Library GUI [P0]

**Recommended files**
- `admin-dashboard/src/pages/experience/ExperienceAssets.tsx`
- `admin-dashboard/src/components/experience/AssetUploader.tsx`
- `admin-dashboard/src/components/experience/AssetDetailDrawer.tsx`
- `admin-dashboard/src/components/experience/AssetUsagePanel.tsx`

**Admin must support**
- upload approved image/animation types
- preview asset
- title/internal label
- content type/dimensions/filesize/checksum display
- surface/placement compatibility hints
- low-bandwidth variant
- usage references: which live/draft revisions use the asset
- lifecycle: active/deprecated/scheduled deletion

**Checklist**
- [ ] Oversized/unsupported/corrupt files rejected before becoming publishable.
- [ ] Admin cannot delete an asset still referenced by live or retained rollback revision.
- [ ] Asset replacement creates a new immutable version/reference; do not silently mutate historical campaign content.
- [ ] CDN/object-storage credential never reaches browser.
- [ ] Asset upload and publish are separately permissioned where appropriate.

---

## ADMEXP-2026-011 — Typed Deep Link Registry and tester [P0]

**Recommended files**
- `admin-dashboard/src/pages/experience/DeepLinks.tsx`
- `admin-dashboard/src/components/experience/DeepLinkPicker.tsx`
- `admin-dashboard/src/components/experience/DeepLinkTester.tsx`
- `backend/experience-service/internal/domain/deep_link.go`
- `backend/experience-service/internal/service/deep_link_service.go`

**Checklist**
- [ ] Admin selects typed/registered route such as service home, promo detail, order history, support, etc.; no arbitrary code target.
- [ ] Required route parameters validated before save.
- [ ] Route registry is aware of minimum app/schema version that supports destination.
- [ ] External URL uses allowlisted HTTPS domain/scheme only.
- [ ] Tester shows destination/fallback behavior for selected platform/app version.
- [ ] Removing/deprecating a route identifies campaigns still referencing it.

---

## ADMEXP-2026-012 — Safe runtime Design Token editor [P1]

**Recommended files**
- `admin-dashboard/src/pages/experience/DesignTokens.tsx`
- `admin-dashboard/src/components/experience/DesignTokenEditor.tsx`
- `admin-dashboard/src/components/experience/ContrastPreview.tsx`

**Checklist**
- [ ] Admin may select only predefined token enums/ranges from `APP-2026-006`; never arbitrary CSS/Kotlin instructions.
- [ ] Core brand/safety/transaction-screen token locks are visible and cannot be overridden by marketing role.
- [ ] Contrast/accessibility validator runs before publish.
- [ ] Preview covers light/dark/system modes if supported.
- [ ] Token change participates in revision/approval/rollback like any other experience change.

---

## ADMEXP-2026-013 — App Version Policy GUI [P0]

**Recommended files**
- `admin-dashboard/src/pages/experience/AppVersionPolicy.tsx`
- `admin-dashboard/src/components/experience/AppVersionPolicyEditor.tsx`

**Required fields per platform/market**
- latest version
- recommended version
- minimum supported version
- update mode: `none|soft|hard`
- localized title/body
- store destination
- effective start/end when applicable
- exempt/internal cohort if explicitly approved
- active-order/support fallback behavior

**Checklist**
- [ ] Admin sees estimated affected version distribution before hard update publish.
- [ ] Hard update requires elevated permission + confirmation + reason + approval where configured.
- [ ] System blocks unsafe hard-update rule if it would make active-order/support recovery unreachable.
- [ ] Version policy is market/platform scoped; Android rule does not silently affect web/iOS/future surfaces.

---

## ADMEXP-2026-014 — Real preview simulator before publish [P0]

**Recommended files**
- `admin-dashboard/src/pages/experience/ExperiencePreviewPage.tsx`
- `admin-dashboard/src/components/experience/ExperiencePreview.tsx`
- `admin-dashboard/src/components/experience/PreviewContextPicker.tsx`
- `admin-dashboard/src/components/experience/RevisionDiffPreview.tsx`

**Preview context selectors**
- surface/platform
- device-size preset
- market/country
- city/zone
- locale
- app version/schema capability
- new/existing/cohort profile
- light/dark mode where applicable

**Checklist**
- [ ] Preview resolves the same manifest schema/rules as production resolver, not a disconnected mock implementation.
- [ ] Admin can compare `current live` vs `candidate revision` side-by-side/diff.
- [ ] Unsupported component for selected old app version is visibly shown as skipped/fallback.
- [ ] Broken asset/deep-link/contrast/schedule targeting appears as blocking validation before publish.
- [ ] Preview never counts as real campaign impression/exposure metric.

---

## ADMEXP-2026-015 — Approval → canary → publish → rollback workflow [P0]

**Recommended files**
- `admin-dashboard/src/pages/experience/ExperienceApprovals.tsx`
- `admin-dashboard/src/components/experience/ApprovalTimeline.tsx`
- `admin-dashboard/src/components/experience/PublishDialog.tsx`
- `admin-dashboard/src/components/experience/RolloutEditor.tsx`
- `admin-dashboard/src/components/experience/RollbackDialog.tsx`

**Required lifecycle**
`DRAFT → VALIDATED → PREVIEWED → AWAITING_APPROVAL → APPROVED → SCHEDULED/CANARY → LIVE → PAUSED/EXPIRED/ROLLED_BACK`

**Checklist**
- [ ] Save Draft never changes live user experience.
- [ ] Submit Approval freezes candidate revision or creates immutable candidate snapshot.
- [ ] Approver sees diff, audience, schedule, rollout percentage, affected surfaces and risk/blast-radius summary.
- [ ] Canary can target internal users or small deterministic percentage before general release.
- [ ] Percentage rollout supports staged increase without rebuilding manifest content.
- [ ] Publish is atomic from revision perspective: users resolve either old known-good or new complete revision, never half-edited state.
- [ ] Rollback selects an immutable known-good revision and records rollback reason.
- [ ] Optional automated rollback guardrail can trigger on configured crash/render/fetch failure thresholds, with alert/audit.

---

## ADMEXP-2026-016 — Revision history, field-level diff and audit trail [P0]

**Recommended files**
- `admin-dashboard/src/pages/experience/ExperienceRevisions.tsx`
- `admin-dashboard/src/components/experience/RevisionHistory.tsx`
- `admin-dashboard/src/components/experience/RevisionDiff.tsx`
- `backend/experience-service/internal/domain/experience_audit.go`

**Checklist**
- [ ] Every draft/publish/approval/reject/pause/rollback/kill-switch action records actor + timestamp + reason.
- [ ] Diff shows previous vs new content, targeting, schedule, assets, deep links, flags and token changes.
- [ ] Historical published revision is immutable.
- [ ] Admin can filter history by campaign, market, surface, actor, date and action.
- [ ] Audit history cannot be deleted through normal Experience UI.
- [ ] Rollback link only appears for compatible known-good revisions.

---

## ADMEXP-2026-017 — Experience Analytics and release guardrails in Admin [P0/P1]

**Recommended files**
- `admin-dashboard/src/pages/experience/ExperienceAnalytics.tsx`
- `admin-dashboard/src/components/experience/ExperienceHealthPanel.tsx`
- `admin-dashboard/src/components/experience/CampaignMetricsPanel.tsx`

**Metrics by revision/campaign/market/app-version where applicable**
- manifest fetch success/latency/cache hit
- parse/schema fallback
- component render failure
- broken asset rate
- deep-link failure rate
- campaign impression/click/dismiss
- startup impact
- crash/error guardrail
- experiment exposure where applicable

**Checklist**
- [ ] Admin can drill from anomaly to exact live revision/campaign.
- [ ] Marketing metrics and reliability metrics shown separately; high CTR does not hide crash regression.
- [ ] Rollback CTA available from a failing revision health view only to authorized role.
- [ ] Alert threshold/config change itself is audited.

---

## ADMEXP-2026-018 — Existing Banners / Promos / FeatureFlags migration and one-source-of-truth gate [P0]

**Existing files to inspect/edit**
- `admin-dashboard/src/pages/Banners.tsx`
- `admin-dashboard/src/pages/Promos.tsx`
- `admin-dashboard/src/pages/FeatureFlags.tsx`
- corresponding backend endpoints/repositories currently backing these pages

**Checklist**
- [ ] Inventory current banner/promo/feature-flag persistence and API ownership before creating new tables/services.
- [ ] Reuse existing proven primitives where semantics match.
- [ ] Define which existing data migrates into Experience Service and which remains authoritative in Promo/business service.
- [ ] Promo **financial rule/eligibility** remains in Promo/Pricing domain; Experience Service only controls promo presentation/exposure.
- [ ] Feature flags with platform/runtime semantics are consolidated or bridged so UI does not write two independent flag stores.
- [ ] Old direct-write route/page is deprecated/redirected only after migration/backfill and compatibility tests pass.
- [ ] No period where two admin screens can publish conflicting live banner/service visibility truth without deterministic precedence.

---

## ADMEXP-2026-019 — Admin-to-App Experience E2E / permission / rollback suite [P0]

**Recommended tests**
- `frontend/e2e/admin-experience-flow.spec.ts`
- `frontend/e2e/admin-experience-rbac.spec.ts`
- `frontend/e2e/admin-experience-rollback.spec.ts`
- `backend/experience-service/internal/service/admin_experience_e2e_test.go`

**Mandatory scenarios**
- [ ] Marketing editor creates banner draft → preview → submits approval → publisher publishes → eligible app fetches revision → banner renders.
- [ ] Reorder Home Layout through Admin → publish → app changes order without binary release.
- [ ] Schedule campaign for future time → not visible before start → visible in correct timezone → disappears/expires correctly.
- [ ] City-targeted campaign appears in matching city and not in non-matching city.
- [ ] Old app version safely skips unsupported component while newer version renders it.
- [ ] Invalid deep link/asset/schema blocks publish with field-level Admin error.
- [ ] Unauthorized role cannot publish/rollback/kill-switch even by calling endpoint directly.
- [ ] Two admins editing same draft produces explicit conflict rather than lost update.
- [ ] Canary revision affects only assigned cohort/percentage.
- [ ] Rollback from Admin restores last-known-good manifest and clients recover.
- [ ] `new_order_gate` prevents new order entry but active order/tracking/support remains accessible.
- [ ] Promo banner can be published while pricing backend still rejects user who is financially ineligible.

---

## ADMEXP-2026-020 — GUI-only operational acceptance gate [P0 release gate]

> Task ini dianggap selesai hanya jika operator non-engineer dapat menjalankan seluruh routine runtime experience operation dari Admin Web end-to-end. Keberadaan API saja **tidak memenuhi acceptance**.

**Must be executable from Admin GUI without Postman/SQL/code/rebuild**
- [ ] Replace hero/header banner.
- [ ] Change localized banner copy and CTA.
- [ ] Reorder supported home sections.
- [ ] Add/remove supported promo/info component from Home.
- [ ] Launch/schedule/pause campaign intro after native splash.
- [ ] Target campaign by market/city/locale/app version/cohort.
- [ ] Change existing service badge/subtitle/order.
- [ ] Marketing-hide an existing service entry.
- [ ] Execute authorized `new_order_gate`/provider kill switch with explicit blast-radius warning.
- [ ] Start 1%/5%/25%/100% staged rollout.
- [ ] Configure soft-update/minimum-version policy according to permission.
- [ ] Upload/select/version campaign assets.
- [ ] Select/test typed deep link.
- [ ] Preview exact market/surface/app-version candidate.
- [ ] Submit for approval and approve/reject according to RBAC.
- [ ] Publish/schedule production revision.
- [ ] Inspect revision diff and audit log.
- [ ] Roll back to last-known-good revision.
- [ ] See release health/analytics by revision.

**Final acceptance**
- [ ] Product/Marketing/Ops runbook documents the click path for every operation above.
- [ ] A staging drill is recorded where a non-engineer performs banner change → targeted publish → app verification → rollback without engineering intervention.
- [ ] No required routine Experience operation depends on manually editing server JSON/config/env.
- [ ] Any action that still requires an app update is explicitly labeled in Admin as `Requires App Release` rather than presented as a broken remote-config option.

---

# ADMIN EXPERIENCE IMPLEMENTATION ORDER

1. `ADMEXP-2026-001/002/003` — navigation, RBAC and Admin API contract first.
2. `ADMEXP-2026-018` — inventory/migrate existing Banners, Promos and FeatureFlags so no duplicate source of truth is created.
3. `ADMEXP-2026-004/005/006/007` — overview, Home Layout, banner/promo and campaign-intro editors.
4. `ADMEXP-2026-008/009` — service visibility, kill switches, targeting and scheduling.
5. `ADMEXP-2026-010/011/012/013` — assets, deep links, safe tokens and version policy.
6. `ADMEXP-2026-014/015/016` — real preview, approval/canary/publish/rollback and revision diff/audit.
7. `ADMEXP-2026-017` — experience health/analytics/rollback guardrails.
8. `ADMEXP-2026-019/020` — Admin-to-App E2E plus GUI-only operational release gate.

# ADMIN EXPERIENCE GUARDRAILS

- Admin GUI is the operational surface; Experience Service API is the authoritative control-plane backend.
- Existing `Banners`, `Promos`, and `FeatureFlags` must be integrated/migrated, not blindly duplicated.
- Admin may compose only component types shipped in supported app binaries.
- Admin may change presentation/exposure; it cannot directly rewrite price, ledger, payment, refund, order state or authorization truth.
- `marketing_hide` is not equal to `new_order_gate`; kill-switch semantics must be explicit in UI and backend.
- Active transaction recovery must survive any discovery/marketing kill switch.
- Every production mutation has RBAC, validation, audit, revision and rollback semantics.
- High-blast-radius/global change uses maker-checker approval and staged rollout where appropriate.
- Preview must use production-equivalent manifest resolver/schema rules, not a fake visual mock disconnected from runtime behavior.
- Routine runtime experience operations are not considered production-ready until a non-engineer can execute them through Admin Web without engineering-only tools.

---

# PART S — CUSTOMER WEB + ADMIN WEB THEME, ICONOGRAPHY & WCAG 2.1 AA

> **Target:** Customer Web dan Admin Dashboard harus mempunyai visual system yang konsisten, profesional, scalable untuk global market, mendukung `Light`, `Dark`, dan `System` theme, serta memenuhi **WCAG 2.1 Level AA** pada seluruh state penting. Accessibility bukan kosmetik dan bukan final-polish-only; token, component, icon, form, chart, map, modal, campaign content, dan dynamic App Experience semuanya harus tunduk pada contract ini.
>
> **Style decision:** Customer Web menggunakan **Modern Marketplace / Calm Utility UI**: warm-neutral surfaces, green brand sebagai primary action, orange sebagai accent terbatas, medium information density, soft elevation, rounded but not playful, dan glass/transparency hanya untuk decorative/marketing surface yang contrast-nya dapat dijamin. Admin menggunakan **Modern Enterprise Operations Console**: solid surfaces, compact-but-readable density, hierarchy kuat, minimal decorative gradients/glass, tables/forms/status lebih dominan daripada decoration.

## S0 — Audited baseline / known visual risks

**Customer Web**
- `frontend/src/app/globals.css` sudah mempunyai semantic-ish `:root` dan `.dark` tokens serta focus/reduced-motion baseline.
- `frontend/src/app/layout.tsx` masih memaksa `<html className="dark ...">`, sehingga Light/System belum menjadi runtime mode yang benar.
- Existing palette perlu diuji ulang sebagai pasangan, bukan menilai warna satu per satu. Approximate audit menunjukkan beberapa kombinasi berisiko/borderline: orange `#F97316` dengan white text sekitar `2.8:1`; orange focus ring di atas light background sekitar `2.6:1`; light muted text `#6B756F` pada `#F7F8F7` sekitar `4.48:1`; beberapa border/input colors terhadap background hanya sekitar `1.1–1.5:1`.

**Admin Dashboard**
- `admin-dashboard/src/index.css` mendefinisikan `:root/.dark`, tetapi `body` masih hardcoded dark (`#0B120E/#F4F7F5`).
- `admin-dashboard/src/components/DashboardLayout.tsx` dan banyak existing page/component menggunakan hardcoded `bg-zinc-*`, `text-zinc-*`, `bg-white/5`, dll.; Light Mode tidak boleh ditambahkan hanya dengan toggle class tanpa refactor semantic tokens.
- Existing `glass-card` Admin adalah dark-only utility dan tidak cocok menjadi default container untuk data-dense operations.

**Icon baseline**
- Customer Web dan Admin sudah memakai `lucide-react`; jadikan Lucide sebagai **single default functional icon family** agar tidak menambah icon pack kedua tanpa alasan.

- [ ] Re-measure seluruh token pair dengan WCAG contrast calculator/script saat implementasi; angka approximate di atas hanya audit clue dan bukan substitute untuk automated + manual verification.
- [ ] Existing good baseline seperti `:focus-visible` dan `prefers-reduced-motion` dipertahankan/hardened, bukan dihapus saat theme refactor.

---

## VISUAL-2026-001 — Lock visual language per surface [P0/P1]

**Recommended docs**
- `docs/design/web-ui-system-2026.md`
- `docs/design/customer-web-style-guide.md`
- `docs/design/admin-operations-style-guide.md`

**Customer Web — required style**
- clean marketplace / calm utility
- primary brand green; accent orange only for emphasis/promo, not default body text
- mostly solid `background/surface/card` hierarchy
- soft shadows/elevation only when it communicates layering
- border radius generally 8–12 px family; avoid random radius per page
- medium density with generous transactional form spacing
- one obvious primary CTA per decision step
- limited gradients; never use gradient text for essential information
- glassmorphism only for non-critical hero/marketing areas with guaranteed contrast layer

**Admin — required style**
- enterprise operations console
- solid background/surface hierarchy; dense data without visual noise
- tables/cards/forms use clear borders/surface elevation rather than transparent glass as primary separation
- status chips, icons and text have semantic hierarchy
- destructive/high-risk actions visually separated from ordinary primary action
- charts/maps support operations but do not dominate workflow
- no decorative gradient behind dense table/form content

**Checklist**
- [ ] Customer and Admin share brand language but do not force identical density/layout.
- [ ] Critical transactional/operational content remains readable without blur/transparency support.
- [ ] Decorative style never overrides accessibility or information hierarchy.
- [ ] Define reference screenshots/components for both Light and Dark before migrating pages.

---

## VISUAL-2026-002 — Semantic color/token contract for both Light and Dark [P0]

**Files to edit**
- `frontend/src/app/globals.css`
- `admin-dashboard/src/index.css`
- component files containing repeated hardcoded theme colors

**Recommended new/shared docs/files**
- `docs/design/color-token-contract.md`
- `frontend/src/lib/themeTokens.ts` only if runtime TS access is needed
- `admin-dashboard/src/lib/themeTokens.ts` only if runtime TS access is needed
- `scripts/a11y/check-color-tokens.mjs`

**Required semantic token families**
- `background`
- `surface`
- `surface-raised`
- `surface-subtle`
- `foreground`
- `foreground-secondary`
- `foreground-muted`
- `border`
- `border-strong`
- `input-background`
- `input-border`
- `focus-ring`
- `primary` + `on-primary`
- `accent` + `on-accent`
- `success` + `on-success` + `success-surface`
- `warning` + `on-warning` + `warning-surface`
- `error` + `on-error` + `error-surface`
- `info` + `on-info` + `info-surface`
- `selection`
- `overlay/scrim`

**Checklist**
- [ ] Every semantic token has Light and Dark value with documented intended use.
- [ ] `on-*` token chosen from contrast result, not assumption that white text always works.
- [ ] Components consume semantic tokens; forbid raw `#hex`, `text-zinc-*`, `bg-zinc-*`, `text-white`, `bg-black` for ordinary themed surfaces except documented special cases.
- [ ] Brand colors may remain fixed but their foreground/surface pairing changes if required for AA.
- [ ] Borders required to identify controls/components meet non-text contrast; decorative separators may be lower only when not necessary to perceive the control.
- [ ] Token checker fails CI for registered invalid contrast pairs.

---

## VISUAL-2026-003 — Customer Web Light / Dark / System theme architecture [P0]

**Files to edit**
- `frontend/src/app/layout.tsx`
- `frontend/src/app/globals.css`
- Customer Web header/profile/settings/navigation component containing theme control

**Recommended new files**
- `frontend/src/components/providers/ThemeProvider.tsx`
- `frontend/src/components/ThemeToggle.tsx`
- `frontend/src/lib/theme.ts`
- `frontend/src/hooks/useTheme.ts`

**Checklist**
- [ ] Remove forced global `className="dark"` from root as the permanent theme decision.
- [ ] Support explicit `light`, `dark`, `system` values.
- [ ] `system` reacts to `prefers-color-scheme` changes.
- [ ] User preference persists across sessions using appropriate local persistence/cookie strategy.
- [ ] Avoid flash of incorrect theme before hydration; theme bootstrap runs early and safely.
- [ ] SSR/client hydration does not produce persistent mismatch warning.
- [ ] Theme toggle has accessible name/state and keyboard support.
- [ ] If remote config provides market default theme, explicit user preference wins unless there is a documented product reason otherwise.

---

## VISUAL-2026-004 — Admin Dashboard true Light / Dark / System mode [P0]

**Files to edit**
- `admin-dashboard/src/index.css`
- `admin-dashboard/src/App.tsx`
- `admin-dashboard/src/components/DashboardLayout.tsx`
- every page/component using hardcoded dark zinc/white surfaces in supported routes

**Recommended new files**
- `admin-dashboard/src/providers/ThemeProvider.tsx`
- `admin-dashboard/src/components/ThemeToggle.tsx`
- `admin-dashboard/src/lib/theme.ts`
- `admin-dashboard/src/hooks/useTheme.ts`

**Checklist**
- [ ] Remove hardcoded dark `body` background/text and replace with semantic theme tokens.
- [ ] Refactor sidebar/header/cards/tables/modals/toasts/forms to semantic tokens before claiming Light Mode support.
- [ ] Support `light`, `dark`, `system`; persist admin preference.
- [ ] Sidebar selected/hover/focus state readable in both themes.
- [ ] Dense table rows, sticky headers, pagination, filters and dropdowns work in both themes.
- [ ] Existing `glass-card` is no longer default operational card; use solid surface card for data-dense views.
- [ ] Theme switching does not reset form state, filters, route or in-progress Admin Experience draft.

---

## A11Y-2026-001 — WCAG 2.1 AA contrast contract [P0 release gate]

**Required minimums**
- normal text: contrast ratio **≥ 4.5:1** against effective background
- large text: contrast ratio **≥ 3:1**
- meaningful UI component boundaries/states and essential graphical objects/icons: **≥ 3:1** against adjacent colors where WCAG 1.4.11 applies
- focus indicator must be clearly visible; target **≥ 3:1** against adjacent surface as the internal design standard while also satisfying Focus Visible behavior

**Checklist**
- [ ] Validate final composited/effective color, including opacity, overlays, blur and image backgrounds.
- [ ] Test default, hover, active, selected, focus, disabled, loading, error and success states.
- [ ] Do not place white text on brand orange merely because it looks common; use measured `on-accent` token.
- [ ] Muted/secondary text still meets text contrast when it conveys required information.
- [ ] Placeholder is not used as the only label; placeholder readability does not replace persistent label requirement.
- [ ] Required input outline/background/control boundary is perceptible at ≥3:1 when the boundary is necessary to identify the control.
- [ ] Contrast validation covers Light and Dark independently; passing one theme does not approve the other.

---

## A11Y-2026-002 — Color must never be the only information channel [P0]

**Checklist**
- [ ] Success/warning/error/info use icon + text/label + color, not color alone.
- [ ] Order/payment/provider statuses use readable label and optionally icon; green/red badge alone is insufficient.
- [ ] Charts provide legend/label/pattern/shape or direct values so series are distinguishable without color perception alone.
- [ ] Form errors include text and field relationship, not only red border.
- [ ] Selected navigation/tab/row uses position/indicator/icon/text weight or other non-color cue.
- [ ] Links inside body text are identifiable by more than a subtle hue difference; provide underline or equivalent non-color affordance at least in relevant states.

---

## A11Y-2026-003 — Typography, readable hierarchy and text-spacing resilience [P0/P1]

**Files to edit**
- shared typography styles/components Customer Web and Admin
- page headings/forms/tables with arbitrary font sizes

**Checklist**
- [ ] Keep Inter/system sans baseline unless brand typography intentionally changes globally.
- [ ] Define tokens for display/page title/section title/body/body-small/label/caption/table-cell.
- [ ] Essential body/label text is not made tiny merely to fit dense Admin layouts.
- [ ] Font weight hierarchy remains readable in both themes; do not depend on low-contrast gray for hierarchy alone.
- [ ] Layout survives WCAG text-spacing overrides without clipping/overlap/loss of content.
- [ ] Do not use uppercase + extreme tracking for long operational labels.
- [ ] Truncated content has accessible/full-content path where information is required.

---

## ICON-2026-001 — One functional icon system: Lucide [P0/P1]

**Current dependency to retain**
- `lucide-react` in Customer Web
- `lucide-react` in Admin Dashboard

**Recommended docs/files**
- `docs/design/iconography-2026.md`
- `frontend/src/components/icons/AppIcon.tsx`
- `admin-dashboard/src/components/icons/AppIcon.tsx`

**Icon style contract**
- default family: Lucide outline icons
- typical inline icon: 16–18 px
- nav/action icon: 18–20 px
- service/section icon: 22–24 px
- empty-state/decorative icon may be larger but must not look like a primary button
- consistent stroke width approximately 1.75–2 unless icon-specific optical correction is documented

**Checklist**
- [ ] Do not mix Lucide line icon, filled Material icon, emoji and random SVG styles in one functional navigation system.
- [ ] Decorative icon uses `aria-hidden="true"` when adjacent text already provides the name.
- [ ] Icon-only button has accessible name (`aria-label`/equivalent) and visible tooltip where useful.
- [ ] Essential meaning is not encoded only in icon shape; critical/destructive actions have visible label in high-risk contexts.
- [ ] Custom SVG allowed only where Lucide lacks adequate service meaning; normalize viewBox/stroke/optical size and document it.
- [ ] Icons inherit semantic foreground/status tokens rather than hardcoded colors.

---

## ICON-2026-002 — Customer Web service icon mapping [P1]

**Recommended default functional mapping**
- `Paket Instan` → `Package`
- `Food` → `UtensilsCrossed`
- `Tambal Ban` → `Wrench` or approved custom tire-service SVG if distinction is insufficient
- `Ekspedisi Antar-Kota` → `Truck`
- `Towing` → `CarFront` or approved custom towing SVG; always keep visible `Towing` label so it cannot be confused with generic car service

**Common actions**
- location → `MapPin`
- tracking/route → `Navigation`
- history → `History`
- payment → `WalletCards`/`CreditCard` based on available library icon
- receipt → `ReceiptText`/`Receipt`
- support → `CircleHelp`
- notification → `Bell`
- search → `Search`
- settings → `Settings`
- security/proof → `ShieldCheck`

**Checklist**
- [ ] Service icon semantics consistent across dashboard, order creation, history/detail and empty states.
- [ ] Do not reuse same generic truck icon for both Aggregator and Towing if surrounding context cannot distinguish them.
- [ ] Marketing 3D/illustration assets may exist in hero/service campaign cards, but transactional navigation retains accessible functional icon + text.

---

## ICON-2026-003 — Admin navigation/action icon mapping [P1]

**Use existing Lucide vocabulary where already present**
- Dashboard → `LayoutDashboard`
- Orders → `Package`
- Couriers → `Truck` or current approved courier icon
- Merchants → `Store`
- Customers → `Users`
- Finance/Payout → `DollarSign`/`Receipt` according to context
- Pricing/Promo → `BadgePercent`
- Marketing/Broadcast → `Megaphone`
- Analytics → `BarChart3`
- Risk/Safety → `ShieldAlert`
- Audit → `History`
- Maps/Zones → `Map`
- Settings → `Settings`
- App Experience → `Layers` or one approved single Lucide icon used consistently

**Checklist**
- [ ] One concept has one canonical icon throughout sidebar, page title and actions unless context materially changes meaning.
- [ ] Avoid multiple near-identical icons for destructive actions; delete/cancel/block must be semantically explicit with labels/confirmation.
- [ ] Table row action icons expose accessible names and keyboard focus.
- [ ] Collapsed sidebar provides tooltip/accessibility name for every icon.

---

## A11Y-2026-004 — Keyboard, focus, forms and semantic controls [P0]

**Checklist**
- [ ] Entire Customer Web and Admin primary workflows operable keyboard-only per WCAG 2.1.1.
- [ ] Focus order follows visual/logical reading order.
- [ ] Focus is never removed without an accessible replacement; retain explicit `:focus-visible` system.
- [ ] Modal traps focus while open and returns focus to invoking control on close.
- [ ] Dropdown/menu/select is keyboard navigable and dismissible.
- [ ] All inputs have programmatic + visible label; required/optional semantics clear.
- [ ] Error message associated to field with `aria-describedby`/equivalent where appropriate.
- [ ] Checkbox/radio/switch expose name, role, state and disabled state correctly.
- [ ] Icon-only controls have accessible name.
- [ ] Skip-to-content or equivalent exists for long Customer/Admin shell navigation where appropriate.

---

## A11Y-2026-005 — Status, alerts, toasts and destructive workflows [P0]

**Checklist**
- [ ] Toast does not disappear before essential action/message can be perceived; critical error also persists in page context when needed.
- [ ] Async success/error announcements use suitable live-region semantics without flooding screen readers.
- [ ] Destructive Admin actions show icon + verb + target + impact; color alone is not confirmation.
- [ ] `marketing_hide`, `new_order_gate`, `provider_gate`, `checkout_gate` remain visually/verbally distinct in both themes.
- [ ] Warning/error text meets contrast even on tinted semantic surfaces.
- [ ] Disabled state is visually distinct from enabled while preserving enough readability for context; do not use opacity so low that labels effectively disappear.

---

## A11Y-2026-006 — Tables, charts, maps and dense Admin data [P0/P1]

**Tables**
- [ ] Header/cell semantics are correct; sortable columns expose sort state.
- [ ] Row hover/selection/focus states are distinguishable in both themes without color alone.
- [ ] Sticky header/background does not become transparent over scrolling text.
- [ ] Horizontal overflow has deliberate responsive strategy; essential actions remain reachable.

**Charts**
- [ ] Chart colors pass applicable non-text contrast against background where needed.
- [ ] Meaning is available through legend/direct label/value/table/accessible summary, not color alone.
- [ ] Tooltip is keyboard/accessibility reachable or equivalent data representation exists.

**Maps**
- [ ] Map controls, zoom buttons, markers and overlays remain visible in both themes.
- [ ] Operational state is also available outside the map when map color/style alone would hide information.
- [ ] Provider/map basemap dark mode does not reduce overlay label contrast below usable level.

---

## A11Y-2026-007 — Images, banners, glass surfaces and text-over-media [P0]

**Checklist**
- [ ] Text over banner/image/animation uses deterministic solid/scrim/gradient overlay whose final contrast is validated at worst-case image area.
- [ ] Do not approve text-over-image by checking only one sample asset; CMS preview/validator must account for configured text surface.
- [ ] Critical transactional copy is not placed directly on arbitrary campaign art.
- [ ] Glass/translucent cards are prohibited for dense/critical content unless effective background contrast remains guaranteed.
- [ ] Informative images have meaningful alt text; decorative images use empty alt/aria-hidden as appropriate.
- [ ] Animation/campaign content honors reduced-motion strategy and has static fallback when needed.

---

## A11Y-2026-008 — Responsive reflow, zoom and viewport resilience [P0]

**Checklist**
- [ ] Customer Web critical flows work at narrow mobile viewport and desktop without loss of content/action.
- [ ] Admin provides deliberate compact/mobile fallback for critical emergency/approval tasks even if full desktop is preferred.
- [ ] Verify WCAG 1.4.10 reflow behavior at equivalent 320 CSS px width where applicable; no mandatory two-dimensional scrolling except content that inherently requires it such as maps/data tables with accessible alternative strategy.
- [ ] Verify browser zoom to 200% without clipped modal, hidden CTA, overlapping labels or inaccessible sticky elements.
- [ ] Text wrapping/localized long strings do not break icon/button alignment.

---

## A11Y-2026-009 — Theme-aware shared component acceptance matrix [P0]

**Components to test in both Light and Dark**
- buttons: primary/secondary/ghost/destructive/icon-only
- links
- inputs/textareas/selects/date inputs
- checkbox/radio/switch
- tabs
- badges/status chips
- cards
- tables
- pagination
- dropdown/popover
- modal/drawer
- tooltip
- toast/alert
- breadcrumb
- sidebar/navbar
- search/filter bar
- empty/loading/error states
- skeletons
- charts/maps
- dynamic campaign/home components

**States**
- default
- hover
- active/pressed
- selected/current
- focus-visible
- disabled
- loading
- error
- success

- [ ] No component is considered migrated until the matrix is green for both themes.

---

## A11Y-2026-010 — App Experience / CMS accessibility guardrails [P0]

**Files to integrate**
- `admin-dashboard/src/components/experience/ExperiencePreview.tsx`
- `admin-dashboard/src/components/experience/BannerEditor.tsx`
- `admin-dashboard/src/components/experience/DesignTokenEditor.tsx`
- `backend/experience-service/` validation path

**Checklist**
- [ ] Admin preview can switch candidate content between Light/Dark/System contexts.
- [ ] CMS blocks publish when configured text/on-surface combination fails registered AA contrast rule.
- [ ] Banner editor requires alt/decorative semantics and safe text surface choice.
- [ ] Runtime design-token editor cannot publish a token pair that breaks protected WCAG combinations.
- [ ] Dynamic component schema includes accessible name/heading/alt fields where applicable.
- [ ] New remote component type cannot become production-approved until accessibility contract is defined and tested.

---

## A11Y-2026-011 — Automated accessibility + contrast CI [P0]

**Recommended dependencies/tooling**
- add `@axe-core/playwright` to Customer Web test tooling
- add Playwright + `@axe-core/playwright` to Admin if no equivalent E2E accessibility runner exists
- consider `eslint-plugin-jsx-a11y` for static lint assistance; do not treat lint as full compliance

**Recommended files**
- `frontend/e2e/accessibility-theme.spec.ts`
- `frontend/e2e/visual-theme-regression.spec.ts`
- `admin-dashboard/playwright.config.ts` if absent
- `admin-dashboard/e2e/accessibility-theme.spec.ts`
- `admin-dashboard/e2e/visual-theme-regression.spec.ts`
- `scripts/a11y/check-color-tokens.mjs`
- `docs/accessibility/wcag-2.1-aa-web-checklist.md`
- `docs/accessibility/manual-audit-matrix.md`

**Checklist**
- [ ] Automated scan covers representative authenticated/unauthenticated Customer routes and all high-risk Admin route groups.
- [ ] Run scans in Light and Dark, plus System resolved to both variants in test.
- [ ] CI fails on configured serious/critical automated accessibility regressions.
- [ ] Color-token test computes ratios rather than relying on visual review.
- [ ] Visual regression screenshots catch accidental white-on-white, black-on-black, dark-only component and transparent table regressions.
- [ ] Automated tooling is explicitly documented as incomplete; manual keyboard/screen-reader/zoom/contrast review remains release requirement.

---

## A11Y-2026-012 — Route/state inventory and manual WCAG 2.1 AA audit [P0 release gate]

**Customer Web minimum route groups**
- landing/public
- auth
- customer dashboard
- Paket On-Demand create/review/payment
- Aggregator create/compare/review/payment
- order history/detail
- resi/tracking/public tracking
- payment link/pay result
- error/empty/offline states

**Admin minimum route groups**
- login/dashboard
- orders/exceptions
- couriers/merchants/customers
- finance/tax/pricing/reconciliation
- logistics/maps/zones
- marketing/promos/banners/broadcasts
- risk/safety/audit/settings
- all new `App Experience` routes/editors/preview/approval/rollback

**Checklist for every representative route**
- [ ] Light screenshot/manual review.
- [ ] Dark screenshot/manual review.
- [ ] Keyboard-only completion of primary action.
- [ ] Visible focus through entire path.
- [ ] Contrast check for text/icons/controls/status.
- [ ] Empty/loading/error/success state checked.
- [ ] Modal/dropdown/toast checked where applicable.
- [ ] 200% zoom checked.
- [ ] Responsive/mobile or compact viewport checked where surface supports it.
- [ ] Dynamic campaign/content variant checked if route can render remote content.

---

## A11Y-2026-013 — WCAG 2.1 AA semantic/assistive technology checklist [P0]

**Key criteria to explicitly account for in implementation/review**
- 1.3.1 Info and Relationships
- 1.4.1 Use of Color
- 1.4.3 Contrast (Minimum)
- 1.4.10 Reflow
- 1.4.11 Non-text Contrast
- 1.4.12 Text Spacing
- 2.1.1 Keyboard
- 2.4.3 Focus Order
- 2.4.6 Headings and Labels
- 2.4.7 Focus Visible
- 2.5.3 Label in Name
- 3.3.1 Error Identification
- 3.3.2 Labels or Instructions
- 4.1.2 Name, Role, Value
- 4.1.3 Status Messages

- [ ] Use native semantic HTML/control first before custom ARIA recreation.
- [ ] Heading hierarchy is meaningful; do not choose heading level for font size.
- [ ] Landmarks/navigation/main regions are identifiable.
- [ ] Accessible name of visible-label controls contains/matches visible label intent.
- [ ] Status messages can be perceived without forcing focus jump.

---

## VISUAL-2026-005 — Hardcoded-color eradication and theme-safe lint/review policy [P0]

**Scope**
- `frontend/src/`
- `admin-dashboard/src/`

**Checklist**
- [ ] Inventory raw hex/rgb/hsl and Tailwind palette utility usage in components.
- [ ] Convert ordinary themed surface/text/border colors to semantic tokens.
- [ ] Maintain small documented allowlist for brand artwork, carrier logos, map-provider styles, data visualization series and genuinely fixed external-brand colors.
- [ ] New PR review rejects unexplained `text-white`, `bg-black`, `text-zinc-*`, `bg-zinc-*` on ordinary application components.
- [ ] Add lint/script/check if practical to flag prohibited theme-hardcoded classes outside allowlisted files.

---

# WEB VISUAL / ACCESSIBILITY IMPLEMENTATION ORDER

1. `VISUAL-2026-001/002` — lock style language and semantic token contract.
2. `A11Y-2026-001` + token contrast script — fix palette pairings before mass component migration.
3. `VISUAL-2026-003/004` — implement real Customer/Admin Light/Dark/System foundation and remove forced/hardcoded dark mode.
4. `ICON-2026-001/002/003` — standardize Lucide icon family and service/admin mappings.
5. `A11Y-2026-004/005/009` — shared interactive components, focus, forms, status states.
6. `A11Y-2026-006/007/008` — tables/charts/maps/media/reflow.
7. `A11Y-2026-010` — integrate accessibility validation into App Experience CMS/runtime config.
8. `VISUAL-2026-005` — remove remaining hardcoded application colors with documented exceptions.
9. `A11Y-2026-011/012/013` — automated CI + full manual route/state WCAG 2.1 AA gate.

# WEB VISUAL / ACCESSIBILITY FINAL ACCEPTANCE

- [ ] Customer Web supports Light, Dark and System without forced theme and without theme flash that harms usability.
- [ ] Admin supports Light, Dark and System; no dark-only page/component remains in supported route inventory.
- [ ] Text/background/icon/control pairs satisfy applicable WCAG 2.1 AA contrast rules in both themes.
- [ ] No required information depends on color alone.
- [ ] Functional icon system is consistently Lucide plus documented custom service exceptions only.
- [ ] Customer service icons are semantically distinct and always accompanied by labels where ambiguity is possible.
- [ ] Admin navigation/actions remain understandable when sidebar is expanded or collapsed.
- [ ] Keyboard-only primary workflows are viable on both Customer and Admin.
- [ ] Remote banner/theme/token publication cannot introduce a protected contrast failure without being blocked by validation.
- [ ] Automated accessibility checks and visual theme regression run in CI.
- [ ] Manual WCAG 2.1 AA audit matrix for key routes/states is signed off before production release.

---

# PART T — LANCAR DESIGN SYSTEM + COMMERCE ADS PLATFORM

> **Goal:** LANCAR harus mempunyai design system dan monetization platform milik sendiri. Benchmark seperti Grab/Gojek/Uber dipakai untuk memahami pola operasional, bukan untuk menyalin proprietary UI, naming, layout, atau internal component vocabulary. Seluruh Customer, Food, Paket, Tambal Ban, Towing, Ekspedisi, Merchant, Courier, Customer Web, dan Admin harus berbagi foundations yang sama, lalu memakai service-specific patterns sesuai kebutuhan domain.
>
> **Figma reference:** `LANCAR Design System 2026 — Super App + Commerce Ads` — `https://www.figma.com/design/9JTlREMJNVkLYchQD1QcpV`. Figma adalah design source/reference; production truth tetap component/token contract yang versioned dan diuji di code.
>
> **Ads boundary:** `LANCAR Platform Promo ≠ Merchant Promo ≠ Sponsored Advertising ≠ Organic Ranking`. Paid visibility tidak boleh mengubah rating, ETA, serviceability, availability, delivery fee, financial eligibility, atau fakta organik lain.

## T0 — Audited baseline / existing assets to preserve and harden

Customer Android sudah memiliki fondasi theme/design primitives:
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/theme/Color.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/theme/Theme.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/theme/TembusDesign.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/theme/TembusElevation.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/theme/Type.kt`

Known cleanup:
- `DashboardScreen.kt` masih mempunyai benchmark-leaking names seperti `GojekTopBar`/`GojekServiceGrid`.
- `FoodHomeScreen.kt` masih mempunyai per-screen styling/fallback termasuk emoji fallback; ini harus dipindahkan ke approved design-system components/assets.
- Merchant Android sudah mempunyai domain **Promo** di `ui/screens/promo`; Ads tidak boleh dibangun sebagai alias/toggle tambahan pada Merchant Promo.
- `FOOD-2026-023` tetap valid sebagai Food integration point, tetapi implementasi lengkap sponsored placement mengikuti `ADS-2026-*` di Part T ini.

- [ ] Pertahankan existing WCAG-aware color/theme work yang benar; jangan rewrite hanya untuk mengganti nama.
- [ ] Inventory component/theme duplicates sebelum membuat primitives baru.
- [ ] Rename benchmark-specific internal component/function names menjadi LANCAR vocabulary tanpa mengubah behavior secara buta.
- [ ] Jangan menjadikan emoji/random SVG sebagai production functional design language; gunakan approved icon/placeholder/illustration contract.

---

## DS-2026-001 — Establish LANCAR Design System as one governed product [P0]

**Recommended docs**
- `docs/design/lancar-design-system-2026.md`
- `docs/design/design-system-governance.md`
- `docs/design/component-lifecycle.md`
- `docs/design/service-patterns.md`

**Surfaces in scope**
- Customer Android
- Customer Web
- Merchant Android
- Courier Android
- Admin Dashboard

**Required layers**
1. Foundations
2. Semantic tokens
3. Core components
4. Commerce components
5. Logistics components
6. Emergency/service components
7. Super-App patterns
8. Service-specific patterns
9. Monetization/Sponsored patterns
10. Accessibility and content rules

**Checklist**
- [ ] Satu design-system version/release note menjelaskan breaking/deprecated component changes.
- [ ] Component memiliki owner, status `experimental|stable|deprecated`, supported surfaces, accessibility contract dan code mapping.
- [ ] Feature team tidak membuat “mini design system” sendiri di Food/Towing/Tambal.
- [ ] Service-specific pattern boleh berbeda journey/density, tetapi foundations/component semantics tetap LANCAR.
- [ ] Design system review menjadi gate untuk component type baru yang akan dipakai remote App Experience.

---

## DS-2026-002 — Canonical semantic tokens across Figma + Android + Web + Admin [P0]

**Files to edit**
- Customer Android files under `android-app-customer/.../ui/theme/`
- equivalent Merchant/Courier theme files after inventory
- `frontend/src/app/globals.css`
- `admin-dashboard/src/index.css`

**Recommended new files**
- `design-tokens/lancar.tokens.json`
- `scripts/design/export-design-tokens.mjs`
- `scripts/design/validate-design-tokens.mjs`
- `docs/design/token-naming.md`

**Token families**
- color semantic roles
- spacing
- radius
- typography
- elevation
- motion duration/easing
- size/touch target
- icon sizes
- content width/grid
- scrim/overlay

**Checklist**
- [ ] Token names describe role, not raw color, e.g. `color.action.primary`, `color.text.secondary`, `surface.raised`.
- [ ] Light/Dark/System values map from one semantic contract.
- [ ] Android/Web/Admin generated or manually synced values are testable against canonical token source.
- [ ] Figma token naming maps one-to-one or through documented transform to code tokens.
- [ ] Token validation includes WCAG protected pairs from Part S.
- [ ] No service invents a new “primary green/orange” without design-system approval.

---

## DS-2026-003 — Core component library + state matrix [P0]

**Customer Android recommended package**
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/designsystem/`
- `.../components/LancarButton.kt`
- `.../components/LancarIconButton.kt`
- `.../components/LancarSearchField.kt`
- `.../components/LancarTextField.kt`
- `.../components/LancarChip.kt`
- `.../components/LancarCard.kt`
- `.../components/LancarBadge.kt`
- `.../components/LancarAppBar.kt`
- `.../components/LancarBottomNavigation.kt`
- `.../components/LancarModal.kt`
- `.../components/LancarToast.kt`
- `.../components/LancarSkeleton.kt`
- `.../components/LancarEmptyState.kt`

**Web equivalents**
- `frontend/src/components/design-system/`
- `admin-dashboard/src/components/design-system/` for shared concepts with Admin-specific density variants

**Mandatory states**
- default
- pressed/active
- hover where applicable
- focused
- selected
- disabled
- loading
- success
- warning
- error

- [ ] Every reusable component has Light/Dark and accessibility acceptance.
- [ ] 48dp/appropriate platform touch-target baseline for primary mobile controls.
- [ ] Component API uses semantic props (`variant`, `state`, `size`) rather than arbitrary color parameters.
- [ ] Component does not expose raw styling hooks that let product screens bypass protected design/accessibility constraints without documented escape hatch.

---

## DS-2026-004 — Commerce + marketplace component family [P1]

**Recommended Customer Android components**
- `.../designsystem/commerce/MerchantCard.kt`
- `.../designsystem/commerce/MenuItemCard.kt`
- `.../designsystem/commerce/PromoCard.kt`
- `.../designsystem/commerce/SponsoredMerchantCard.kt`
- `.../designsystem/commerce/RatingSummary.kt`
- `.../designsystem/commerce/EtaDistanceRow.kt`
- `.../designsystem/commerce/PriceSummary.kt`
- `.../designsystem/commerce/VoucherChip.kt`
- `.../designsystem/commerce/CartBar.kt`
- `.../designsystem/commerce/SponsoredLabel.kt`

**Checklist**
- [ ] Organic `MerchantCard` dan Sponsored variant berbagi content anatomy; Sponsored selalu menambahkan disclosure yang tidak bisa dimatikan oleh merchant creative.
- [ ] Rating, distance, ETA, open/closed, halal, delivery fee berasal dari authoritative/source-defined data, bukan ad payload.
- [ ] Promo discount badge tidak berarti sponsored dan Sponsored label tidak berarti merchant sedang memberi discount.
- [ ] Image aspect, text truncation, fallback image, favorite button dan accessibility semantics distandarkan.

---

## DS-2026-005 — Logistics + emergency component family [P1]

**Recommended components**
- `AddressCard`
- `RouteSummary`
- `PackageSummary`
- `CourierCard`
- `CarrierRateCard`
- `TrackingTimeline`
- `ProofCard`
- `QuoteBreakdown`
- `VehicleCard`
- `TechnicianCard`
- `IncidentSummary`
- `RequoteApprovalCard`
- `SafetyNotice`

**Checklist**
- [ ] Paket/Aggregator/Tambal/Towing reuse primitives where semantics match.
- [ ] Emergency components prioritize location, capability, ETA, price trust and action over promotional decoration.
- [ ] Carrier comparison preserves provider truth and is not silently influenced by merchant/commerce Ads Service.
- [ ] Proof/requote/safety components have high-contrast and explicit state/action semantics.

---

## DS-2026-006 — Super-App surface composition standard [P0/P1]

**Files to edit**
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/main/DashboardScreen.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/components/ServiceGridMenu.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/components/ServiceIcons.kt`
- runtime Experience components from `APP-2026-*`

**Canonical Home information hierarchy**
1. identity/context + universal search
2. primary LANCAR service grid
3. active transaction/utility modules when applicable
4. LANCAR-owned platform campaign/promo
5. contextual discovery
6. bounded Sponsored inventory
7. organic recommendations
8. additional contextual modules
9. navigation

**Checklist**
- [ ] Home does not become a vertical Food clone; it represents all LANCAR services.
- [ ] Active-order/recovery information outranks monetization.
- [ ] Universal search understands service intent or routes to a safe service-aware result.
- [ ] `GojekTopBar`, `GojekServiceGrid` and similar benchmark-specific internal names are renamed to LANCAR design-system terminology.
- [ ] Home layout can be server-configured only through whitelisted LANCAR components from App Experience.
- [ ] Paid modules remain visually bounded by `ADS-2026-004` inventory rules.

---

## DS-2026-007 — Food discovery pattern: visual-rich but structured [P0/P1]

**Files to edit**
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/food/FoodHomeScreen.kt`
- `MerchantDetailScreen.kt`
- Food search/filter/discovery ViewModel/repository paths

**Canonical pattern**
`delivery destination → search → delivery/pickup/filter modes → cuisine/category discovery → editorial/platform promo → bounded sponsored discovery → organic personalized ranking → deal/collection modules → more organic discovery`

**Checklist**
- [ ] Food home can use richer imagery than transactional services without fragmenting core LANCAR typography/spacing/button language.
- [ ] Replace emoji fallback with design-system-approved merchant/menu placeholder asset or deterministic neutral placeholder.
- [ ] Merchant image/card anatomy uses shared commerce components.
- [ ] Sponsored slots are clearly labeled and never indistinguishable from organic ranking.
- [ ] Search/filter controls remain sticky/usable without large promotional hero blocking discovery.
- [ ] Checkout/payment/tracking surfaces return to calm transaction style and are ad-free.

---

## DS-2026-008 — Paket / Aggregator / Tambal / Towing service-pattern standard [P1]

**Pattern rules**
- Paket On-Demand: route + package facts + quote + trust.
- Aggregator: compare provider/service + provenance + carrier lifecycle clarity.
- Tambal Ban: emergency shortest path; problem + location + technician capability.
- Towing: safety + vehicle compatibility + inspection/proof + route.

**Checklist**
- [ ] One visual system, different information priority per vertical.
- [ ] Do not give every vertical a unique arbitrary header color/layout merely to “look different”.
- [ ] Service identity comes from icon, title, contextual accent/illustration and content—not a separate mini-brand.
- [ ] Tambal/Towing active booking/service flow contains zero paid advertising.
- [ ] Aggregator carrier-rate comparison contains zero paid carrier ranking unless a future separate regulated/sponsored-carrier product is explicitly designed, disclosed and approved.

---

## DS-2026-009 — Iconography, illustration and media governance for mobile super-app [P1]

**Checklist**
- [ ] Android functional icons use one approved family/style; decorative 3D/service illustrations are not used as replacements for critical action icons.
- [ ] Five primary services have distinct canonical icon + label mapping across Home, history, detail and notifications.
- [ ] Marketing campaign art can change remotely but must respect safe aspect ratios/text zones/accessibility fallback.
- [ ] Define image aspect-ratio presets for hero banner, merchant card, sponsored card, category tile, campaign intro and empty state.
- [ ] Define low-bandwidth/static fallback for animated creative.
- [ ] External merchant creative cannot upload arbitrary UI-like fake buttons, system dialogs or misleading notification treatments.

---

## DS-2026-010 — Figma library governance + design/code traceability [P1]

**Current Figma reference**
- `https://www.figma.com/design/9JTlREMJNVkLYchQD1QcpV`

**Required Figma structure**
- Foundations & Components
- Customer Super-App Patterns
- Commerce Ads & Merchant
- expand additional pages/libraries when Figma plan limits allow

**Checklist**
- [ ] Stable Figma component uses naming that maps to code component name/role.
- [ ] Variant names map to semantic code props when practical.
- [ ] Component descriptions include usage/do-not-use/accessibility notes.
- [ ] Design review links Figma node/component reference to implementation task/PR for material UI changes.
- [ ] Introduce Code Connect/component mapping only after component APIs stabilize; do not connect temporary mock components.
- [ ] Figma library is reference/source for visual intent, but cannot override server business truth or accessibility contract.

---

## DS-2026-011 — Design-system adoption / benchmark-name eradication gate [P0/P1]

**Scope**
- Customer Android first
- Customer Web second
- Merchant/Courier/Admin as each shared component stabilizes

**Checklist**
- [ ] Inventory duplicated Button/Card/Search/Chip/AppBar/Badge/Navigation patterns.
- [ ] Migrate highest-frequency screens before low-traffic settings screens.
- [ ] Replace internal names copied from competitor/benchmark with `Lancar*` or semantic domain names.
- [ ] No visual rewrite may change transaction/business behavior unless separately covered by domain task.
- [ ] Remove legacy primitive only after call sites and screenshot/accessibility regression tests pass.

---

## DS-2026-012 — Mobile design-system release gate [P0]

**Recommended tests/docs**
- Android screenshot/golden tests or equivalent for stable components
- `docs/design/mobile-component-acceptance.md`
- `docs/design/design-qa-checklist.md`

**Checklist**
- [ ] Light/Dark/System visual review for supported mobile surfaces.
- [ ] Font scale/dynamic text review.
- [ ] 48dp touch target and TalkBack semantics review.
- [ ] Loading/error/empty/offline states included, not only happy state.
- [ ] Long localization/RTL readiness tested for reusable primitives.
- [ ] Every new remote component type passes design-system + accessibility approval before App Experience allowlist publication.

---

# COMMERCE ADS PLATFORM

## ADS-2026-001 — Separate Platform Promo, Merchant Promo, Sponsored Ads and Organic Ranking [P0]

**Existing files/domains to inspect**
- `android-app-merchant/app/src/main/java/com/tembus/merchant/ui/screens/promo/CreatePromoZipScreen.kt`
- `android-app-merchant/app/src/main/java/com/tembus/merchant/ui/screens/promo/PromoViewModel.kt`
- merchant promo backend/repository/API ownership
- Admin `Promos.tsx` / `Banners.tsx`
- Food discovery/ranking code

**Domain contract**
- `platform_promo`: LANCAR-funded/owned campaign exposure.
- `merchant_promo`: merchant/customer financial offer; authoritative Promo/Pricing domain.
- `sponsored_ad`: merchant/brand pays for eligible visibility; authoritative Ads domain.
- `organic_rank`: non-paid discovery rank.

**Checklist**
- [ ] One entity may participate in promo and sponsored campaign simultaneously, but accounting/attribution remains separate.
- [ ] Organic relevance score is never overwritten with fake higher rating/ETA due to ad spend.
- [ ] Experience Service owns placement/component presentation; Ads Service owns sponsored eligibility/delivery/budget truth.
- [ ] Promo Service/Pricing owns discount financial eligibility.
- [ ] Customer payload explicitly identifies content source/type.

---

## ADS-2026-002 — Dedicated Ads Service / canonical campaign model [P0/P1]

**Recommended new service/files**
- `backend/ads-service/cmd/api/main.go`
- `backend/ads-service/internal/domain/campaign.go`
- `backend/ads-service/internal/domain/ad_group.go`
- `backend/ads-service/internal/domain/creative.go`
- `backend/ads-service/internal/domain/placement.go`
- `backend/ads-service/internal/domain/audience.go`
- `backend/ads-service/internal/domain/budget.go`
- `backend/ads-service/internal/domain/bid.go`
- `backend/ads-service/internal/domain/ad_event.go`
- `backend/ads-service/internal/service/campaign_service.go`
- `backend/ads-service/internal/service/delivery_service.go`
- `backend/ads-service/internal/service/budget_service.go`
- `backend/ads-service/internal/repository/ads_repository.go`
- `backend/ads-service/internal/handler/ads_handler.go`
- `backend/ads-service/internal/service/campaign_service_test.go`
- `database/migrations/<timestamp>_add_ads_campaigns.sql`
- `database/migrations/<timestamp>_add_ads_delivery_events.sql`
- `docs/contracts/commerce-ads-2026.md`

**Campaign must support**
- owner/merchant/brand account
- market/city/branch
- objective
- placements
- audience
- budget model
- bid strategy
- schedule/timezone/daypart
- creative
- status/lifecycle
- policy/moderation status
- campaign version
- attribution settings/version

- [ ] Ads service cannot mutate Food order state, rating, ETA or merchant availability.
- [ ] Campaign mutations are audited/idempotent where applicable.
- [ ] Campaign owner can access only their campaign/performance data.

---

## ADS-2026-003 — Merchant campaign lifecycle [P1]

**Required lifecycle**
`DRAFT → VALIDATING → REVIEW/POLICY_CHECK → SCHEDULED → ACTIVE → PAUSED → ENDED`

Additional states:
- `REJECTED`
- `BUDGET_EXHAUSTED`
- `PAYMENT_HOLD`
- `SUSPENDED`
- `ARCHIVED`

**Campaign creation flow**
1. objective
2. placement
3. eligible branch/location
4. audience
5. budget
6. bid strategy
7. schedule/daypart
8. creative
9. preview
10. review/policy
11. launch

- [ ] Draft never spends money or serves impression.
- [ ] Expired/end-time campaign cannot continue serving due to stale cache.
- [ ] Pause takes effect within documented SLA.
- [ ] Budget exhausted stops new eligible spend atomically/degraded-safe.
- [ ] Campaign edit that materially changes targeting/budget/creative creates auditable revision.

---

## ADS-2026-004 — Ad inventory, density and anti-clutter policy [P0 product guardrail]

> Angka di bawah adalah **initial LANCAR product policy**, bukan klaim bahwa semua competitor memakai angka yang sama. Nilai dapat dieksperimenkan hanya di dalam safe bounds dan tidak boleh membuat paid content mendominasi discovery.

**Initial safe rules**
- Super-App Home first viewport: maksimum **1 paid/sponsored module**.
- Tidak boleh ada dua sponsored modules berurutan di Home.
- Food discovery: organic result harus terlihat di first screen; paid/native sponsored cards tidak boleh mengambil seluruh visible result set.
- Search: paid result diberi reserved/capped positions; jangan mengisi semua posisi teratas dengan sponsored.
- Rolling discovery density default ceiling: sponsored content tidak lebih dari **25%** eligible discovery cards over a reasonable rolling window; exact window/config documented and experiment-controlled.
- Checkout/payment/order tracking/support/claim/active order: **ad-free**.
- Tambal Ban/Towing emergency booking, matching dan active service: **ad-free**.
- Aggregator carrier-rate comparison: **ad-free by default**.

**Recommended config**
- `backend/ads-service/internal/domain/inventory_policy.go`
- `backend/ads-service/internal/service/inventory_service.go`
- `admin-dashboard/src/pages/ads/InventoryPolicy.tsx`

**Checklist**
- [ ] Ad inventory is slot/placement based, not “append every active campaign”.
- [ ] Placement has max ads, adjacency rule, frequency cap, fallback and eligibility contract.
- [ ] Experience Service reserves sponsored-capable modules, but Ads Service selects content within inventory policy.
- [ ] Empty inventory falls back to organic/house content without blank gap.
- [ ] High paid density experiment cannot bypass protected minimum organic content.

---

## ADS-2026-005 — Eligibility, relevance, quality and auction/ranking [P1]

**Recommended files**
- `backend/ads-service/internal/domain/ad_candidate.go`
- `backend/ads-service/internal/service/eligibility_service.go`
- `backend/ads-service/internal/service/ranking_service.go`
- `backend/ads-service/internal/service/auction_service.go`
- `backend/ads-service/internal/service/auction_service_test.go`

**Candidate gating before bid/rank**
- merchant/branch active
- open/serviceable for user context where placement requires it
- relevant service/category/search intent
- menu/catalog availability where applicable
- campaign active and policy-approved
- budget available
- merchant/account not risk-suspended
- creative valid for placement/app version

**Ranking principle**
`ad_rank = bid/economic signal × relevance × quality × contextual eligibility`

- [ ] Highest payer does not automatically win if relevance/quality/eligibility is poor.
- [ ] Ad ranking cannot falsify organic rating/ETA/serviceability.
- [ ] Define deterministic tie-break and auction/version logging.
- [ ] Safe fallback exists when ranking/auction dependency fails.
- [ ] Cold-start/small merchants are not permanently excluded solely because large advertisers have more historical data; quality/relevance rules documented.

---

## ADS-2026-006 — Budget, bidding, pacing and spend reservation [P0/P1]

**Supported strategies as platform matures**
- automatic/spend-based
- goal-based
- manual max bid/cap

**Supported budget concepts**
- daily budget
- total campaign budget
- optional account ad balance/credit line per market policy
- currency-aware money model from `GLOB-2026-002`

**Recommended files**
- `backend/ads-service/internal/domain/spend.go`
- `backend/ads-service/internal/service/pacing_service.go`
- `backend/ads-service/internal/service/spend_service.go`
- `backend/ads-service/internal/service/spend_concurrency_test.go`

**Checklist**
- [ ] Spend cannot exceed configured hard budget due to concurrent impressions/clicks.
- [ ] Budget reservation/charge/release is idempotent.
- [ ] Pacing prevents entire daily budget from being consumed immediately unless intentionally configured.
- [ ] Timezone-aware daily budget reset.
- [ ] Bid changes create versioned audit context.
- [ ] Currency never inferred from merchant locale string.

---

## ADS-2026-007 — Ad delivery API + signed impression/click context [P0/P1]

**Recommended API capability**
- `GET /api/v1/ads/placements/{placement}` with user/session/context resolved server-side
- `POST /api/v1/ads/impressions`
- `POST /api/v1/ads/clicks`

**Recommended client files**
- `android-app-customer/.../data/ads/AdsApi.kt`
- `android-app-customer/.../data/ads/AdsRepository.kt`
- `android-app-customer/.../ui/designsystem/commerce/SponsoredMerchantCard.kt`
- `android-app-customer/.../ui/experience/components/DynamicSponsoredModule.kt`
- `frontend/src/lib/ads/adsClient.ts` if Customer Web receives sponsored surfaces later

**Checklist**
- [ ] Delivery response contains opaque `ad_delivery_token`/equivalent binding campaign, creative, placement and selection context.
- [ ] Client cannot declare arbitrary merchant as sponsored or choose billing price.
- [ ] Impression counted only when defined viewability/visibility condition occurs, not merely response fetch.
- [ ] Click event deduplicated/replay-protected.
- [ ] Order conversion attribution is joined server-side to actual order events, not trusted from client `conversion=true` payload.
- [ ] Cache respects campaign/budget/eligibility freshness and cannot overserve expired campaign indefinitely.

---

## ADS-2026-008 — Mandatory Sponsored/Iklan disclosure + accessibility [P0 release gate]

**Checklist**
- [ ] Every paid placement displays persistent `Sponsored`/localized equivalent or `Iklan` according to product/legal language.
- [ ] Label is visible before/without opening detail and cannot be hidden by merchant creative.
- [ ] Sponsored label meets Part S contrast requirements in Light/Dark.
- [ ] Screen reader/accessibility semantics identify the item as sponsored where applicable.
- [ ] Platform Promo uses different semantics such as `Promo LANCAR`, not `Sponsored`.
- [ ] Merchant Promo discount badge is independent of Sponsored label.
- [ ] Native sponsored card remains visually integrated enough to be usable but never intentionally disguised as organic.

---

## ADS-2026-009 — Attribution, conversion and performance model [P1]

**Recommended files**
- `backend/ads-service/internal/domain/attribution.go`
- `backend/ads-service/internal/service/attribution_service.go`
- `backend/ads-service/internal/service/reporting_service.go`
- `docs/contracts/ads-attribution-2026.md`

**Metrics**
- impressions
- viewable impressions where defined
- clicks
- CTR
- orders/conversions
- CVR
- spend
- CPC/CPM/CPO as relevant
- attributed GMV/revenue
- ROAS
- new-customer orders
- repeat-customer orders
- incrementality/holdout where experimentation permits

**Checklist**
- [ ] Attribution window/version explicit and immutable for historical report interpretation.
- [ ] Same order cannot be double-attributed to multiple campaigns under one attribution model unless multi-touch is explicitly supported.
- [ ] Cancelled/refunded/fraudulent orders handled consistently in performance metrics.
- [ ] Organic baseline and paid-attributed performance are reported separately.
- [ ] Dashboard explains metric definitions; do not report “ROAS” from client clicks alone.

---

## ADS-2026-010 — Ads billing, ledger and reconciliation [P0/P1]

**Integration**
- Ads Service
- Payment/Ledger domain
- Merchant finance statement
- Admin finance reconciliation

**Recommended files**
- `backend/ads-service/internal/domain/ad_charge.go`
- `backend/ads-service/internal/service/ad_billing_service.go`
- `backend/ads-service/internal/service/ad_reconciliation_service.go`
- `database/migrations/<timestamp>_add_ad_charges_and_credits.sql`

**Checklist**
- [ ] Every billable event has immutable campaign/account/placement/cost/currency/billing-model/version reference.
- [ ] Duplicate impression/click callback does not double-charge.
- [ ] Invalid/fraud-filtered traffic can create audited credit/reversal rather than destructive ledger edit.
- [ ] Merchant statement separates Ads spend from merchant promo subsidy/food settlement.
- [ ] Finance can reconcile served/billable events ↔ ads ledger ↔ merchant balance/payment.
- [ ] Account cannot spend beyond allowed balance/credit policy.

---

## ADS-2026-011 — Ads fraud, invalid traffic and abuse controls [P0/P1]

**Signals**
- repeated/self clicks
- bot/device patterns
- click farms
- impossible impression cadence
- merchant employee/device abuse
- coordinated account behavior
- fake conversion/order loop
- creative policy abuse

**Recommended files**
- `backend/ads-service/internal/service/invalid_traffic_service.go`
- integration with `backend/risk-service/` from `GLOB-2026-007`
- `admin-dashboard/src/pages/ads/InvalidTraffic.tsx`

**Checklist**
- [ ] Invalid traffic can be excluded before/after provisional billing according to documented reconciliation flow.
- [ ] Merchant cannot earn better ad quality by generating fake orders/clicks.
- [ ] Risk decision and reason are auditable and appeal/reviewable where appropriate.
- [ ] Device/user privacy minimization applies; do not collect unnecessary fingerprinting data merely for ads.

---

## ADS-2026-012 — Merchant Android Ads Manager [P1]

**Existing domain to keep separate**
- `android-app-merchant/.../ui/screens/promo/`

**Recommended new files**
- `android-app-merchant/app/src/main/java/com/tembus/merchant/ui/screens/ads/AdsHomeScreen.kt`
- `.../ads/AdsCampaignListScreen.kt`
- `.../ads/AdsCampaignCreateScreen.kt`
- `.../ads/AdsCampaignDetailScreen.kt`
- `.../ads/AdsCampaignPerformanceScreen.kt`
- `.../ads/AdsViewModel.kt`
- `android-app-merchant/app/src/main/java/com/tembus/merchant/data/ads/AdsRepository.kt`
- `android-app-merchant/app/src/main/java/com/tembus/merchant/data/ads/AdsApi.kt`

**Merchant GUI must support**
- create campaign
- choose objective
- choose placement
- eligible branch/location
- audience
- daily/total budget
- bid strategy
- start/end/daypart
- creative selection/upload from allowed library
- preview
- launch
- pause/resume
- clone
- stop/end
- performance/spend/balance

**Checklist**
- [ ] Merchant clearly understands “Promo” vs “Iklan” as separate products/menu.
- [ ] Estimated reach/performance is labeled estimate, never guaranteed order count.
- [ ] Budget hard cap and billing model visible before launch.
- [ ] Campaign cannot advertise closed/ineligible branch without defined scheduled behavior.
- [ ] Merchant sees rejection/suspension reason and remediation path.

---

## ADS-2026-013 — Admin Ads Control Plane / moderation / inventory / finance [P0/P1]

**Recommended Admin navigation**
- `Commerce Ads → Overview`
- `Commerce Ads → Campaigns`
- `Commerce Ads → Creatives & Moderation`
- `Commerce Ads → Inventory & Placements`
- `Commerce Ads → Bid/Pacing Policy`
- `Commerce Ads → Invalid Traffic`
- `Commerce Ads → Billing & Credits`
- `Commerce Ads → Analytics`
- `Commerce Ads → Audit`

**Recommended files**
- `admin-dashboard/src/pages/ads/AdsOverview.tsx`
- `admin-dashboard/src/pages/ads/Campaigns.tsx`
- `admin-dashboard/src/pages/ads/CreativeModeration.tsx`
- `admin-dashboard/src/pages/ads/InventoryPolicy.tsx`
- `admin-dashboard/src/pages/ads/BidPolicy.tsx`
- `admin-dashboard/src/pages/ads/InvalidTraffic.tsx`
- `admin-dashboard/src/pages/ads/AdsBilling.tsx`
- `admin-dashboard/src/pages/ads/AdsAnalytics.tsx`

**Checklist**
- [ ] Admin can suspend campaign/account/creative with actor+reason+scope+expiry/audit.
- [ ] Inventory limits cannot be raised beyond protected global bounds by ordinary marketing role.
- [ ] Creative moderation checks misleading content, prohibited content, image quality, destination and accessibility requirements.
- [ ] Billing adjustment uses credit/debit ledger action, not silent spend edit.
- [ ] Admin can inspect why a campaign was/was not eligible for sampled request using privacy-safe debug context.
- [ ] High-blast-radius bid/inventory policy changes use maker-checker/rollout/audit where appropriate.

---

## ADS-2026-014 — Privacy-safe audience targeting [P0/P1]

**Allowed dimensions subject to market/privacy policy**
- market/city/zone
- service area
- new vs returning customer relationship to merchant
- contextual search/category intent
- time/daypart
- app surface/version
- privacy-safe behavior cohort defined by governed data platform

**Checklist**
- [ ] Sensitive personal attributes are not exposed in Merchant Ads Manager targeting.
- [ ] Merchant does not receive individual user identity/list from ad targeting.
- [ ] Complex audience evaluation happens server-side.
- [ ] Consent/market policy determines whether personalization signals are usable.
- [ ] Provide contextual/non-personalized fallback where required.
- [ ] Ads targeting data obeys retention/deletion rules from global compliance/data tasks.

---

## ADS-2026-015 — Ads experimentation and marketplace health guardrails [P1]

**Integration**
- `GLOB-2026-008` Experiment platform
- `GLOB-2026-005` governed event taxonomy

**Experimentable dimensions within protected bounds**
- sponsored density
- placement position
- label wording/presentation if legally equivalent
- ranking weights
- pacing
- bidding strategy UX
- merchant campaign onboarding

**Guardrail metrics**
- organic CTR/conversion
- search abandonment
- customer retention
- cancellation/refund
- merchant concentration/fairness
- support contacts
- app performance/crash
- complaint/hide-ad rate when supported

- [ ] Revenue uplift alone cannot approve a harmful ad-density experiment.
- [ ] Protected ad-free transaction/emergency zones cannot be overridden by ordinary experiment.
- [ ] Experiment assignment/exposure recorded separately from billable ad impression.

---

## ADS-2026-016 — Commerce Ads observability / SLO / capacity [P0/P1]

**Metrics**
- placement request latency/success
- no-fill rate
- candidate count
- eligibility rejection reasons
- auction latency
- pacing/budget exhaustion
- overspend prevented
- impression/click event loss/replay
- attribution backlog
- billing mismatch
- invalid-traffic rate

**Checklist**
- [ ] Ads failure degrades to organic content; it must not break Food/Home core discovery.
- [ ] Ads Service timeout has strict budget and circuit breaker.
- [ ] Budget/charge path receives stronger consistency than non-critical reporting path.
- [ ] Load test covers campaign launch peak + high Home/Food request QPS.
- [ ] Ad delivery outage does not affect checkout/order/payment availability.

---

## ADS-2026-017 — Commerce Ads E2E / concurrency / trust suite [P0 release gate]

**Recommended tests**
- `backend/ads-service/internal/service/ads_e2e_test.go`
- `backend/ads-service/internal/service/budget_concurrency_test.go`
- `android-app-customer/app/src/androidTest/java/com/tembus/customer/ads/SponsoredDiscoveryTest.kt`
- `android-app-merchant/app/src/androidTest/java/com/tembus/merchant/ads/AdsCampaignFlowTest.kt`
- `admin-dashboard/e2e/ads-control-plane.spec.ts`

**Mandatory scenarios**
- [ ] Merchant creates draft → configures placement/audience/budget/schedule → launches → eligible sponsored item appears with label.
- [ ] Ineligible/out-of-area/closed merchant does not serve despite high bid.
- [ ] Campaign budget exhausted stops billable delivery.
- [ ] Concurrent clicks/impressions do not overspend/double-charge.
- [ ] Pause/end propagates within target SLA.
- [ ] Expired campaign cannot be served from stale cache.
- [ ] Invalid traffic is excluded/credited according to policy.
- [ ] Sponsored Food card cannot modify organic rating/ETA/serviceability.
- [ ] Organic content remains visible under maximum allowed sponsored density.
- [ ] Tambal Ban/Towing active flows contain zero ad placement.
- [ ] Checkout/payment/tracking contain zero ad placement.
- [ ] Ads service outage falls back to organic discovery without breaking screen.
- [ ] Attribution uses real server order result and handles cancellation/refund correctly.

---

# DESIGN SYSTEM + ADS IMPLEMENTATION ORDER

1. `DS-2026-001/002/003` — lock design-system governance, semantic tokens and core components.
2. `DS-2026-011/012` — begin measured adoption and regression gate; remove benchmark-specific internal naming.
3. `DS-2026-004/006/007` — commerce components + Super-App Home + Food discovery pattern.
4. `DS-2026-005/008/009/010` — logistics/emergency patterns, media/icon governance and Figma traceability.
5. Finish Food organic discovery/ranking (`FOOD-2026-014`) before monetization can influence the feed.
6. `ADS-2026-001/002/003/004` — domain separation, Ads Service, campaign lifecycle and protected inventory rules.
7. `ADS-2026-005/006/007/008` — eligibility/ranking, budget/pacing, delivery events and disclosure.
8. `ADS-2026-010/011/014/016` — billing, invalid traffic, privacy and reliability.
9. `ADS-2026-012/013` — Merchant Ads Manager + Admin Ads Control Plane.
10. `ADS-2026-009/015` — attribution/reporting and experimentation after trustworthy events exist.
11. `ADS-2026-017` — full release gate before real paid campaigns.

# DESIGN SYSTEM + ADS FINAL GUARDRAILS

- LANCAR takes **product principles**, not competitor UI implementation or naming.
- One Design System governs shared primitives; service patterns govern information priority.
- Food may be visually richer; emergency and transaction surfaces remain calmer and more utility-first.
- Promo and Sponsored are separate products with separate accounting and disclosure.
- Experience Service controls where a sponsored-capable slot exists; Ads Service controls which paid candidate may fill it.
- Organic ranking remains independently measurable and cannot be rewritten as “paid = best”.
- Paid visibility never falsifies rating, ETA, availability, price, delivery fee or serviceability.
- Sponsored content is always disclosed and frequency/density capped.
- Active order, checkout/payment/support/claim and emergency roadside/towing flows remain ad-free.
- Ads failure always degrades to organic content, never to broken Customer experience.
- No merchant/Admin campaign configuration may bypass WCAG 2.1 AA, app-version compatibility, privacy, risk, inventory or financial invariants.

---

# PART U — UNIVERSAL SEARCH & DISCOVERY PLATFORM

> **Goal:** satu search/discovery capability untuk seluruh super-app. Query customer tidak boleh dipaksa mengetahui struktur internal service. Search memahami intent, location, serviceability, open/closed state dan relevance, kemudian mengembalikan hasil organik yang terukur. Sponsored integration mengikuti `ADS-*` dan tidak boleh menggantikan organic truth.
>
> **Architecture rule:** mulai sebagai bounded module di ownership yang paling tepat bila traffic masih kecil. Extract menjadi `backend/search-service/` hanya ketika indexing scale, query latency, ownership, deployment cadence atau failure domain memang membutuhkan separation. Jangan membuat microservice hanya untuk memenuhi diagram.

## SEARCH-2026-001 — Canonical searchable entity + index contract [P0/P1]

**Recommended new docs/files**
- `docs/contracts/search-index-2026.md`
- `backend/search-service/internal/domain/search_document.go` when extraction justified
- `backend/search-service/internal/domain/search_query.go`
- `backend/search-service/internal/service/search_service.go`

**Searchable entity types**
- `service`
- `merchant`
- `merchant_branch`
- `food_item`
- `food_category`
- `promo_collection`
- `address/place` where appropriate
- `help/support_topic` for universal help search if enabled

**Checklist**
- [ ] Every document has stable entity id, entity type, market, locale, status, serviceability/geography fields, source version and updated_at.
- [ ] Search index is derivative; Merchant/Order/Geo/Promo authoritative services remain source of truth.
- [ ] Search result never fabricates price, ETA, availability, rating or discount.
- [ ] Index schema is versioned and supports zero-downtime rebuild/migration.
- [ ] Deleted/suspended/closed entity is removed or made ineligible within documented freshness SLA.

---

## SEARCH-2026-002 — Universal query understanding, autocomplete, typo tolerance and intent routing [P1]

**Recommended files**
- `backend/search-service/internal/service/query_understanding_service.go`
- `backend/search-service/internal/service/autocomplete_service.go`
- `backend/search-service/internal/service/spell_service.go`
- `android-app-customer/.../ui/search/UniversalSearchScreen.kt`
- `android-app-customer/.../ui/search/UniversalSearchViewModel.kt`

**Examples**
- `ayam geprk` → Food / Ayam Geprek candidates
- `ban bocor` → Tambal Ban intent
- `towing mobil` → Towing intent
- `kirim paket bandung` → Paket/Aggregator intent depending origin/destination/context

**Checklist**
- [ ] Autocomplete supports recent/popular/contextual suggestions without exposing another user's data.
- [ ] Typo/synonym handling is locale aware.
- [ ] Query understanding may return service intent + structured filters, but user can still correct result/filter.
- [ ] Ambiguous query does not silently trigger transaction; it opens discovery/result selection.
- [ ] Search history can be cleared and follows privacy/retention policy.

---

## SEARCH-2026-003 — Geo/serviceability/open-now eligibility before ranking [P0/P1]

**Integration**
- `routing-service` / Part Y Geo
- Merchant operating hours
- service availability/capability

**Checklist**
- [ ] User location/address context is resolved once and passed as canonical geo context.
- [ ] Merchant/service outside service area is excluded or explicitly labeled unavailable, not ranked as actionable.
- [ ] `open_now` uses authoritative branch hours/temporary closure.
- [ ] Distance/ETA filters use Geo source and provenance.
- [ ] Search remains useful without precise location permission through saved/manual area selection.

---

## SEARCH-2026-004 — Organic ranking + personalization with protected truth [P1]

**Recommended files**
- `backend/search-service/internal/domain/rank_context.go`
- `backend/search-service/internal/service/organic_ranking_service.go`
- `backend/search-service/internal/service/ranking_service_test.go`

**Possible signals**
- text relevance
- serviceability
- distance/ETA
- merchant/item quality
- open state
- user context/preferences with consent
- conversion/engagement signals with bias controls
- freshness/popularity

**Checklist**
- [ ] Organic score is independent from paid bid.
- [ ] Ranking version is logged per result page/request.
- [ ] Cold-start and new/small merchant treatment documented so historical scale does not permanently lock them out.
- [ ] Personalization has non-personalized fallback.
- [ ] Ranking outage falls back to deterministic safe order rather than breaking discovery.

---

## SEARCH-2026-005 — Event-driven indexing, freshness and rebuild [P0/P1]

**Integration**
- `GLOB-2026-005` canonical event platform
- Merchant catalog/branch events
- service configuration events

**Checklist**
- [ ] Index updates consume versioned domain events or authoritative snapshot sync.
- [ ] Duplicate/out-of-order index events are safe.
- [ ] Rebuild can create new index version then atomically switch alias/reference.
- [ ] Index freshness/staleness metrics per entity type.
- [ ] Search result revalidates transactional truth before checkout/order.

---

## SEARCH-2026-006 — Sponsored search integration without corrupting organic results [P0/P1]

**Checklist**
- [ ] Ads Service receives eligible search context, not permission to rewrite organic score.
- [ ] Sponsored positions are explicitly capped by `ADS-2026-004`.
- [ ] Sponsored item still passes serviceability/open/relevance/quality gating.
- [ ] Persistent `Sponsored/Iklan` disclosure.
- [ ] Organic result set remains independently measurable.
- [ ] Ads outage returns organic-only search.

---

## SEARCH-2026-007 — Admin search merchandising with bounded authority [P1]

**Recommended Admin pages**
- `admin-dashboard/src/pages/search/SearchOverview.tsx`
- `admin-dashboard/src/pages/search/Synonyms.tsx`
- `admin-dashboard/src/pages/search/MerchandisingRules.tsx`
- `admin-dashboard/src/pages/search/SearchQuality.tsx`

**Checklist**
- [ ] Admin can manage synonyms/misspellings/curated collections by market/locale.
- [ ] Manual pin/boost has reason, scope, expiry and audit.
- [ ] Admin cannot alter rating/ETA/price truth through merchandising.
- [ ] Emergency/service intent aliases reviewed separately from marketing keywords.
- [ ] Search config supports preview/test query before publish.

---

## SEARCH-2026-008 — Search analytics, quality and privacy [P1]

**Metrics**
- query volume
- zero-result rate
- reformulation rate
- autocomplete acceptance
- click-through
- conversion
- abandonment
- latency
- index freshness
- organic vs sponsored separately

**Checklist**
- [ ] Raw query retention/minimization policy defined because search text may contain PII.
- [ ] Sensitive query text is access restricted and not exposed casually to merchants.
- [ ] Quality dashboard supports market/locale/service breakdown.
- [ ] Search analytics uses governed event definitions.

---

## SEARCH-2026-009 — Search reliability and E2E gate [P0/P1]

**Mandatory scenarios**
- [ ] Typo query returns relevant result.
- [ ] Closed/out-of-area merchant is not actionable.
- [ ] Index delay does not bypass authoritative checkout validation.
- [ ] Ranking service failure falls back safely.
- [ ] Ads failure leaves organic results usable.
- [ ] Old app can consume backward-compatible result envelope.
- [ ] Latency/load test uses projected city/multi-city query QPS rather than arbitrary toy traffic.

---

# PART V — COMMUNICATION PLATFORM

> **Goal:** Push, in-app inbox, chat, masked contact, SMS/email/WhatsApp/provider fallback menggunakan satu event/template/delivery contract. Setiap vertical tidak boleh membuat notification retry/preferences/template logic sendiri-sendiri.

## COMM-2026-001 — Canonical communication event and orchestration [P0]

**Recommended new service after inventory if no equivalent exists**
- `backend/communication-service/cmd/api/main.go`
- `backend/communication-service/internal/domain/message.go`
- `backend/communication-service/internal/domain/channel.go`
- `backend/communication-service/internal/domain/delivery.go`
- `backend/communication-service/internal/service/orchestrator.go`
- `backend/communication-service/internal/repository/communication_repository.go`
- `docs/contracts/communication-platform-2026.md`

**Checklist**
- [ ] Producer sends semantic event/template reference, not provider-specific FCM/SMS payload.
- [ ] Message carries recipient, market, locale, category, priority, entity/order reference, template version and correlation id.
- [ ] Critical transaction communication and marketing communication are separate categories/policies.
- [ ] Duplicate event cannot spam duplicate customer notification.
- [ ] Delivery state is observable: queued/sent/delivered/read/failed/suppressed where channel supports it.

---

## COMM-2026-002 — Push token lifecycle + Android/iOS-ready provider abstraction [P0]

**Checklist**
- [ ] Device token registered per account/device/app/surface/version.
- [ ] Invalid/uninstalled token retired automatically.
- [ ] Account switch/logout prevents notification leakage to previous account.
- [ ] Push provider adapter supports retry and provider error classification.
- [ ] Push deep link references typed route/entity and snapshot-reconciles before action.
- [ ] Push is not authoritative state mutation.

---

## COMM-2026-003 — First-class in-app inbox / notification center [P1]

**Recommended client files**
- customer `.../ui/screens/inbox/InboxScreen.kt`
- merchant/courier equivalents where needed

**Checklist**
- [ ] Persistent inbox separates Orders, Safety/Support, Promotions and System messages.
- [ ] Read/unread state syncs across devices where product requires it.
- [ ] Expired campaign message can remain historical without offering invalid CTA.
- [ ] Accessibility/localization/design-system compliant.
- [ ] Admin can inspect aggregate delivery health without browsing private user inbox content unnecessarily.

---

## COMM-2026-004 — Order-scoped chat + contact masking [P0/P1]

**Recommended new modules/files**
- `backend/communication-service/internal/domain/conversation.go`
- `backend/communication-service/internal/service/chat_service.go`
- customer/courier/merchant chat UI packages

**Checklist**
- [ ] Conversation is scoped to order/service participants and lifecycle.
- [ ] AuthZ revalidated for every send/read operation.
- [ ] File/image attachment size/type/malware policy.
- [ ] Contact details are masked according to lifecycle/privacy policy.
- [ ] Block/report/escalate path into Support/Safety.
- [ ] Retention differs for ordinary chat vs safety evidence where legally justified.

---

## COMM-2026-005 — Masked calling and external channel adapters [P1]

**Channels as market capability**
- masked telephony
- SMS
- email
- WhatsApp/business messaging where contractually/legal supported

**Checklist**
- [ ] Provider-specific API/signature/error mapping remains in adapter boundary.
- [ ] Real phone number disclosure minimized.
- [ ] Channel availability/cost/consent is market scoped.
- [ ] Fallback chain is explicit by message category; do not send marketing via transactional fallback without consent.
- [ ] Provider outage/circuit-breaker does not block core order state.

---

## COMM-2026-006 — Template, localization and content governance [P0/P1]

**Recommended Admin pages**
- `admin-dashboard/src/pages/communication/Templates.tsx`
- `admin-dashboard/src/pages/communication/DeliveryHealth.tsx`

**Checklist**
- [ ] Templates versioned by market/locale/channel/category.
- [ ] Required variables typed and validated before publish.
- [ ] Financial/legal/safety copy uses protected approval path.
- [ ] Marketing templates honor Experience/CRM targeting and consent.
- [ ] Preview renders channel-specific truncation/format before publish.

---

## COMM-2026-007 — Preferences, consent, quiet hours and critical exceptions [P0/P1]

**Checklist**
- [ ] Customer can control permitted optional categories/channels where applicable.
- [ ] Critical order/safety/security messages cannot be silently suppressed by a generic marketing opt-out when legally/product required.
- [ ] Quiet hours are timezone aware and category aware.
- [ ] Preference changes audited and propagated quickly.
- [ ] Consent policy comes from market compliance configuration.

---

## COMM-2026-008 — Delivery retry, receipts, observability and cost [P0]

**Metrics**
- queue age
- send latency
- provider success/error
- delivery/read rate where available
- suppression reason
- retry/dead-letter
- cost by channel/market/template

**Checklist**
- [ ] Exponential/retry policy avoids notification storms.
- [ ] Permanent provider errors do not retry forever.
- [ ] Dead-letter/replay is idempotent.
- [ ] Communication outage degrades non-critical messages while preserving order truth.

---

## COMM-2026-009 — Communication privacy, abuse and moderation [P0/P1]

**Checklist**
- [ ] Rate limit unsolicited chat/contact attempts.
- [ ] Harassment/spam reporting links to Safety/Reputation.
- [ ] Merchant/courier cannot export personal contact list from platform messaging.
- [ ] Attachment/content moderation policy documented.
- [ ] Support access to conversation is role/need based and audited.

---

## COMM-2026-010 — Cross-channel E2E release gate [P0]

**Mandatory scenarios**
- [ ] Order event → push + inbox → typed deep link → authoritative snapshot.
- [ ] Invalid push token retired.
- [ ] Duplicate event sends one effective message.
- [ ] Chat unauthorized participant rejected.
- [ ] Masked call does not expose raw phone number through normal UI/API.
- [ ] Provider outage follows configured fallback without duplicate spam.
- [ ] Marketing opt-out suppresses marketing but not required safety/order communication.

---

# PART W — GLOBAL PAYMENT ORCHESTRATION PLATFORM

> **Audited direction:** `backend/payment-service/` already exists with domain/service structure, wallet, disbursement and ledger primitives. Evolve it first. Do not create a second payment source of truth unless scale/ownership requires extraction. Payment orchestration is distinct from order pricing and from merchant/courier settlement accounting.

## PAYPLAT-2026-001 — Provider capability adapter contract [P0]

**Existing service to extend**
- `backend/payment-service/`

**Recommended new files**
- `backend/payment-service/internal/domain/provider.go`
- `backend/payment-service/internal/domain/payment_capability.go`
- `backend/payment-service/internal/provider/provider_registry.go`
- `docs/contracts/payment-provider-adapter-2026.md`

**Capabilities as applicable**
- create/authorize
- capture
- void
- refund
- tokenized method
- recurring/mandate where supported
- 3DS/challenge
- bank transfer/VA
- QR/real-time payment
- webhook
- chargeback/dispute

**Checklist**
- [ ] Provider that lacks capability never fakes it.
- [ ] Credentials/signatures server-side.
- [ ] Native provider transaction/reference preserved.
- [ ] Provider adapter has timeout/retry/circuit breaker and contract tests.

---

## PAYPLAT-2026-002 — Canonical Payment Intent state machine [P0]

**Recommended files**
- `backend/payment-service/internal/domain/payment_intent.go`
- `backend/payment-service/internal/service/payment_intent_service.go`
- `backend/payment-service/internal/service/payment_intent_service_test.go`

**Target states**
`CREATED → REQUIRES_ACTION/PROCESSING → AUTHORIZED/PAID → CAPTURED/SETTLED`
with terminal/exception states such as `FAILED`, `CANCELLED`, `EXPIRED`, `PARTIALLY_REFUNDED`, `REFUNDED`, `CHARGEBACK` as model requires.

**Checklist**
- [ ] Order references payment intent; client does not set `paid=true`.
- [ ] Provider webhook and client-return races are idempotent.
- [ ] Late callback cannot revive cancelled/expired intent incorrectly.
- [ ] State transitions preserve provider raw status + normalized status.

---

## PAYPLAT-2026-003 — Smart provider routing, health and failover [P0/P1]

**Recommended files**
- `backend/payment-service/internal/service/provider_router.go`
- `backend/payment-service/internal/service/provider_health_service.go`

**Possible routing context**
- market/currency
- payment method
- provider capability
- health/error rate/latency
- contractual cost
- risk/compliance
- merchant/service constraints

**Checklist**
- [ ] Routing rule version logged per payment intent.
- [ ] Failover only before irreversible provider mutation unless idempotency/lookup proves safe.
- [ ] Do not create two successful charges while “retrying another provider”.
- [ ] Provider health can disable new attempts while callback/reconciliation remains active.
- [ ] Admin override has scope, reason, expiry and audit.

---

## PAYPLAT-2026-004 — Tokenization, sensitive-card boundary and authentication [P0]

**Checklist**
- [ ] Raw PAN/card secrets never traverse or persist in systems that can use provider tokenization/hosted field instead.
- [ ] PCI scope documented per market/provider integration.
- [ ] 3DS/SCA/challenge state explicitly modeled where applicable.
- [ ] Saved method tokens scoped to customer/provider/market and revocable.
- [ ] Logs/telemetry redact sensitive payment payloads.

---

## PAYPLAT-2026-005 — Refund, reversal, chargeback and processor dispute [P0]

> Processor/payment `chargeback/dispute` is a financial rail event. It is distinct from customer support case or carrier claim even if they are linked.

**Checklist**
- [ ] Partial/full refund uses immutable ledger entries and provider reference.
- [ ] Duplicate refund request/callback cannot double credit.
- [ ] Chargeback lifecycle and evidence deadline modeled.
- [ ] Support/Admin links payment dispute to order/case without editing provider state manually.
- [ ] Won/lost chargeback reconciles ledger and merchant/platform liability policy.

---

## PAYPLAT-2026-006 — Market payment-method catalog and eligibility [P0]

**Checklist**
- [ ] Market config determines allowed methods/provider routes/currency/min-max amount.
- [ ] Customer only sees methods valid for market/order/value/risk context.
- [ ] Method availability can be remotely disabled without losing active payment recovery.
- [ ] No hardcoded `Rp` or Indonesian-only method assumption in payment domain.

---

## PAYPLAT-2026-007 — Wallet/credits/escrow-like balances with clear legal boundary [P0/P1]

**Existing files to inspect**
- `backend/payment-service/internal/domain/wallet.go`
- `backend/payment-service/internal/service/wallet_service.go`
- `backend/payment-service/internal/domain/ledger.go`

**Checklist**
- [ ] Define balance types: customer credit/refund credit, merchant payable, courier earnings, Ads balance, promotional credit as separate ledgers/owners where semantics differ.
- [ ] Never silently mix promotional credit with withdrawable cash.
- [ ] Hold/reserve/release/settle operations idempotent and concurrency tested.
- [ ] Regulatory/licensing implications reviewed before offering stored-value behavior in a new market.

---

## PAYPLAT-2026-008 — Payment reconciliation and provider settlement truth [P0]

**Checklist**
- [ ] Reconcile internal intent/ledger ↔ provider transaction ↔ provider settlement/report/bank movement where accessible.
- [ ] Missing/duplicate/mismatched payment enters exception queue.
- [ ] Reconciliation supports timezone/currency/provider batching differences.
- [ ] Manual correction is compensating entry, not history overwrite.

---

## PAYPLAT-2026-009 — Admin Payment Operations control plane [P0/P1]

**Recommended Admin pages**
- `admin-dashboard/src/pages/payments/PaymentHealth.tsx`
- `admin-dashboard/src/pages/payments/PaymentIntents.tsx`
- `admin-dashboard/src/pages/payments/ProviderRouting.tsx`
- `admin-dashboard/src/pages/payments/Chargebacks.tsx`
- `admin-dashboard/src/pages/payments/PaymentExceptions.tsx`

**Checklist**
- [ ] Provider health/circuit state visible.
- [ ] Intent timeline shows internal+provider events.
- [ ] Refund/void actions permissioned/idempotent/audited.
- [ ] No ordinary admin can mark payment successful manually.
- [ ] Routing/config high-impact changes use approval/rollout.

---

## PAYPLAT-2026-010 — Payment chaos/concurrency/E2E release gate [P0]

**Mandatory scenarios**
- [ ] Duplicate create/callback/refund.
- [ ] Client closes app during challenge then resumes.
- [ ] Provider timeout before known result → lookup/reconcile, not blind second charge.
- [ ] Provider outage routes only when safe.
- [ ] Late successful callback after customer-visible timeout reconciles correctly.
- [ ] Multi-currency rounding/reconciliation.
- [ ] Chargeback and refund cannot double compensate.
- [ ] Load test covers peak checkout + webhook callbacks.

---

# PART X — TRUST & SAFETY PLATFORM

> **Boundary:** Risk (`GLOB-2026-007`) predicts/controls suspicious behavior. Trust & Safety handles human safety, dangerous incidents, harassment, accident, emergency escalation and evidence. Support (`GLOB-2026-010`) handles general cases. The three systems integrate but are not aliases.

## SAFE-2026-001 — Canonical safety incident + severity model [P0]

**Recommended new module/service**
- `backend/safety-service/internal/domain/incident.go`
- `backend/safety-service/internal/domain/severity.go`
- `backend/safety-service/internal/service/incident_service.go`
- `docs/contracts/safety-incident-2026.md`

**Checklist**
- [ ] Incident links actor(s), order/service, location snapshot, time, category, severity, evidence references and escalation state.
- [ ] Severity drives SLA/notification/escalation, not arbitrary UI color.
- [ ] Safety state is separate from order state; incident creation does not silently complete/cancel order.
- [ ] Evidence immutability/retention/access policy defined.

---

## SAFE-2026-002 — Customer Safety Center [P0/P1]

**Customer capability**
- share active service/trip status
- emergency contact entry
- report safety issue
- contact support/safety
- SOS/emergency action where market/legal/operationally supported

**Checklist**
- [ ] Safety Center remains reachable during active order even if service entry is killed/hidden.
- [ ] Critical action shows exact consequence and does not depend on advertising/remote marketing content.
- [ ] Location sharing is scoped/expiring/revocable.
- [ ] Accessibility and accidental-tap protection appropriate to action severity.

---

## SAFE-2026-003 — Courier/technician/operator Safety Center [P0]

**Incident examples**
- unsafe pickup/dropoff
- harassment/threat
- accident
- vehicle breakdown
- dangerous item/scene
- customer/merchant aggression
- suspected fraud with immediate safety concern

**Checklist**
- [ ] Courier can report without abandoning authoritative order silently.
- [ ] Emergency workflow can pause/hold/reassign through explicit order APIs when policy allows.
- [ ] Safety report cannot be retaliatorily exposed to counterparty.
- [ ] Offline-safe minimal incident capture where connectivity is poor.

---

## SAFE-2026-004 — Share-trip/service and trusted emergency-contact capability [P1]

**Checklist**
- [ ] Share token contains minimum necessary route/status/identity data.
- [ ] Token expires/revokes when service ends or user revokes.
- [ ] Viewer cannot mutate order/contact participants.
- [ ] Emergency contacts are user-managed and privacy scoped.
- [ ] Public share page rate-limited and protected from enumeration.

---

## SAFE-2026-005 — SOS/emergency escalation adapter [P0/P1]

**Checklist**
- [ ] Market-specific emergency integration/call center/provider is configured, not hardcoded globally.
- [ ] SOS action records timestamp/location/order/context and delivery/escalation status.
- [ ] If external emergency integration unavailable, UI presents safe fallback instructions/contact path approved per market.
- [ ] Never promise emergency response capability that operations cannot actually provide.
- [ ] Regular support queue cannot silently absorb P0 safety incident without escalation.

---

## SAFE-2026-006 — Contact masking / privacy during live service [P0]

**Checklist**
- [ ] Phone/contact sharing minimized and lifecycle scoped.
- [ ] Masked call/chat preferred where available.
- [ ] Contact access expires after configured recovery window.
- [ ] Support override to reveal sensitive contact requires elevated policy and audit if ever allowed.

---

## SAFE-2026-007 — Safety evidence, media integrity and retention [P0]

**Checklist**
- [ ] Photo/video/audio/document metadata binds incident/order/actor/time.
- [ ] Upload validates type/size/malware and protects object URL.
- [ ] Original evidence immutable; redacted derivative used for ordinary support where possible.
- [ ] Legal hold/retention policy market scoped.
- [ ] Evidence access/download audited.

---

## SAFE-2026-008 — Safety Operations control plane [P0]

**Recommended Admin pages**
- `admin-dashboard/src/pages/safety/SafetyQueue.tsx`
- `admin-dashboard/src/pages/safety/SafetyIncident.tsx`
- `admin-dashboard/src/pages/safety/SafetyAnalytics.tsx`

**Checklist**
- [ ] Queue sorted by severity/SLA, not just newest first.
- [ ] Incident timeline includes communications, evidence, order actions and reviewer actions.
- [ ] Role-based sensitive-data reveal.
- [ ] Escalate/transfer/resolve/reopen with reasons and audit.
- [ ] Safety admin cannot directly rewrite payment/order state; uses authorized domain actions.

---

## SAFE-2026-009 — Safety ↔ Risk ↔ Reputation ↔ Support integration [P0/P1]

**Checklist**
- [ ] Safety incident can emit governed risk/reputation signals after appropriate review.
- [ ] Unverified allegation is not automatically permanent ban/rating truth.
- [ ] Risk decision can trigger safety review without exposing secret risk logic to counterparty.
- [ ] Appeals/review path exists for material enforcement.
- [ ] Support case references safety incident but ordinary support agents see only necessary data.

---

## SAFE-2026-010 — Safety drill/E2E release gate [P0]

**Mandatory scenarios**
- [ ] Customer emergency report during active Towing.
- [ ] Courier unsafe-location report during Paket.
- [ ] Safety incident survives socket/network reconnect.
- [ ] Safety evidence access is denied to unauthorized role.
- [ ] Kill-switch/new-order outage does not remove active Safety Center.
- [ ] High-severity incident appears in Ops within target SLA.
- [ ] Market without SOS integration uses approved fallback instead of fake success.

---

# PART Y — GEO & LOCATION INTELLIGENCE PLATFORM

> **Audited direction:** `backend/routing-service/` already exists with routing selector and zone resolver. Extend this service first. Geo platform should abstract provider choice and canonical location truth for all verticals; customer apps must not become provider-specific map clients for transactional decisions.

## GEO-2026-001 — Canonical location/address/place contract [P0]

**Recommended files**
- `backend/routing-service/internal/domain/location.go`
- `backend/routing-service/internal/domain/address.go`
- `docs/contracts/geo-location-2026.md`

**Checklist**
- [ ] Location separates display address, normalized address components, lat/lng, accuracy/source, place/provider ids, timezone and market.
- [ ] `0,0` is invalid transactional location.
- [ ] Coordinates and text address version together; changing one invalidates dependent quote/route where needed.
- [ ] Provider-native ids are metadata, not canonical primary business key.

---

## GEO-2026-002 — Map/geocode/routing provider adapter + health selection [P0]

**Files to inspect/edit**
- `backend/routing-service/internal/routing/selector.go`
- `backend/integration-gateway/internal/provider/maps_factory.go`
- existing TomTom/maps provider code

**Checklist**
- [ ] Capability-based providers for geocode/reverse/routing/traffic/map tiles where applicable.
- [ ] Provider health/latency/quota/circuit state visible.
- [ ] Failover preserves semantic contract and provider attribution/licensing requirements.
- [ ] Secret API keys remain server-side unless provider requires client public key with restrictions.
- [ ] Provider outage never fabricates route/ETA.

---

## GEO-2026-003 — Geocode, reverse geocode and address normalization [P0]

**Checklist**
- [ ] Manual text search returns candidate list; user confirms ambiguous result.
- [ ] Reverse geocode preserves pin coordinates even when address label changes.
- [ ] Market address parser supports local hierarchy/postal conventions.
- [ ] Provider response cached with TTL/licensing constraints.
- [ ] Address confidence/source exposed where operationally useful.

---

## GEO-2026-004 — Routing, traffic, ETA source and map matching [P0/P1]

**Checklist**
- [ ] Route result stores provider/source/version/time and route summary.
- [ ] Traffic-aware ETA is source/time specific and never treated as permanent fact.
- [ ] Courier GPS can be map-matched/smoothed without rewriting raw telemetry.
- [ ] Stale GPS and low-accuracy state explicit.
- [ ] Route recalculation policy avoids excessive provider cost/rate-limit.

---

## GEO-2026-005 — Service zones/geofence platform [P0]

**Files to inspect/edit**
- `backend/routing-service/internal/routing/zone_resolver.go`
- Admin maps/zones pages

**Checklist**
- [ ] Polygon/multipolygon zones versioned and market scoped.
- [ ] Service/capability/provider availability can reference zones.
- [ ] Boundary behavior tested deterministically.
- [ ] Zone publish has preview/diff/approval/rollback for high-impact changes.
- [ ] Active order is not invalidated blindly when zone config changes.

---

## GEO-2026-006 — Pickup-pin quality and location confidence [P1]

**Signals**
- GPS accuracy
- distance between pin and typed address/place
- road accessibility
- building/entrance notes
- historical successful pickup point where privacy-safe

**Checklist**
- [ ] Low-confidence pickup prompts user correction before expensive dispatch when practical.
- [ ] Courier/customer can suggest corrected pickup pin with auditable acceptance flow.
- [ ] Pin correction can requote/re-route when material.
- [ ] Do not auto-move customer pin silently based only on map matching.

---

## GEO-2026-007 — Geo privacy, precision and retention [P0]

**Checklist**
- [ ] Raw continuous courier location retention is purpose/market scoped.
- [ ] Customer background location uses least privilege.
- [ ] Analytics receives coarsened/pseudonymous location where exact coordinates unnecessary.
- [ ] Public tracking/share surfaces reduce precision when full precision is unnecessary.
- [ ] Admin access to historical exact route/location audited.

---

## GEO-2026-008 — Geo Operations Admin control plane [P0/P1]

**Recommended Admin capability**
- provider health/quota
- zones/service areas
- geocode quality exceptions
- route/ETA error samples
- pickup-pin issue queue
- provider config/version

**Checklist**
- [ ] Ops can disable degraded provider capability without editing env manually.
- [ ] Zone changes have impact estimate and affected services/markets.
- [ ] Admin never edits an active order coordinate through generic zone editor.

---

## GEO-2026-009 — Geo contract/load/chaos gate [P0]

**Mandatory scenarios**
- [ ] Primary map provider timeout → safe fallback/unavailable state.
- [ ] Same address normalized consistently across Food/Paket/Towing.
- [ ] Zone boundary tests.
- [ ] Stale/low-accuracy GPS displayed correctly.
- [ ] Provider change does not change canonical client contract.
- [ ] Load test covers search/geocode/quote/tracking route demand.

---

# PART Z — PRICING, INCENTIVES & MARKETPLACE ECONOMICS

> **Goal:** pricing, courier earnings, merchant commission, customer fees and incentives menjadi versioned policy-as-data dengan financial reconciliation. Dynamic marketplace economics may react to supply/demand, but never become an opaque uncontrolled multiplier.

## ECON-2026-001 — Canonical pricing-policy engine and component taxonomy [P0]

**Recommended files**
- `backend/order-service/internal/domain/pricing_policy.go`
- `backend/order-service/internal/service/pricing_policy_service.go`
- `docs/contracts/marketplace-pricing-2026.md`

**Component examples**
- base fare
- distance/time
- platform/service fee
- merchant commission
- courier earning
- toll/add-on
- insurance
- tax
- promo/subsidy
- demand/supply adjustment

**Checklist**
- [ ] Every quote stores rule/policy version.
- [ ] Customer total, merchant payable, courier earning and platform amount reconcile from explicit components.
- [ ] No hidden client-calculated fee.
- [ ] Price component labels/localization configurable per market while financial semantics remain stable.

---

## ECON-2026-002 — Real-time supply/demand marketplace metrics [P1]

**Checklist**
- [ ] Supply defined from truly available/capable couriers, not all registered accounts.
- [ ] Demand defined by service/zone/time window with event freshness.
- [ ] Metrics include match time, acceptance, no-supply, idle time and ETA.
- [ ] Delayed data has staleness indicator and cannot drive extreme pricing silently.

---

## ECON-2026-003 — Bounded dynamic/peak pricing policy [P1]

**Checklist**
- [ ] Dynamic adjustment has configured floor/ceiling, zone, service, time and market scope.
- [ ] Rule version and trigger context logged per quote.
- [ ] Customer sees material price before confirmation; requote required if changed.
- [ ] Emergency/Towing/Tambal pricing policy reviewed for fairness/consumer protection per market.
- [ ] Ordinary experiment cannot exceed protected caps.

---

## ECON-2026-004 — Courier earnings model [P0/P1]

**Checklist**
- [ ] Offer shows estimated earning/components before accept where product policy requires.
- [ ] Actual earning adjustment is policy driven and auditable.
- [ ] Cancellation/waiting/toll/return/extra service compensation explicit.
- [ ] Earnings do not depend on client-computed amount.
- [ ] Multi-service capability can have different earning rule without code fork.

---

## ECON-2026-005 — Courier incentives, quests, guarantees and supply shaping [P1]

**Recommended module/files**
- `backend/order-service/internal/domain/incentive.go` or dedicated incentives module when scale requires
- `admin-dashboard/src/pages/economics/Incentives.tsx`

**Checklist**
- [ ] Incentive has market/zone/service/cohort/schedule/target/budget/version.
- [ ] Progress server-authoritative and replay-safe.
- [ ] Budget liability reserved/reconciled.
- [ ] Fraud/collusion/self-order protection.
- [ ] Incentive cannot force unsafe driving or impossible completion target.

---

## ECON-2026-006 — Merchant commission and commercial contract policy [P1]

**Checklist**
- [ ] Commission/fee contract versioned by merchant/market/service/effective date.
- [ ] Food order settlement stores applied commercial terms.
- [ ] Ads spend remains separate from commission.
- [ ] Manual commercial override requires approved contract/reference and audit.
- [ ] Historical orders never reprice when merchant contract changes later.

---

## ECON-2026-007 — Customer fee transparency and cancellation economics [P0/P1]

**Checklist**
- [ ] Quote shows material fees before pay.
- [ ] Cancellation fee eligibility based on state/time/cost incurred and market policy.
- [ ] Customer receives reason/breakdown for charged cancellation fee.
- [ ] Fee waiver/compensation uses audited policy/credit, not silent total overwrite.

---

## ECON-2026-008 — Marketplace fairness and concentration guardrails [P1]

**Metrics**
- courier earning distribution
- merchant exposure concentration
- no-supply zones
- customer price distribution
- cancellation/acceptance changes
- new/small merchant discovery

**Checklist**
- [ ] Revenue uplift alone cannot approve harmful pricing/incentive experiment.
- [ ] Monitor extreme outliers by market/zone/service.
- [ ] Organic merchant discovery remains independent from commercial commission amount.
- [ ] Pricing policy changes can be rolled back quickly.

---

## ECON-2026-009 — Economics Admin control plane + maker-checker [P0/P1]

**Recommended Admin pages**
- `admin-dashboard/src/pages/economics/PricingPolicies.tsx`
- `admin-dashboard/src/pages/economics/SurgePolicies.tsx`
- `admin-dashboard/src/pages/economics/Incentives.tsx`
- `admin-dashboard/src/pages/economics/CommissionContracts.tsx`
- `admin-dashboard/src/pages/economics/UnitEconomics.tsx`

**Checklist**
- [ ] Draft/preview/simulate/approve/publish/rollback.
- [ ] Admin sees example quotes and affected market/zone/service before publish.
- [ ] Protected floor/ceiling cannot be bypassed by ordinary role.
- [ ] Policy change audit includes business reason.

---

## ECON-2026-010 — Experimentation with financial guardrails [P1]

**Checklist**
- [ ] Experiment assignment and pricing rule version both recorded.
- [ ] User/courier treatment remains deterministic during defined quote/order window.
- [ ] Guardrails include cancellation, ETA, support, courier earnings and margin.
- [ ] Experiment can be killed without corrupting active quote/order contract.

---

## ECON-2026-011 — Unit economics and financial reconciliation [P0/P1]

**Required decomposition**
`customer paid → tax/provider fee/promo subsidy → merchant payable → courier payable → carrier payable → Ads/other charges → platform contribution`

**Checklist**
- [ ] Unit economics computed from ledger truth, not analytics guess.
- [ ] Contribution metrics by market/service/order cohort have consistent definition.
- [ ] Negative-margin/outlier orders trace back to exact policy/version/components.
- [ ] Finance and Product use same financial definitions.

---

## ECON-2026-012 — Pricing/incentive concurrency/E2E gate [P0]

**Mandatory scenarios**
- [ ] Quote under policy version A remains auditable after version B publish.
- [ ] Concurrent incentive completion cannot double pay.
- [ ] Demand signal stale → bounded fallback.
- [ ] Surge cap enforced under peak load.
- [ ] Cancellation fee and compensation reconcile.
- [ ] Merchant commission change does not alter historical settlement.

---

# PART AA — COURIER PLATFORM LIFECYCLE

> **Goal:** Courier Android bukan hanya job receiver. Supply-side lifecycle harus lengkap dari onboarding, identity/vehicle/capability, availability, offers, earnings, safety, quality, suspension sampai appeal. One courier may have multiple capabilities; capability is never inferred from app installation alone.

## COURIER-2026-001 — Canonical courier profile/onboarding state [P0]

**Recommended domain**
- courier profile ownership in existing backend; create dedicated courier service only if ownership/scale justifies it
- `docs/contracts/courier-lifecycle-2026.md`

**States**
`DRAFT → SUBMITTED → VERIFYING → ACTIVE` with `REJECTED`, `NEEDS_UPDATE`, `SUSPENDED`, `DEACTIVATED` as applicable.

**Checklist**
- [ ] Profile separates identity, contact, market, home/operating zones, capabilities, vehicle and verification status.
- [ ] Activation is server authoritative.
- [ ] Required onboarding differs by market/service capability.

---

## COURIER-2026-002 — Identity, document and vehicle verification [P0]

**Checklist**
- [ ] Document type/expiry/verification source/status modeled.
- [ ] Vehicle make/model/type/plate/capacity attributes structured.
- [ ] Expired/revoked document changes eligibility through policy, not client toggle.
- [ ] Sensitive documents use compliance storage/access/retention controls.
- [ ] Reverification reminders use Communication platform.

---

## COURIER-2026-003 — Capability certification matrix [P0]

**Capabilities examples**
- Food
- Paket On-Demand
- Tambal Ban motor
- Tambal Ban mobil
- Towing motor
- Towing mobil

**Checklist**
- [ ] Capability has status, evidence/certification, effective/expiry and market scope.
- [ ] Matching always checks capability server-side.
- [ ] UI shows why capability unavailable and remediation path.
- [ ] Capability can be paused/suspended independently when appropriate.

---

## COURIER-2026-004 — Availability / online / work-state contract [P0]

**Checklist**
- [ ] Online state separate from active-job state.
- [ ] Stale heartbeat/location transitions courier to unavailable by policy.
- [ ] Break/offline/limited capability state explicit.
- [ ] App restart/network loss snapshot-recovers current job before accepting another.
- [ ] One courier cannot accept incompatible simultaneous jobs outside batching policy.

---

## COURIER-2026-005 — Offer lifecycle, acceptance and fairness [P0/P1]

**Checklist**
- [ ] Offer has id/expiry/service/route/earning/proof/capability requirements.
- [ ] Accept race atomic and idempotent.
- [ ] Expired offer cannot create ghost assignment.
- [ ] Offer strategy/rule version logged.
- [ ] Acceptance/cancellation performance signals do not create unexplained permanent lockout; policy documented.

---

## COURIER-2026-006 — Earnings, wallet, payout and statement [P0]

**Integration**
- `payment-service`
- `ECON-*`

**Checklist**
- [ ] Per-job earning breakdown immutable after settlement except compensating adjustment.
- [ ] Wallet available/pending/held/withdrawn states explicit.
- [ ] Payout/disbursement idempotent.
- [ ] Statement shows order/incentive/adjustment/tax/fee separately.
- [ ] Courier cannot withdraw promotional/non-withdrawable balance accidentally.

---

## COURIER-2026-007 — Incentives and supply education [P1]

**Checklist**
- [ ] Incentive progress/readiness shown clearly.
- [ ] Dynamic educational/operational modules may use App Experience but cannot alter job state.
- [ ] Zone demand insight labeled estimate and freshness/source indicated.
- [ ] Gamification does not encourage unsafe driving.

---

## COURIER-2026-008 — Performance/quality scorecard [P1]

**Metrics may include**
- completion
- preventable cancellation
- pickup/delivery SLA
- proof quality
- customer/merchant rating
- safety/support incidents after review

**Checklist**
- [ ] Metric definition/window visible to courier where used for enforcement.
- [ ] One anomalous rating does not automatically cause opaque punishment.
- [ ] Quality score versioned and appealable for material decisions.
- [ ] Service-specific metrics separated where needed.

---

## COURIER-2026-009 — Suspension, restriction and appeal [P0/P1]

**Checklist**
- [ ] Enforcement can target account, market or capability with reason/effective period.
- [ ] Active job safe completion/reassignment policy before immediate suspension where possible.
- [ ] Courier sees actionable reason category unless disclosure would compromise investigation/security.
- [ ] Appeal/review timeline audited.
- [ ] Reinstatement restores only approved capabilities.

---

## COURIER-2026-010 — Courier Support + Safety integration [P0]

**Checklist**
- [ ] Active-job help routes to correct operational/safety queue.
- [ ] Courier can report merchant/customer/location/service issue structurally.
- [ ] Support actions use domain APIs for reassign/cancel/compensation.
- [ ] Evidence/chat/location references available according to role.

---

## COURIER-2026-011 — Multi-market/localization/working eligibility [P1]

**Checklist**
- [ ] Courier cannot simply switch country/market when regulatory verification differs.
- [ ] Market-specific vehicle/document/tax/payout requirements configurable.
- [ ] Currency/timezone/localized earnings statement correct.
- [ ] Cross-border working eligibility explicitly modeled if ever supported.

---

## COURIER-2026-012 — Courier lifecycle E2E release gate [P0]

**Mandatory scenarios**
- [ ] Apply → verify → capability activate → go online → receive eligible offer → complete → earn → withdraw.
- [ ] Expired document disables only applicable work according to policy.
- [ ] Wrong vehicle/capability offer rejected server-side.
- [ ] Offline/restart recovers active job.
- [ ] Suspension/appeal/reinstatement audited.
- [ ] Safety incident does not disappear when job state changes.

---

# PART AB — MERCHANT PLATFORM LIFECYCLE

> **Goal:** Merchant Food menjadi complete business platform: KYB, branch/staff, catalog, operating state, orders, finance, Promo, Ads, quality, integrations, suspension dan support. Existing `backend/merchant-service/` remains primary ownership unless a domain genuinely separates.

## MERCH-2026-001 — KYB/onboarding/contract lifecycle [P0/P1]

**Checklist**
- [ ] Merchant legal profile, owner/operator, market, verification, bank/payout and commercial-contract references structured.
- [ ] `DRAFT/SUBMITTED/VERIFYING/ACTIVE/REJECTED/SUSPENDED` lifecycle.
- [ ] Verification requirement market scoped.
- [ ] Commercial terms have effective version/date.
- [ ] Activation cannot be self-toggled from Merchant app.

---

## MERCH-2026-002 — Branch + staff/device RBAC [P0/P1]

**Checklist**
- [ ] Merchant account can own multiple branches.
- [ ] Staff roles: owner/manager/kitchen/cashier/marketing/finance as appropriate.
- [ ] Branch/device session permissions server enforced.
- [ ] Staff removal/revocation propagates promptly.
- [ ] High-risk bank/payout/config changes require stronger authentication/approval.

---

## MERCH-2026-003 — Catalog quality, inventory and menu governance [P0/P1]

**Checklist**
- [ ] Item/category/variant/modifier/image/status schemas canonical.
- [ ] Inventory/sold-out/schedule integrates `FOOD-2026-012/015`.
- [ ] Invalid/misleading prohibited item moderation path.
- [ ] Catalog change version/event feeds Search index.
- [ ] Bulk edit/import has per-row validation and rollback/retry safety.

---

## MERCH-2026-004 — Operating state/readiness capability [P0]

**Checklist**
- [ ] Open/closed/busy/paused/temp-closed/holiday states distinct.
- [ ] Busy modifies prep capacity/ETA; Pause stops new orders.
- [ ] Scheduled state changes timezone aware.
- [ ] Admin/support override reasoned/audited.
- [ ] Search/Ads eligibility reacts to authoritative operating state.

---

## MERCH-2026-005 — Settlement, finance statement and bank-account lifecycle [P0]

**Checklist**
- [ ] Order sales, commission, tax, promo subsidy, refund, Ads spend, adjustment and payout separated.
- [ ] Bank account change protected by auth/risk/cooldown policy as applicable.
- [ ] Settlement discrepancy queue.
- [ ] Historical statement immutable; corrections via adjustment entries.
- [ ] Multi-currency/market support from `GLOB-2026-002`.

---

## MERCH-2026-006 — Merchant quality / operational score [P1]

**Possible inputs**
- acceptance/timeout
- prep accuracy
- item unavailable
- customer review
- refund/cancel
- safety/policy issues after review

**Checklist**
- [ ] Quality score is not just star rating.
- [ ] Metric/version/window documented.
- [ ] Quality can gate Ads/search eligibility only through explicit policy.
- [ ] Appeal/review path for material enforcement.

---

## MERCH-2026-007 — Promo / Ads / organic ranking boundary [P0/P1]

**Checklist**
- [ ] Merchant UI has separate `Promo` and `Iklan` products.
- [ ] Promo changes financial offer; Ads purchases eligible visibility; organic ranking remains independent.
- [ ] Ads creative cannot fake discount/ETA/rating.
- [ ] Merchant sees attributable paid vs organic performance separately.

---

## MERCH-2026-008 — Suspension, policy enforcement and appeal [P0/P1]

**Checklist**
- [ ] Enforcement scope can be merchant/branch/item/Ads capability.
- [ ] Active orders have safe fulfillment/cancellation policy before branch deactivation.
- [ ] Reason/evidence/actor/effective period audited.
- [ ] Merchant receives remediation/appeal path where appropriate.

---

## MERCH-2026-009 — POS/KDS/integration platform readiness [P1/P2]

**Checklist**
- [ ] External integration uses capability adapter + idempotency + health.
- [ ] Catalog/inventory ownership conflict rules explicit.
- [ ] POS ack failure cannot make customer believe order accepted when merchant never received it.
- [ ] Integration reconciliation/health visible to Merchant/Admin.

---

## MERCH-2026-010 — Merchant lifecycle E2E release gate [P0/P1]

**Mandatory scenarios**
- [ ] Onboard → verify → branch setup → catalog → open → receive order → prepare → settle.
- [ ] Busy/Pause/Search/Ads eligibility consistent.
- [ ] Staff unauthorized finance action rejected.
- [ ] Catalog event updates Search without bypassing checkout truth.
- [ ] Settlement/refund/Ads charges reconcile.
- [ ] Suspension safely handles active orders and appeal.

---

# PART AC — MOBILE RELIABILITY & RELEASE ENGINEERING

> **Goal:** global marketplace tidak boleh dinilai hanya dari backend. Customer/Courier/Merchant Android harus punya measurable crash, ANR, startup, memory, battery, network, offline, size dan release-quality budgets.

## MOBILE-2026-001 — Mobile performance budgets [P0]

**Recommended docs**
- `docs/mobile/performance-budgets.md`
- `docs/mobile/device-support-matrix.md`

**Metrics**
- crash-free sessions/users
- ANR rate
- cold/warm startup
- frame jank
- memory peak
- battery/location cost
- network bytes/request count
- APK/AAB/download size

**Checklist**
- [ ] Budgets defined per app/surface and measured on representative low/mid/high device tiers.
- [ ] Regression threshold gates release, not dashboard-only observation.
- [ ] Performance target uses percentile, not only average.

---

## MOBILE-2026-002 — Crash/ANR observability and symbolication [P0]

**Checklist**
- [ ] Crash/ANR linked to app version, device/OS, market, screen/feature flag/experience revision where safe.
- [ ] Release artifact has mapping/symbol metadata retained.
- [ ] PII/secrets excluded from crash logs.
- [ ] Critical regression can stop staged rollout.

---

## MOBILE-2026-003 — Startup architecture and first-usable-screen budget [P0]

**Checklist**
- [ ] Startup critical path measured.
- [ ] Remote config/campaign/analytics do not block first usable screen.
- [ ] Lazy initialize non-critical SDKs.
- [ ] Startup offline uses packaged/LKG config.
- [ ] Startup trace identifies slow dependency.

---

## MOBILE-2026-004 — Battery, location, background work and memory [P0]

**Checklist**
- [ ] Customer app does not run continuous background location without active justified use.
- [ ] Courier active-job location frequency adapts to lifecycle/accuracy/battery policy.
- [ ] Background workers obey OS constraints/backoff.
- [ ] Large images/maps/animations use bounded memory/cache.
- [ ] Leak detection/testing in development/CI where practical.

---

## MOBILE-2026-005 — Network resilience/data saver/offline contract [P0]

**Checklist**
- [ ] API timeout/retry/cancellation policy shared.
- [ ] Safe GET/snapshot caching separated from mutation queue.
- [ ] Mutation retry only for idempotent/safe operations.
- [ ] Data saver reduces campaign/media prefetch.
- [ ] Slow/offline state has explicit UI and recovery.

---

## MOBILE-2026-006 — App size and modular delivery discipline [P1]

**Checklist**
- [ ] Track APK/AAB/module size per release.
- [ ] Remove duplicate icon/image/font/SDK dependencies.
- [ ] Large optional features evaluated for modular/on-demand delivery if platform supports and complexity justified.
- [ ] Do not trade transaction reliability for aggressive dynamic code delivery.

---

## MOBILE-2026-007 — Device/OS/form-factor compatibility matrix [P0/P1]

**Checklist**
- [ ] Define minimum/target Android versions from actual market/device data.
- [ ] Test low-memory/low-end, mid-range, flagship, tablet/foldable where supported.
- [ ] Permission behavior across OS versions tested.
- [ ] Dark/Light/System + dynamic text + rotation/resume/process death scenarios.
- [ ] Unsupported device gets clear compatibility handling.

---

## MOBILE-2026-008 — Staged store release + rollback/compatibility [P0]

**Checklist**
- [ ] Internal → alpha/beta → percentage production rollout.
- [ ] Crash/ANR/payment/create-order guardrails evaluated before increasing percentage.
- [ ] Backend remains backward compatible during rollout window.
- [ ] Bad app version can be soft/hard gated according to `APP-2026-015` while preserving active-order/support recovery.
- [ ] Release notes/artifact/version traceable to commit/config schema.

---

## MOBILE-2026-009 — Client telemetry and privacy-safe performance tracing [P0/P1]

**Checklist**
- [ ] Screen/API/startup/frame metrics use governed event names.
- [ ] Trace links client request to backend correlation id where practical.
- [ ] User content/PII not embedded in metric labels.
- [ ] High-cardinality dimensions controlled.

---

## MOBILE-2026-010 — Mobile release acceptance suite [P0]

**Mandatory scenarios**
- [ ] Fresh install/offline launch.
- [ ] Upgrade from minimum supported prior version.
- [ ] Process death during active order then recovery.
- [ ] Network switch/loss during payment/order tracking.
- [ ] Low-memory/background resume.
- [ ] Dynamic Experience revision fallback.
- [ ] Performance budget and accessibility/golden tests green on representative matrix.

---

# PART AD — SECURITY ENGINEERING & SOFTWARE SUPPLY CHAIN

> **Goal:** `SEC-*` transactional controls diperluas menjadi secure software-delivery program. Security harus mencakup secrets, service identity, dependencies, build provenance, container/image, infrastructure, WAF/DDoS, vulnerability management dan incident response.

## SECPLAT-2026-001 — Threat-model program per critical domain [P0]

**Recommended docs**
- `docs/security/threat-model-order.md`
- `docs/security/threat-model-payment.md`
- `docs/security/threat-model-auth.md`
- `docs/security/threat-model-admin.md`
- `docs/security/threat-model-provider-webhooks.md`

**Checklist**
- [ ] Identify assets/trust boundaries/attackers/abuse cases/controls.
- [ ] Re-review after material architecture/payment/auth/provider changes.
- [ ] High-risk threat has owner/remediation/test.
- [ ] Threat model includes insider/admin misuse, not internet attacker only.

---

## SECPLAT-2026-002 — Secrets/KMS/key rotation [P0]

**Checklist**
- [ ] Production secrets stored in managed secret/KMS mechanism, not repository/env files committed to source.
- [ ] Provider/payment/webhook keys have owner, rotation schedule and revocation procedure.
- [ ] Application logs never print secret values.
- [ ] Rotation can overlap old/new credential safely where provider supports it.
- [ ] Emergency credential compromise runbook tested.

---

## SECPLAT-2026-003 — Service-to-service identity and least privilege [P0]

**Checklist**
- [ ] Internal request identity authenticated; network location alone is insufficient trust.
- [ ] mTLS/workload identity/signed service credentials selected based on infra.
- [ ] Service scopes restrict actions, especially payment/refund/admin/provider mutation.
- [ ] Credential lifetime minimized and rotated.
- [ ] Internal auth failures observable without logging secrets.

---

## SECPLAT-2026-004 — Encryption and data classification enforcement [P0]

**Checklist**
- [ ] TLS in transit for external/internal sensitive paths.
- [ ] At-rest encryption for databases/object storage/backups according to data class.
- [ ] PII/sensitive/financial/safety evidence classification from `GLOB-2026-005` enforced in access/retention.
- [ ] Backup encryption/key recovery procedure tested.

---

## SECPLAT-2026-005 — SAST/SCA/secrets scanning/SBOM [P0]

**Recommended CI controls**
- static analysis
- dependency CVE scanning
- secret scanning
- license policy
- SBOM generation

**Checklist**
- [ ] Critical/high vulnerability has remediation SLA and exception process.
- [ ] CI blocks known leaked secret patterns.
- [ ] SBOM stored per release artifact.
- [ ] Dependency upgrade test covers customer/merchant/courier/backend critical paths.

---

## SECPLAT-2026-006 — Build provenance, artifact/container signing [P0/P1]

**Checklist**
- [ ] Production artifact built by controlled CI from traceable commit.
- [ ] Container/image digest immutable in deployment manifest.
- [ ] Artifact/image signing or equivalent provenance verification adopted as infrastructure matures.
- [ ] Deployment does not pull mutable `latest` for critical service.
- [ ] Rollback artifact remains available and verifiable.

---

## SECPLAT-2026-007 — Edge security, WAF, DDoS and abuse rate limits [P0]

**Checklist**
- [ ] Public API inventory and rate-limit policy by endpoint/client risk.
- [ ] OTP/login/search/geocode/quote/tracking/webhook endpoints protected appropriately.
- [ ] WAF/DDoS controls do not block provider callbacks without tested allow/verification strategy.
- [ ] Abuse protection has fail-safe for active order/payment recovery.

---

## SECPLAT-2026-008 — Vulnerability management + penetration testing [P0/P1]

**Checklist**
- [ ] Vulnerability intake, severity, owner, SLA and retest process.
- [ ] Regular external/internal penetration test before major expansion/payment changes.
- [ ] Scope includes mobile API, web, admin, auth, payment, provider webhooks.
- [ ] Security findings tracked to closure with evidence.

---

## SECPLAT-2026-009 — Security incident response [P0]

**Recommended runbook**
- `docs/runbooks/security-incident.md`

**Checklist**
- [ ] Severity/classification, incident commander, containment, credential rotation, evidence preservation and communication defined.
- [ ] Audit logs centralized/immutable enough for investigation.
- [ ] Data breach/privacy notification obligations mapped per market.
- [ ] Tabletop drill performed before multi-country launch.

---

## SECPLAT-2026-010 — Privileged Admin/PAM controls [P0]

**Checklist**
- [ ] Admin high-risk actions require strong authentication/session controls.
- [ ] Least privilege/RBAC and maker-checker for global finance/config/safety changes.
- [ ] Break-glass account tightly controlled, alerted and audited.
- [ ] Privileged session/action logging retention policy.
- [ ] No shared super-admin credential.

---

## SECPLAT-2026-011 — Compliance/security evidence program [P1]

**Checklist**
- [ ] Keep evidence for access review, key rotation, vulnerability scan, backup restore, incident drill, change approval and vendor review.
- [ ] PCI/ISO/SOC or local regulatory program pursued only when business/market requires it; architecture should support evidence without checkbox theater.
- [ ] Vendor/provider security risk reviewed for payment/maps/logistics/communication critical dependencies.

---

## SECPLAT-2026-012 — Security release gate [P0]

**Checklist**
- [ ] No unresolved critical vulnerability/secret leak.
- [ ] AuthZ negative tests green.
- [ ] Webhook replay/signature tests green.
- [ ] Dependency/SBOM scan attached to release.
- [ ] Backup/restore and security incident contact current.
- [ ] High-risk exception has explicit owner/expiry/approval.

---

# PART AE — REPUTATION, REVIEWS & MODERATION PLATFORM

> **Goal:** star rating bukan satu-satunya trust signal. Customer, courier, merchant and provider quality use contextual, versioned reputation signals. Enforcement must separate unverified allegation, measured performance and reviewed safety/policy findings.

## REP-2026-001 — Canonical cross-actor reputation signal model [P1]

**Recommended files**
- `backend/reputation-service/internal/domain/signal.go` when extraction justified
- `backend/reputation-service/internal/domain/reputation_snapshot.go`
- `docs/contracts/reputation-2026.md`

**Checklist**
- [ ] Signal has subject, source, service, market, time, confidence/review status and version.
- [ ] Raw signals immutable; aggregate snapshot recomputable/versioned.
- [ ] Sensitive safety/risk reason not exposed through public rating.

---

## REP-2026-002 — Multi-dimensional ratings [P1]

**Examples**
- Food quality vs delivery quality
- courier professionalism vs delivery condition
- technician repair quality
- towing handling/vehicle condition

**Checklist**
- [ ] Rating tied to completed eligible transaction.
- [ ] One order cannot submit unlimited duplicate rating.
- [ ] Rating edit window/version policy explicit.
- [ ] Public aggregate requires sufficient sample/privacy policy.

---

## REP-2026-003 — Review moderation and merchant response [P1]

**Checklist**
- [ ] Report review categories and moderation state.
- [ ] Spam/harassment/PII/prohibited content handling.
- [ ] Merchant response is clearly identified and cannot edit customer review.
- [ ] Moderation action reason/audit/appeal where appropriate.

---

## REP-2026-004 — Retaliation, coercion and rating abuse protection [P0/P1]

**Checklist**
- [ ] Detect reciprocal/coordinated rating abuse where signals justify.
- [ ] Courier/merchant cannot require a rating before completing service.
- [ ] Customer cannot use rating threat to demand off-platform compensation without support path.
- [ ] Suspected abuse feeds Risk/Moderation, not automatic hidden punishment only.

---

## REP-2026-005 — Quality score separate from star rating [P1]

**Checklist**
- [ ] Merchant/courier quality may combine operational metrics, reviews and verified incidents.
- [ ] Formula/rule version logged.
- [ ] Quality score used for Ads/Search/matching only through explicit policy.
- [ ] Cold-start handling prevents impossible “no history = bad” assumption.

---

## REP-2026-006 — Enforcement and appeal integration [P0/P1]

**Checklist**
- [ ] Material restriction references reviewed evidence/signal set.
- [ ] Unverified report can trigger investigation/temporary safety action but is not silently permanent truth.
- [ ] Appeal records reviewer/outcome/reason.
- [ ] Reversed enforcement recomputes relevant reputation state.

---

## REP-2026-007 — Admin moderation/control plane [P1]

**Recommended pages**
- `admin-dashboard/src/pages/reputation/Reviews.tsx`
- `admin-dashboard/src/pages/reputation/ModerationQueue.tsx`
- `admin-dashboard/src/pages/reputation/ReputationDebug.tsx`

**Checklist**
- [ ] Search/filter by actor/order/service/market/status.
- [ ] Moderation action RBAC/audit.
- [ ] Privacy-safe view of why aggregate changed.
- [ ] No direct arbitrary star-rating overwrite by ordinary admin.

---

## REP-2026-008 — Reputation analytics/model governance [P1]

**Checklist**
- [ ] Monitor score distribution/fairness/drift by market/service.
- [ ] ML-assisted moderation/ranking has human review/fallback for material enforcement.
- [ ] Model/rule version and feature provenance logged.
- [ ] Sensitive/protected attributes excluded unless explicitly lawful/necessary.

---

## REP-2026-009 — Reputation E2E gate [P1]

**Mandatory scenarios**
- [ ] Completed Food order submits separate food/delivery rating.
- [ ] Duplicate rating rejected/deduped.
- [ ] Reported review enters moderation without disappearing silently.
- [ ] Verified abuse affects quality only through policy/version.
- [ ] Successful appeal removes/reverses enforcement effect as designed.

---

# PART AF — LOYALTY, CRM, REFERRAL & MEMBERSHIP PLATFORM

> **Goal:** retention/growth menjadi cross-service platform, bukan voucher logic tersebar di Food. Loyalty value, referral liability, membership entitlement and CRM communication must reconcile with Finance, Promo, Risk and Communication.

## CRM-2026-001 — Loyalty account + immutable points/benefit ledger [P1/P2]

**Recommended module/service when product launches**
- `backend/loyalty-service/internal/domain/account.go`
- `backend/loyalty-service/internal/domain/ledger.go`
- `backend/loyalty-service/internal/service/loyalty_service.go`

**Checklist**
- [ ] Earn/redeem/expire/reverse are ledger entries.
- [ ] Points/benefits are not confused with withdrawable cash.
- [ ] Currency-equivalent benefit liability explicit when applicable.
- [ ] Duplicate order event cannot double earn.

---

## CRM-2026-002 — Cross-service referral program + anti-abuse [P1/P2]

**Checklist**
- [ ] Referral code/invite attribution immutable after defined rule/window.
- [ ] Reward conditions server authoritative.
- [ ] Self-referral/device/payment/address abuse signals integrate Risk.
- [ ] Reward budget/subsidy reconciled.
- [ ] Market eligibility and legal copy configurable.

---

## CRM-2026-003 — Membership / subscription entitlement platform [P2]

**Integration**
- evolves `FOOD-2026-021` into cross-service entitlement

**Checklist**
- [ ] Membership plan/version/market/currency/billing cycle/benefit catalog.
- [ ] Benefit eligibility authoritative per order/service.
- [ ] Free-delivery/subsidy cost attributed correctly.
- [ ] Cancel/renew/grace/refund states explicit.
- [ ] Payment failure does not leave ghost entitlement.

---

## CRM-2026-004 — Lifecycle CRM campaign orchestration [P1/P2]

**Campaign examples**
- onboarding
- activation
- repeat purchase
- win-back
- service cross-sell
- merchant/courier education where appropriate

**Checklist**
- [ ] CRM targeting uses governed non-sensitive segments and consent.
- [ ] Delivery through Communication Platform.
- [ ] UI exposure may use Experience Service.
- [ ] Frequency caps across overlapping campaigns.
- [ ] Conversion/holdout measured through Experiment/Data platform.

---

## CRM-2026-005 — Voucher/promo budget and stacking policy [P0/P1]

**Checklist**
- [ ] Define stack/exclusion priority across platform promo, merchant promo, membership, loyalty and referral credit.
- [ ] Pricing backend calculates final eligible discount.
- [ ] Budget/quota reservation concurrency safe.
- [ ] Refund/cancel reverses liability consistently.
- [ ] Client cannot compose unsupported promo stack.

---

## CRM-2026-006 — Churn/win-back personalization privacy guardrails [P1/P2]

**Checklist**
- [ ] Churn/propensity score is recommendation signal, not sensitive enforcement.
- [ ] Consent/personalization policy market scoped.
- [ ] Non-personalized campaign fallback.
- [ ] User can control optional marketing communication.
- [ ] Do not expose inferred user segment to merchant.

---

## CRM-2026-007 — Merchant-funded/co-funded campaign accounting [P1/P2]

**Checklist**
- [ ] Platform-funded vs merchant-funded vs co-funded amount explicit.
- [ ] Merchant agreement/budget version referenced.
- [ ] Promo subsidy separated from Ads spend.
- [ ] Settlement statement reconciles contribution per order.

---

## CRM-2026-008 — CRM/Loyalty Admin control plane [P1]

**Recommended pages**
- `admin-dashboard/src/pages/crm/Campaigns.tsx`
- `admin-dashboard/src/pages/crm/Loyalty.tsx`
- `admin-dashboard/src/pages/crm/Referrals.tsx`
- `admin-dashboard/src/pages/crm/Memberships.tsx`
- `admin-dashboard/src/pages/crm/PromoBudgets.tsx`

**Checklist**
- [ ] Draft/preview/audience/budget/schedule/approval/stop.
- [ ] Estimated audience is not guaranteed conversion.
- [ ] Sensitive targeting dimensions unavailable.
- [ ] Financial campaign changes maker-checker where material.

---

## CRM-2026-009 — CRM experimentation and incrementality [P2]

**Checklist**
- [ ] Holdout/control supported for major subsidy campaigns where practical.
- [ ] Measure incremental orders/revenue, not redeemed coupon only.
- [ ] Guardrail margin/refund/support/spam complaints.
- [ ] Experiment cannot bypass promo financial limits.

---

## CRM-2026-010 — Loyalty/referral finance and reconciliation [P1/P2]

**Checklist**
- [ ] Outstanding loyalty/referral/membership liability measurable.
- [ ] Earn/redeem/reversal ↔ order/payment/refund reconciliation.
- [ ] Expiry/breakage accounting policy documented with Finance/legal.
- [ ] Manual credit uses reasoned ledger adjustment.

---

## CRM-2026-011 — CRM/Loyalty E2E gate [P1/P2]

**Mandatory scenarios**
- [ ] Qualifying order earns once.
- [ ] Cancel/refund reverses according to policy.
- [ ] Referral abuse blocked/reviewed.
- [ ] Membership benefit applies only while entitlement valid.
- [ ] Overlapping promo stack respects canonical priority/budget.
- [ ] Marketing opt-out respected across CRM channels.

---

# PART AG — BLUEPRINT → REALITY: GLOBAL MARKETPLACE EXECUTION GATES

> **Purpose:** memastikan master task ini menghasilkan platform nyata, bukan “architecture checklist theater”. Sebuah capability tidak dianggap selesai hanya karena service/file/diagram dibuat. Production evidence, operations, financial reconciliation, reliability and actual user/courier/merchant journey are required.

## REALITY-2026-001 — Platform capability/ownership registry [P0]

**Recommended docs**
- `docs/architecture/platform-capability-map.md`
- `docs/architecture/service-ownership-map.md`

**Checklist**
- [ ] Map every capability to source-of-truth owner, API/event contract, storage owner, operational owner and dependent surfaces.
- [ ] Identify duplicate sources of truth before new implementation.
- [ ] Customer/Merchant/Courier/Admin ownership explicitly included, not backend only.
- [ ] Critical capability has named on-call/operational responsibility before production.

---

## REALITY-2026-002 — Modular-first / microservice extraction threshold [P0 architecture guardrail]

**Rule**
Start with clean bounded modules in existing services when ownership and scale permit. Extract to a separate service only when one or more are materially true:
- independent scaling need
- independent availability/failure domain
- separate security/compliance boundary
- clear team/ownership boundary
- deployment cadence conflict
- data/storage model materially independent

**Checklist**
- [ ] New microservice PR documents why existing service/module is insufficient.
- [ ] Extraction includes contract, migration, observability, deployment, rollback and ownership plan.
- [ ] Avoid distributed transaction complexity unless business benefit justifies it.
- [ ] No service created only because another global company has one.

---

## REALITY-2026-003 — Evidence-based Definition of Done [P0]

**Task may close only with applicable evidence**
- implementation PR/commit
- unit/integration/contract tests
- E2E/staging run
- migration/backfill evidence
- dashboard/alert/SLO
- runbook
- security/privacy review
- financial reconciliation evidence
- design/accessibility acceptance
- rollback/recovery validation

- [ ] Documentation-only work may close documentation task, but not implementation capability task.
- [ ] “Endpoint exists” is insufficient if client/ops flow is unwired.
- [ ] “Screen exists” is insufficient if backend still mocks/fabricates truth.

---

## REALITY-2026-004 — Environment promotion model [P0]

**Target environments**
`local/dev → integration → staging → pre-production/sandbox-live-like → production`

**Checklist**
- [ ] Environment config/secrets/provider endpoints isolated.
- [ ] Production data is not casually copied into lower environment.
- [ ] Migrations rehearsed on production-like schema volume.
- [ ] Payment/logistics/maps provider sandbox→production cutover documented.
- [ ] Feature flags/canary control release independently from code deployment when applicable.

---

## REALITY-2026-005 — Production Readiness Review per critical capability [P0]

**Review questions**
- owner/on-call?
- SLO/alerts?
- capacity?
- dependency outage behavior?
- data backup/restore?
- security/privacy?
- idempotency/concurrency?
- financial reconciliation?
- admin/support recovery?
- rollback/kill switch?

- [ ] No P0 critical capability launches solely from feature team sign-off.
- [ ] Review outcome/action owners recorded.
- [ ] Known risk has explicit acceptance/expiry, not permanent “temporary” workaround.

---

## REALITY-2026-006 — Scale/capacity tiers driven by measured demand [P0/P1]

**Stages**
- internal/dev traffic
- closed beta/single area
- city production
- multi-city
- national
- multi-country
- multi-region

**Checklist**
- [ ] Each stage has projected peak QPS/order concurrency/socket/location events/provider callbacks and storage growth.
- [ ] Load tests use next-stage forecast + safety margin, not arbitrary impressive number.
- [ ] Database/queue/cache/provider quotas evaluated before stage promotion.
- [ ] Capacity result includes cost and bottleneck, not pass/fail only.

---

## REALITY-2026-007 — City/market launch control room [P0]

**Required launch views**
- create-order/payment success
- courier supply/match/no-supply
- merchant acceptance/prep
- ETA/SLA
- provider health
- cancellation/refund
- support/safety queue
- reconciliation mismatch
- crash/ANR

**Checklist**
- [ ] Launch-day owner for Product/Ops/Engineering/Finance/Support/Safety.
- [ ] Kill switches and rollback owners known.
- [ ] Metric threshold defines pause/rollback/escalation.
- [ ] Market launch retrospective updates master blueprint/runbooks.

---

## REALITY-2026-008 — Mandatory failure/operations drills [P0]

**Drills**
- payment provider outage
- map provider outage
- carrier API/webhook outage
- Redis/queue degradation
- database failover/restore
- notification outage
- bad App Experience revision
- bad mobile release
- safety escalation
- reconciliation mismatch

**Checklist**
- [ ] Drill produces timestamped evidence, gaps, owner and remediation date.
- [ ] Re-run after material remediation.
- [ ] No “we have a runbook” substitute for at least staging/tabletop/production-safe rehearsal according to risk.

---

## REALITY-2026-009 — Cost and unit-economics observability [P1]

**Track by service/market where useful**
- infra cost
- maps/geocode cost
- communication cost
- payment provider cost
- carrier integration cost
- promo subsidy
- courier incentives
- support cost proxy
- contribution margin

**Checklist**
- [ ] Cost metric linked to actual usage units.
- [ ] Growth experiment cannot ignore exploding provider/infra cost.
- [ ] Cost anomaly alerting for unexpected provider/traffic spike.
- [ ] Financial truth comes from ledger/provider invoice reconciliation where applicable.

---

## REALITY-2026-010 — Quarterly platform maturity scorecard [P1]

**Dimensions**
- transaction correctness
- reliability/SRE
- security/privacy
- mobile quality
- marketplace liquidity
- payment/finance
- support/safety
- developer velocity
- global configuration/compliance
- cost efficiency

**Checklist**
- [ ] Score backed by measurable evidence, not feature count.
- [ ] Red area creates prioritized remediation task.
- [ ] Benchmark competitors only for capability principles/public expectations; internal maturity target remains LANCAR-defined.

---

## REALITY-2026-011 — No fake completeness gate [P0]

- [ ] A task cannot be marked complete because recommended file exists with stub/TODO.
- [ ] Mock/static/fake success prohibited from production path.
- [ ] Admin GUI requirement is not satisfied by raw API/Postman.
- [ ] “ML-ready” is not satisfied by an empty model-service shell.
- [ ] “Multi-country” is not satisfied by locale dropdown while currency/tax/payment/compliance remain Indonesia-only.
- [ ] “Multi-region” is not satisfied by deploying same stateless API twice while data/failover semantics remain undefined.

---

## REALITY-2026-012 — Global marketplace milestone order [P0 program plan]

**Milestone 0 — Transaction truth**
- CORE P0
- Paket/Food/Tambal/Towing/Aggregator P0
- payment/reconciliation/proof/idempotency/state correctness

**Milestone 1 — Indonesia production marketplace**
- Courier/Merchant lifecycle P0
- Search/Communication/Geo core
- Safety/Support
- mobile reliability/security
- Admin/Ops control planes

**Milestone 2 — Marketplace optimization**
- economics/incentives
- organic ranking/personalization
- Ads
- experimentation
- loyalty/CRM
- marketplace intelligence

**Milestone 3 — Multi-market platform**
- market config
- multi-currency/tax/payment method orchestration
- compliance/localization
- provider abstraction
- market launch gate

**Milestone 4 — Multi-region/global resilience**
- data residency
- regional failover
- global SRE/capacity/chaos
- developer platform
- global support/safety operations

- [ ] Do not move to a milestone merely because previous tasks are coded; mandatory release/evidence gates must be green.
- [ ] Product expansion can run in parallel only where it does not compromise P0 transaction/safety/finance work.

---

# GLOBAL MARKETPLACE PLATFORM IMPLEMENTATION ORDER — CONSOLIDATED

1. Finish **Milestone 0 transaction truth**: CORE + five vertical P0 + Aggregator fake-success/provider truth + payment/reconciliation/proof/idempotency.
2. Build shared **Geo + Communication + Search baseline**, because almost every super-app experience depends on them.
3. Complete **Courier + Merchant lifecycle P0**, so marketplace supply is governed rather than treated as screens only.
4. Complete **Trust & Safety + Support + Security + Mobile Reliability P0** before broad public scale.
5. Harden **Payment Orchestration** on the existing `backend/payment-service/`; do not fork payment truth.
6. Implement **Pricing/Economics** with explicit courier/merchant/customer/ledger components.
7. Finish **Design System + Runtime Experience + Admin GUI + WCAG** so product operations can move safely without app rebuild.
8. Establish **Organic Search/Discovery quality** before letting Ads materially influence ranking surfaces.
9. Launch **Commerce Ads** only after inventory, billing, invalid traffic, attribution and organic-health gates are green.
10. Add **Reputation + Experimentation + Marketplace Intelligence** after governed event data is trustworthy.
11. Add **Loyalty/CRM/Membership** with finance/risk/communication integration, not isolated voucher tables.
12. Execute **Multi-market** configuration, money/tax/payment/compliance/localization and market launch drills.
13. Execute **Multi-region** data residency/failover/capacity/chaos only after real market demand justifies it.
14. Promote **External Developer API** after internal contracts and operational SLOs are stable.
15. Use `REALITY-2026-*` evidence gates continuously; architecture is considered real only when production behavior, operations and reconciliation prove it.

# GLOBAL MARKETPLACE PLATFORM FINAL GUARDRAILS

- Build **capabilities**, not competitor clones.
- Keep one authoritative owner for every business truth.
- Prefer modular boundaries before premature service extraction.
- Price, ETA, availability, payment, order state, earnings, provider status and entitlement are always server authoritative.
- Search, Ads, CRM and Experience may influence discovery/presentation; none may fabricate transactional truth.
- Safety and active-order recovery outrank growth/Ads/experiments.
- Payment retry/failover must never create duplicate charge.
- Courier capability and Merchant operating status are server enforced.
- Geo provider abstraction must never turn missing route/ETA into invented values.
- Dynamic/surge pricing is bounded, versioned, explainable enough for support/audit, and financially reconciled.
- Reputation enforcement distinguishes measured fact, reviewed incident and unverified allegation.
- Security controls apply to CI/artifacts/infrastructure/admin, not API auth only.
- Mobile quality is a release gate, not post-launch polish.
- Multi-country means market config + money + tax + payment + compliance + localization + operations; locale alone is insufficient.
- Multi-region means real data/failover semantics and drills; duplicate deployments alone are insufficient.
- No critical task closes without applicable implementation/test/ops/security/financial evidence.
