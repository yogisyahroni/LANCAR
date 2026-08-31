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
- [ ] Canonical `service_category`: `package_on_demand`, `food`, `tambal_ban`, `aggregator`, `towing`.
- [ ] `service_code/service_sub_type` menjadi detail service, bukan pengganti category.
- [ ] Common envelope: id, customer, order state, money state, timestamps, actor ownership, quote id, state version, correlation id.
- [ ] Typed service metadata: parcel facts, food facts, roadside facts, aggregator/provider facts, towing facts.
- [ ] Towing/Tambal required facts tidak hanya hidup di `item_description` free-text.
- [ ] Tambahkan `contract_version` atau equivalent untuk perubahan payload material.
- [ ] Legacy mapper/backfill tidak mengarang data yang tidak diketahui.
- [ ] Unknown/new subtype dirender degraded-safe oleh Android/Web/Courier/Admin.

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
- [ ] Require idempotency key pada semua create-order dan financial mutation applicable.
- [ ] Persist key + actor + operation + request fingerprint + result reference + expiry.
- [ ] Same key/same fingerprint returns original result.
- [ ] Same key/different payload returns conflict.
- [ ] Client mempertahankan key selama retry dari satu user intent.
- [ ] Deduplicate payment callback, refund, payout, carrier webhook/event, AWB create, service adjustment.
- [ ] 10 parallel/repeated creates menghasilkan tepat satu order/financial obligation.

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
- [ ] Quote berisi `quote_id`, service/category, input fingerprint, price components, total, currency, ETA/source, policy/rule version, expiry.
- [ ] Create order consumes valid quote atau returns `REQUOTE_REQUIRED` dengan diff yang dapat ditampilkan.
- [ ] Address/package/cart/provider/courier/voucher/schedule/toll/service change invalidates quote sesuai rule.
- [ ] Client total tidak pernah authoritative.
- [ ] Quote snapshot yang benar-benar dipakai order disimpan untuk audit/support.

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
- [ ] Allowed transition defined per service + actor.
- [ ] Optimistic version/row locking prevents race.
- [ ] Terminal state tidak mundur karena delayed/replayed event.
- [ ] State + audit + required proof/ledger effects transactional.
- [ ] Duplicate event idempotent; invalid transition typed error.
- [ ] Admin override reasoned/audited.

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
- [ ] Model unpaid/pending/paid/refunding/refunded/settled/failed explicitly.
- [ ] Reconcile order total ↔ payment ↔ subsidy/voucher ↔ courier ↔ merchant ↔ carrier ↔ platform ↔ tax ↔ refund.
- [ ] Completed-with-money-mismatch masuk exception queue.
- [ ] Manual correction menggunakan compensating entry, bukan overwrite history.
- [ ] Dashboard filter discrepancy by service/provider/date.

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
- [ ] Proof requirement matrix per service/stage.
- [ ] One-time token binds order + actor + stage + expiry + attempts.
- [ ] Replay/wrong actor/wrong order rejected.
- [ ] Proof immutable after stage final.
- [ ] Completion blocked if mandatory proof missing.

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
- [ ] Event ordering/version contract.
- [ ] Ignore duplicate/older events.
- [ ] Reconnect fetches authoritative snapshot.
- [ ] Push tidak mutasi state authoritative secara buta.
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
- [ ] Standardize `REQUOTE_REQUIRED`, `OUT_OF_SERVICE_AREA`, `NO_COURIER`, `PROVIDER_UNAVAILABLE`, `ITEM_UNAVAILABLE`, `INVALID_TRANSITION`, `PAYMENT_PENDING`, `PROOF_REQUIRED`, `HANDOFF_INVALID`, `SCHEDULE_INVALID`, `CAPABILITY_MISMATCH`, `CARRIER_RATE_EXPIRED`, `CARRIER_EVENT_UNKNOWN`.
- [ ] Error carries correlation id.
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
- [ ] Atomic pickup/dropoff object: id/label/lat/lng/city/postal/receiver/contact/instruction.
- [ ] Saved/manual/pinned address updates coordinates and invalidates quote.
- [ ] Manual text cannot submit without resolved coordinate.
- [ ] Reject `0,0`, stale GPS, out-of-service-area.
- [ ] Final route review before order.

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
- [ ] Weight, dimensions, volumetric weight, quantity, category, item value, fragile/prohibited flags, size tier, receiver, delivery-code policy.
- [ ] Package-fact change forces requote.
- [ ] Android/Web show same authoritative breakdown.

---

## PKG-2026-003 — Create → payment → matching without duplicate assignment [P0]

**Files to edit**
- `android-app-customer/app/src/main/java/com/tembus/customer/data/repository/OrderRepository.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/booking/BookingViewModel.kt`
- `backend/order-service/internal/service/order_create.go`
- `backend/order-service/internal/service/order_matching.go`
- `backend/order-service/internal/handler/order_handler.go`
- `android-app/app/src/main/java/com/tembus/courier/ui/screens/OnDemandOfferScreens.kt`
- `android-app/app/src/main/java/com/tembus/courier/ui/components/OnDemandIncomingOfferSwipePanel.kt`

**Checklist**
- [ ] Create consumes quote + idempotency key.
- [ ] Matching validates capability/vehicle/radius/availability.
- [ ] Two-courier accept race has one atomic winner.
- [ ] No-supply has retry/expand/cancel policy.
- [ ] Reassign does not duplicate payout reservation.

---

## PKG-2026-004 — Pickup verification & custody [P0]

**Files to edit**
- `android-app/app/src/main/java/com/tembus/courier/ui/screens/order/MandatoryPickupChecklist.kt`
- `android-app/app/src/main/java/com/tembus/courier/ui/screens/order/PackageChecklistCard.kt`
- `android-app/app/src/main/java/com/tembus/courier/ui/screens/scan/ScanScreen.kt`
- `android-app/app/src/main/java/com/tembus/courier/ui/screens/order/OnDemandProofPanel.kt`
- `backend/order-service/internal/handler/proof_handler.go`

**Checklist**
- [ ] Arrived precedes pickup verification.
- [ ] Package identity/condition/quantity checked when required.
- [ ] PIN/QR/proof before `picked_up`.
- [ ] Pickup evidence immutable.

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
- [ ] ETA backend sourced.
- [ ] Show GPS staleness.
- [ ] Mask contact by lifecycle/privacy policy.
- [ ] Public tracking token scoped/expiring/revocable.
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
- [ ] POD may require photo/signature/PIN based on service/risk policy.
- [ ] Failed delivery records structured reason + evidence.
- [ ] Recovery options are policy driven: `retry`, `contact receiver`, `return_to_sender`, `cancel`, `support_review`.
- [ ] `return_to_sender` only appears when applicable; do not force every failed delivery into return.
- [ ] Recipient mismatch follows safe handoff rule.
- [ ] Settlement does not finalize without required proof/state invariants.
- [ ] Customer CTA is `Bantuan/Laporkan Masalah/Ajukan Klaim`, not generic marketplace dispute.
- [ ] Internal lost/damaged claim links to LANCAR evidence and operational incident, not external carrier workflow.

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
- [ ] Refresh/back/retry is idempotent.
- [ ] Mobile responsive and keyboard-accessible.
- [ ] Web/Android share price/state semantics.

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
- [ ] Distinguish `Paket Instan` from `Ekspedisi Antar-Kota` by icon/subtitle/ETA/price expectation.
- [ ] Progressive disclosure.
- [ ] Final review: route, package summary, ETA, total, receiver, cancellation policy.
- [ ] History badges are service-aware.

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

- [ ] Atomic address+coordinate destination.
- [ ] Saved/manual/pinned change coordinates.
- [ ] Discovery GPS not silently reused as checkout destination.
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
- [ ] Return itemized total + ETA + expiry.
- [ ] Create consumes quote/requote diff.

## FOOD-2026-003 — Idempotent Food create [P0]

**Files to edit**
- `backend/order-service/internal/service/order_food.go`
- `backend/order-service/internal/handler/food_handler.go`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/food/FoodViewModel.kt`

- [ ] Apply CORE idempotency.
- [ ] Duplicate callback cannot duplicate notification/dispatch/ledger.

## FOOD-2026-004 — Secure merchant handoff [P0]

**Files to edit**
- `backend/order-service/internal/service/order_food.go`
- `backend/order-service/internal/handler/proof_handler.go`
- `android-app-merchant/app/src/main/java/com/tembus/merchant/ui/screens/home/StitchOrdersDashboardScreen.kt`
- `android-app/app/src/main/java/com/tembus/courier/ui/screens/scan/ScanScreen.kt`

- [ ] One-time PIN/QR binds order/merchant/courier or pickup customer/state/expiry.
- [ ] Verify + picked_up atomic.
- [ ] Replay/wrong actor rejected.

## FOOD-2026-005 — Server-authoritative ETA/readiness [P0]

**Files to edit**
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/food/FoodHomeScreen.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/food/MerchantDetailScreen.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/food/FoodCheckoutScreen.kt`
- `backend/order-service/internal/service/order_food.go`
- `backend/order-service/internal/service/matching_service.go`

- [ ] Remove fabricated client ETA.
- [ ] ETA includes prep/supply/pickup travel/traffic/batching/confidence.
- [ ] Measure predicted vs actual.

## FOOD-2026-006 — Contactless end-to-end [P0]

**Files to edit**
- `FoodCheckoutScreen.kt`
- `backend/order-service/internal/domain/order_food.go`
- `backend/order-service/internal/service/order_food.go`
- courier `ProofOfDeliveryScreen.kt`

- [ ] Persist contactless + structured instructions.
- [ ] Courier sees instruction before delivery.
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

- [ ] Least privilege location.
- [ ] Manual/saved address works without location permission.
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
- [ ] Busy extends prep/ETA while accepting orders.
- [ ] Pause stops new orders.
- [ ] Timed busy supported.

## FOOD-2026-012 — Quantity-aware inventory [P1]
- [ ] Stock/sales limit + reset schedule.
- [ ] Atomic reserve/decrement/release.
- [ ] Prevent oversell.

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

- [ ] Origin from validated pickup address/provider location mapping.
- [ ] Destination resolved to canonical/provider-compatible location code.
- [ ] Provider/service list comes from backend capability registry.
- [ ] Provider circuit-open/unavailable not selectable.
- [ ] No production mock city/provider fallback.

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

- [ ] Remove direct browser third-party geocode.
- [ ] Normalize display label separately from city/district/postal/provider code.
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

- [ ] Rate input includes normalized origin/destination, chargeable weight, dimensions, value/category, insurance/COD flags as supported.
- [ ] Persist provider code, native service code/name, optional normalized category, gross/net tariff, ETA/source, rule version, expiry.
- [ ] Preserve native provider service codes such as JNE `REG/YES/...` or J&T equivalents.
- [ ] Do not fabricate ETA. Remove hardcoded fallback such as generic `1-3 hari` unless it comes from explicit provider configuration with provenance.
- [ ] Rate change after review returns requote.

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

- [ ] Final submit calls real create mutation with quote + idempotency key.
- [ ] Persisted order reference before success navigation.
- [ ] Payment/AWB creation sequencing explicit.
- [ ] Refresh/retry rehydrates transaction.
- [ ] API failure cannot show success.

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

- [ ] Per-row validation/error report.
- [ ] Job and child rows idempotent.
- [ ] Partial success visible.
- [ ] Payment binds exact job/order set version.
- [ ] Job resume after refresh, owner scoped.

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
- [ ] AWB creation state defined and idempotent.
- [ ] Support three first-mile modes when provider capability allows: `lancar_pickup`, `provider_pickup`, `customer_dropoff`.
- [ ] Mode comes from provider capability/service option, not hardcoded customer UI.
- [ ] LANCAR first-mile chain of custody proof when LANCAR handles pickup.
- [ ] Carrier handoff records provider/AWB/time/location/evidence/actor.
- [ ] After carrier acceptance, provider events drive external lifecycle.

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

- [ ] Persist event id/hash, raw provider status/code/description/location/timestamp and raw-payload reference before processing.
- [ ] Normalize to canonical statuses but never discard raw values.
- [ ] Provider event dedupe/replay protection.
- [ ] Out-of-order event cannot regress terminal state.
- [ ] Unknown status is stored/observable and shown as safe generic customer state rather than guessed.

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
- [ ] COD shown only when selected provider/service supports it.
- [ ] Return-to-sender lifecycle follows provider status/policy and records fee owner.
- [ ] Lost/damaged claim references carrier, AWB, item value, insurance, provider liability, evidence, claim reference/status.
- [ ] Customer compensation/refund and provider reimbursement never double-credit ledger.
- [ ] LANCAR does not impose one global retry/return SLA across all carriers unless contractually configured per provider.

---

## AGG-2026-009 — Aggregator customer web decision UX [P1]

**Files to edit**
- `frontend/src/app/(portal)/orders/new/aggregator/page.tsx`
- `frontend/src/components/orders/AggregatorWizard.tsx`
- `frontend/src/components/orders/AggregatorForm.tsx`
- `frontend/src/components/orders/AddressPicker.tsx`
- `frontend/src/components/orders/OrderSummary.tsx`

- [ ] Steps: Pickup → Receiver/Package → Compare Carrier → Review & Pay.
- [ ] Carrier cards show provider/service name, ETA/source, chargeable weight, price, capabilities, limitations.
- [ ] First-mile LANCAR vs external-carrier stage visually distinct.
- [ ] Success only after persisted order.

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
- [ ] Every provider has canonical provider id/code/name and declared capability set.
- [ ] Provider that does not support a capability is not forced to fake it.
- [ ] Orchestrator selects operation based on declared capability.
- [ ] Customer-facing provider/service options are generated from backend registry/result.
- [ ] Native provider service code/name is preserved.
- [ ] Provider credentials/config live server-side.
- [ ] Circuit breaker/retry/timeout policy configurable per provider.
- [ ] Adding provider does not require edits in customer Android, customer web, payment core, or generic order detail unless genuinely introducing new UX capability.

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
- [ ] Provider-specific signature/auth verification belongs to provider webhook adapter.
- [ ] Adapter parses native payload into canonical `CarrierEvent`.
- [ ] Webhook-capable provider uses webhook as primary event source where appropriate.
- [ ] Tracking-pull-only provider uses polling worker.
- [ ] Webhook provider may still use periodic pull reconciliation if supported.
- [ ] Provider with neither supported webhook nor pull is surfaced as degraded/manual tracking capability.
- [ ] Central handler routes provider→adapter but does not contain growing provider-specific parsing switch.

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
- [ ] Store `provider_status`, `provider_status_code`, `provider_status_description`, `provider_location`, `provider_timestamp`.
- [ ] Also store normalized LANCAR status.
- [ ] Mapping is provider-specific/configurable/tested.
- [ ] Customer UI can show friendly status plus useful provider detail.
- [ ] Unknown raw status does not get incorrectly coerced to `IN_TRANSIT`.

---

## AGG-2026-013 — Provider onboarding = adapter only, no core rewrite [P0 release gate]

**Recommended new tests/files**
- `backend/integration-gateway/internal/provider/provider_contract_test.go`
- `backend/integration-gateway/internal/provider/provider_fixture_test.go`
- `backend/integration-gateway/internal/provider/testdata/jne/`
- `backend/integration-gateway/internal/provider/testdata/jnt/`
- `docs/runbooks/onboard-logistics-provider.md`

**Checklist**
- [ ] Contract test suite can be reused for a new provider adapter.
- [ ] Fixtures cover rate, create shipment/AWB, tracking, errors, timeout, duplicate event, unknown status.
- [ ] Capability matrix is validated at startup/config load.
- [ ] New provider has health/readiness diagnostics.
- [ ] Onboarding runbook documents credentials, base URL, sandbox/prod, location mapping, service mapping, webhook route/signature, polling, SLA source, COD/insurance/return/claim capabilities.
- [ ] Demonstrate with one additional stub/fake provider that registration requires no customer UI/core order edits.

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

- [ ] Exact pickup and normalized destination.
- [ ] Vehicle type/make/model/condition/access constraints structured.
- [ ] Remove parcel-shaped placeholders like `small`, zero dimensions, fake receiver/phone.
- [ ] Route preview/operator visible.

## TOW-2026-002 — Capability/vehicle-safe matching [P0]
- [ ] Validate towing motor/mobil capability.
- [ ] Capacity/vehicle compatibility.
- [ ] Active job/radius/availability.
- [ ] Incompatible preferred courier cannot be forced.

## TOW-2026-003 — Route/toll quote + explicit requote [P0]

**Files to edit**
- customer service booking files
- `backend/order-service/internal/service/pricing_service.go`
- `backend/order-service/internal/handler/tambalban_handler.go`
- courier `ServiceUpgradeScreen.kt`

- [ ] Actual pickup→dropoff route.
- [ ] Toll/service/operator/platform/insurance components.
- [ ] No vague silent admin adjustment.
- [ ] Customer consent for material increase.

## TOW-2026-004 — Inspection→loading→transit→unloading→completion proof [P0]

**Files to edit**
- courier `TowingFlow.kt`, `TowingFlowScreen.kt`, `TowingFlowViewModel.kt`, `InspectVehicleScreen.kt`, `TowingProgressSteps.kt`, `TowingReportCard.kt`, `ServiceReportProofUploader.kt`
- `backend/order-service/internal/domain/tambalban.go`
- `backend/order-service/internal/handler/tambalban_handler.go`

- [ ] Before-condition proof.
- [ ] Loading proof before transit.
- [ ] Unloading/destination verification before complete.
- [ ] Completion proof/signature server validated.

## TOW-2026-005 — Damage claim protection [P0]
- [ ] Before evidence immutable after transit begins.
- [ ] Before/after same vehicle/order/operator.
- [ ] Liability decision audited.
- [ ] Compensation reconciles with settlement/insurance.

## TOW-2026-006 — Customer tracking parity [P0]
- [ ] Human-readable stages: menuju pickup→tiba→inspeksi→loading→perjalanan→unloading→selesai.
- [ ] ETA/route refresh.
- [ ] Snapshot recovery.

## TOW-2026-007 — Conditional backend split [P1]

**Recommended only if complexity threshold is reached**
- `backend/order-service/internal/domain/towing.go`
- `backend/order-service/internal/handler/towing_handler.go`
- `backend/order-service/internal/service/towing_service.go`
- `backend/order-service/internal/repository/towing_repository.go`

- [ ] Split only if Towing state/pricing/dependency/claim logic materially diverges from Tambal Ban.

## TOW-2026-008 — Towing UI/UX trust [P1]
- [ ] Pickup/destination visible before quote.
- [ ] Compatibility explained before operator selection.
- [ ] Adjustment requires explicit consent.
- [ ] Before-condition evidence is customer-visible trust surface.

---

# PART G — CUSTOMER WEB PLATFORM

## WEB-2026-001 — No fake/optimistic transaction success [P0]

**Files to edit**
- `frontend/src/components/orders/AggregatorWizard.tsx`
- `frontend/src/components/orders/OnDemandOrderForm.tsx`
- `frontend/src/components/orders/PaymentModal.tsx`
- `frontend/src/lib/api.ts`

- [ ] Success requires persisted server resource.
- [ ] Timeout shows pending/retry, not success.
- [ ] Duplicate submit reuses idempotency key.

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

- [ ] Paket Instan vs Aggregator uses correct vocabulary.
- [ ] LANCAR first-mile vs external carrier visually distinct.
- [ ] Money state separated from delivery state.

## WEB-2026-003 — Accessibility/responsive/failure recovery [P1]
- [ ] Keyboard/focus/form error/screen-reader status.
- [ ] Sticky CTA/modal works mobile.
- [ ] Error/offline states have explicit recovery.

---

# PART H — SHARED CUSTOMER & COURIER UI/UX

## UX-2026-001 — Dashboard IA for 5 services [P1]

**Files to edit**
- customer `DashboardScreen.kt`, `ServiceGridMenu.kt`, `ServiceIcons.kt`, `RootNavGraph.kt`, `Screen.kt`

- [ ] Distinct labels/icons/purpose.
- [ ] Recommended: `Paket Instan`, `Food`, `Tambal Ban`, `Ekspedisi Antar-Kota`, `Towing`.
- [ ] Emergency services visually distinct.

## UX-2026-002 — One order-detail shell, service-specific sections [P1]

**Files to edit**
- customer `OrderHistoryScreen.kt`, `OrderDetailScreen.kt`, `OrderDetailViewModel.kt`

**Recommended new files**
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/detail/OrderDetailSections.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/detail/OrderActionPolicy.kt`

- [ ] Shared shell + typed service sections.
- [ ] Action policy by state+service.
- [ ] Unknown state safe.

## UX-2026-003 — Courier service-mode clarity [P1]
- [ ] Active capabilities clear before offers.
- [ ] Offer shows service/capability/earnings/route/proof requirement.
- [ ] Food/Paket/Tambal/Towing cues distinct.

## UX-2026-004 — Notification/deep-link consistency [P1]
- [ ] Push includes service/order/target/event version.
- [ ] Stale push cannot regress UI.
- [ ] Deep link always snapshot-reconciles.

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

- [ ] Filter by service/subtype/provider/merchant/courier/payment state.
- [ ] Timeline shows actor/state/proof/payment/refund/provider events/override.
- [ ] Provider raw event accessible to ops without leaking to normal customer surface.

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
