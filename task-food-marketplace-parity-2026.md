# Task — LANCAR Multi-Service Marketplace 2026: End-to-End Parity, UI/UX & Production Hardening

> **Historical filename retained intentionally:** `task-food-marketplace-parity-2026.md`.
> File ini awalnya hanya audit Food. Mulai revisi ini, file yang sama menjadi **master implementation checklist** untuk seluruh marketplace LANCAR agar histori task Food tidak terputus.

**Status:** OPEN  
**Priority:** P0 → P2  
**Baseline branch:** `staging`  
**Services in scope:** Paket On-Demand, Food, Tambal Ban, Aggregator Paket Antar-Kota, Towing  
**Customer surfaces:** Android untuk 5 layanan; Customer Web untuk Paket On-Demand + Aggregator  
**Operational surfaces:** Merchant Android (Food), Courier Android, Admin Dashboard, Order Service, Merchant Service, Payment, Routing/Maps, Integration Gateway, Notifications, Tracking, Observability, QA  
**Benchmark principle:** gunakan pola operasional marketplace/logistics modern sebagai referensi fungsi; jangan clone proprietary UI.

---

## 0. Cara Menggunakan Master Task Ini

- [ ] Semua checkbox harus tetap kosong sampai implementasi, test, dan acceptance criteria benar-benar selesai.
- [ ] Jangan menandai task selesai hanya karena screen atau endpoint sudah ada; task selesai jika flow transaksi nyata aman terhadap retry, race condition, state mismatch, kegagalan provider, dan rekonsiliasi finansial.
- [ ] Edit file existing terlebih dahulu bila ownership masih tepat; buat file baru hanya jika separation of concern memang membaik.
- [ ] Jika task merekomendasikan file baru, gunakan nama file rekomendasi di bawah kecuali ada alasan arsitektural kuat untuk memilih nama lain.
- [ ] Setiap API baru harus backward-compatible atau mempunyai migration/versioning plan yang eksplisit.
- [ ] Harga, ETA, availability, order state, payout, refund, dan provider status harus server-authoritative.
- [ ] Realtime/WebSocket/push adalah transport optimasi, bukan source of truth; semua client harus dapat recovery dari REST snapshot.
- [ ] Semua mutation finansial dan order creation wajib mempunyai idempotency strategy.
- [ ] Semua manual override admin wajib menyimpan actor, reason, previous value, new value, timestamp, dan correlation/trace id.
- [ ] Jangan launch production sebelum seluruh task **P0** dan mandatory E2E scenarios green.

---

## 1. Audited Baseline — Temuan Penting Saat Ini

### 1.1 Aggregator Customer Web — P0 gap nyata

`frontend/src/components/orders/AggregatorWizard.tsx` saat ini sudah mempunyai wizard UI, bulk upload/polling, pilihan provider, tarif, dan review; tetapi flow manual masih melakukan simulated delay lalu redirect sukses tanpa create-order nyata. File yang sama juga masih menggunakan origin `CGK`, mock city list, provider list statik, dan direct browser call ke Nominatim.

- [ ] Perlakukan manual fake-success sebagai production blocker.
- [ ] Hilangkan fixed-origin `CGK` dan derive origin dari alamat/lokasi pickup yang tervalidasi.
- [ ] Hilangkan provider/city hardcode dari production path.
- [ ] Hilangkan direct third-party geocoding dari browser; gunakan backend/integration contract.

### 1.2 Towing — jangan rewrite module courier dari nol

Courier sudah mempunyai dedicated Towing domain/UI flow (`TowingFlow.kt`, `TowingFlowScreen.kt`, `TowingFlowViewModel.kt`, inspection, progress, report card, proof uploader, POD). Customer saat ini masuk melalui generic `ServiceBookingScreen.kt`/`ServiceBookingViewModel.kt` menggunakan `serviceSubType`.

- [ ] Pertahankan existing courier Towing flow dan harden kontrak/state/proof-nya.
- [ ] Fokus gap pada customer booking metadata, quote/requote, matching, consent perubahan harga, tracking, dan backend lifecycle.
- [ ] Jangan membuat duplicate Towing module jika generic service booking masih dapat dipisahkan dengan bersih.

### 1.3 Tambal Ban + Towing backend memang berbagi contract

`backend/order-service/internal/domain/tambalban.go` dan `handler/tambalban_handler.go` saat ini menampung subtype Tambal Ban dan Towing, availability, settlement, dan service report.

- [ ] Jangan memecah file hanya karena nama `tambalban`; split Towing menjadi domain terpisah hanya jika rule/state/pricing sudah cukup berbeda dan shared file menjadi sulit dipelihara.

### 1.4 Paket On-Demand mempunyai fondasi address/booking cukup kuat

Customer Android sudah memiliki Booking flow, address book, price estimate, voucher/insurance, tracking, detail, dan customer web mempunyai OnDemand forms.

- [ ] Audit idempotency, quote snapshot, pickup proof, state recovery, financial invariants, dan parity web sebelum menyebut flow production-ready.

### 1.5 Food task lama dipertahankan

Task `FOOD-2026-001` sampai `FOOD-2026-026` tetap dipertahankan di file ini, tetapi sekarang setiap task diberi ownership/file scope yang lebih eksplisit dan dihubungkan dengan shared platform tasks.

---

# PART A — CROSS-SERVICE PLATFORM FOUNDATION

## P0 — Shared Transaction Safety

### CORE-2026-001 — Canonical service-aware order contract

**Problem**  
Lima layanan mempunyai payload dan lifecycle yang berbeda, tetapi terlalu banyak logic masih berbagi generic order fields. Risiko utamanya adalah service-specific facts dipaksa ke field yang salah, UI menebak jenis order, dan perubahan satu layanan merusak layanan lain.

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

**Implementation checklist**
- [ ] Tetapkan canonical `service_category`: `package_on_demand`, `food`, `tambal_ban`, `aggregator`, `towing`.
- [ ] Tetapkan `service_code/service_sub_type` sebagai detail spesifik, bukan pengganti category.
- [ ] Pisahkan common order envelope: id, customer, monetary state, lifecycle state, timestamps, actor ownership, quote id, correlation id.
- [ ] Tambahkan typed service metadata: parcel/package facts, food facts, roadside facts, aggregator/provider facts, towing facts.
- [ ] Jangan menyimpan towing/tambal metadata utama sebagai fake package description string jika field structured tersedia.
- [ ] Pastikan client yang belum mengenal subtype baru tetap bisa render generic order detail tanpa crash.
- [ ] Tambahkan `contract_version` atau equivalent untuk perubahan payload besar.
- [ ] Dokumentasikan fields mandatory/optional per service.
- [ ] Tambahkan backward compatibility mapper untuk order existing.

**Acceptance criteria**
- [ ] Satu endpoint order detail dapat mengidentifikasi lima service secara deterministik tanpa heuristic berdasarkan text.
- [ ] Tidak ada required Towing/Tambal Ban fact yang hanya hidup di free-text `item_description`.
- [ ] Android customer, courier, web, dan admin merender unknown/new subtype dengan degraded-safe UI.

---

### CORE-2026-002 — Shared idempotency for order + financial mutations

**Files to edit**
- `backend/order-service/internal/service/order_create.go`
- `backend/order-service/internal/service/order_food.go`
- `backend/order-service/internal/service/payment_service.go`
- `backend/order-service/internal/service/refund_service.go`
- `backend/order-service/internal/handler/order_handler.go`
- `backend/order-service/internal/handler/food_handler.go`
- `backend/order-service/internal/middleware/redis_helper.go`
- `backend/order-service/cmd/api/main.go`
- `android-app-customer/app/src/main/java/com/tembus/customer/data/repository/OrderRepository.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/data/api/TEMBUSApiService.kt`
- `frontend/src/lib/api.ts`

**Recommended new files**
- `backend/order-service/internal/domain/idempotency.go`
- `backend/order-service/internal/service/idempotency_service.go`
- `backend/order-service/internal/repository/idempotency_repository.go`
- `database/migrations/<timestamp>_add_order_idempotency_keys.sql`

**Implementation checklist**
- [ ] Require idempotency key pada create Paket, Food, Tambal Ban, Aggregator manual/bulk child create, dan Towing.
- [ ] Simpan `key + actor/customer + operation + request_fingerprint + result_reference + expiry`.
- [ ] Same key + same fingerprint mengembalikan result awal.
- [ ] Same key + payload berbeda menghasilkan typed conflict.
- [ ] Client menyimpan key sampai request memperoleh terminal acknowledgement; retry timeout tidak membuat key baru.
- [ ] Deduplicate payment callback/webhook, refund, payout, carrier webhook, and service adjustment mutation.
- [ ] Tambahkan concurrency test minimal 10 request paralel untuk order creation.

**Acceptance criteria**
- [ ] Double tap/retry 10× menghasilkan tepat 1 order dan 1 financial obligation.
- [ ] Duplicate callback tidak membuat ledger entry, dispatch, AWB, refund, atau payout ganda.

---

### CORE-2026-003 — Server-authoritative quote contract untuk semua layanan

**Files to edit**
- `backend/order-service/internal/domain/pricing.go`
- `backend/order-service/internal/service/pricing_service.go`
- `backend/order-service/internal/handler/order_handler.go`
- `backend/order-service/internal/handler/food_handler.go`
- `backend/order-service/internal/handler/tambalban_handler.go`
- `backend/order-service/internal/repository/maps_repository.go`
- `android-app-customer/app/src/main/java/com/tembus/customer/data/repository/OrderRepository.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/data/api/TEMBUSApiService.kt`
- `frontend/src/hooks/useLogisticsTariff.ts`
- `frontend/src/components/orders/OrderSummary.tsx`

**Recommended new files**
- `backend/order-service/internal/domain/quote.go`
- `backend/order-service/internal/service/quote_service.go`
- `backend/order-service/internal/repository/quote_repository.go`
- `database/migrations/<timestamp>_add_order_quote_snapshots.sql`

**Implementation checklist**
- [ ] Quote menghasilkan `quote_id`, service/category, normalized input fingerprint, price components, total, currency, ETA/range, policy/rule version, dan expiry.
- [ ] Order creation wajib consume valid quote atau menghasilkan explicit `REQUOTE_REQUIRED`.
- [ ] Address/location, package facts, food cart, courier/provider choice, voucher, schedule, toll estimate, dan service subtype yang berubah harus invalidate quote.
- [ ] Jangan percaya total dari client.
- [ ] Persist quote snapshot yang digunakan order untuk audit dispute.
- [ ] Surface per-komponen harga dengan label yang sama di Android/Web/Admin.

---

### CORE-2026-004 — Canonical state machine + actor authorization

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

**Implementation checklist**
- [ ] Definisikan allowed transition per service dan actor: customer, merchant, courier, provider webhook, system worker, admin override.
- [ ] Gunakan optimistic state version/row locking untuk mencegah race.
- [ ] Terminal state tidak boleh mundur karena delayed socket/webhook.
- [ ] State + audit event + required ledger/proof pointer harus transactional.
- [ ] Invalid transition menghasilkan typed error, bukan silent ignore kecuali duplicate event yang memang idempotent.
- [ ] Admin override wajib reason dan audit.
- [ ] Dokumentasikan state mapping ke customer-friendly label.

---

### CORE-2026-005 — Payment, refund, payout, settlement & reconciliation invariants

**Files to edit**
- `backend/order-service/internal/domain/payment.go`
- `backend/order-service/internal/domain/refund.go`
- `backend/order-service/internal/domain/payout.go`
- `backend/order-service/internal/domain/ledger.go`
- `backend/order-service/internal/service/payment_service.go`
- `backend/order-service/internal/service/refund_service.go`
- `backend/order-service/internal/service/payout_service.go`
- `backend/order-service/internal/service/merchant_settlement_service.go`
- `backend/order-service/internal/handler/payment_handler.go`
- `backend/order-service/internal/handler/refund_handler.go`
- `backend/order-service/internal/handler/payout_handler.go`
- `admin-dashboard/src/pages/finance/reconciliationPanel.tsx`
- `admin-dashboard/src/pages/finance/ledgerPanel.tsx`
- `admin-dashboard/src/pages/finance/treasury/ManualReviewSection.tsx`
- `admin-dashboard/src/pages/finance/treasury/ServiceSettlementSection.tsx`

**Recommended new files**
- `backend/order-service/internal/service/reconciliation_service.go`
- `backend/order-service/internal/worker/reconciliation_worker.go`
- `backend/order-service/internal/service/reconciliation_service_test.go`
- `database/migrations/<timestamp>_add_reconciliation_exceptions.sql`

**Implementation checklist**
- [ ] Definisikan invariants untuk unpaid/pending/paid/refunding/refunded/settled/failed.
- [ ] Reconcile `order total ↔ payment ↔ voucher/subsidy ↔ courier earning ↔ merchant payable ↔ carrier payable ↔ platform revenue ↔ tax ↔ refund`.
- [ ] Order completed dengan money-state mismatch harus masuk exception queue, bukan dianggap normal.
- [ ] Manual correction menggunakan compensating ledger entry; jangan overwrite history.
- [ ] Refund partial dan cancellation fee harus deterministik per service.
- [ ] Dashboard dapat filter discrepancy berdasarkan service/category/provider/date.

---

### CORE-2026-006 — Proof, PIN/QR, signature & chain-of-custody contract

**Files to edit**
- `backend/order-service/internal/handler/proof_handler.go`
- `backend/order-service/internal/service/order_service.go`
- `android-app/app/src/main/java/com/tembus/courier/ui/screens/scan/ScanScreen.kt`
- `android-app/app/src/main/java/com/tembus/courier/ui/screens/scan/ScanViewModel.kt`
- `android-app/app/src/main/java/com/tembus/courier/ui/screens/pod/ProofOfDeliveryScreen.kt`
- `android-app/app/src/main/java/com/tembus/courier/ui/screens/pod/ProofOfDeliveryViewModel.kt`
- `android-app/app/src/main/java/com/tembus/courier/ui/screens/pod/SignaturePad.kt`
- `android-app/app/src/main/java/com/tembus/courier/data/repository/ServiceReportProofUploader.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/detail/OrderDetailScreen.kt`

**Recommended new files**
- `backend/order-service/internal/domain/handoff.go`
- `backend/order-service/internal/service/handoff_service.go`
- `backend/order-service/internal/service/handoff_service_test.go`
- `database/migrations/<timestamp>_add_handoff_verification.sql`

**Implementation checklist**
- [ ] Buat proof requirement matrix per service/stage.
- [ ] PIN/QR one-time harus bind order + actor + expected stage + expiry + attempts.
- [ ] Replay/wrong courier/wrong order/expired token ditolak.
- [ ] Proof upload harus mempunyai ownership validation dan immutable evidence reference setelah stage final.
- [ ] Completion harus ditolak bila mandatory proof belum lengkap.
- [ ] Customer detail menampilkan proof summary yang aman, bukan raw internal storage URL bila tidak perlu.

---

### CORE-2026-007 — Realtime ordering, offline recovery & snapshot reconciliation

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
- `admin-dashboard/src/hooks/useSocket.ts`

**Implementation checklist**
- [ ] Event mempunyai monotonic sequence/version per order atau equivalent ordering contract.
- [ ] Client ignore duplicate/older event.
- [ ] Socket reconnect selalu fetch REST snapshot authoritative.
- [ ] Push notification tidak boleh mengubah state lokal tanpa snapshot bila event stale/ambiguous.
- [ ] Offline mutation policy jelas: queue only safe/idempotent actions; destructive action harus reconfirm.
- [ ] Instrument disconnect, reconnect, reconciliation mismatch, event lag.

---

### CORE-2026-008 — Typed recoverable errors across Android/Web/Courier

**Files to edit**
- `backend/order-service/internal/domain/errors.go`
- `backend/order-service/internal/middleware/base_middleware.go`
- `backend/order-service/internal/middleware/validator.go`
- `android-app-customer/app/src/main/java/com/tembus/customer/data/api/TEMBUSApiService.kt`
- `frontend/src/lib/api.ts`
- `android-app/app/src/main/java/com/tembus/courier/ui/components/ErrorReference.kt`

**Implementation checklist**
- [ ] Standarkan code untuk `REQUOTE_REQUIRED`, `OUT_OF_SERVICE_AREA`, `NO_COURIER`, `PROVIDER_UNAVAILABLE`, `ITEM_UNAVAILABLE`, `INVALID_TRANSITION`, `PAYMENT_PENDING`, `PAYMENT_RECONCILIATION_REQUIRED`, `PROOF_REQUIRED`, `HANDOFF_INVALID`, `SCHEDULE_INVALID`, `CAPABILITY_MISMATCH`.
- [ ] Error response selalu bawa correlation id.
- [ ] Customer-facing UI menampilkan next action, bukan raw backend error.
- [ ] Log internal tidak membocorkan token, payment secret, phone lengkap, atau location lebih detail dari kebutuhan observability.

---

# PART B — PAKET ON-DEMAND END-TO-END

## P0

### PKG-2026-001 — Coordinate-safe pickup & destination

**Files to edit**
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/booking/BookingScreen.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/booking/BookingViewModel.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/booking/BookingComponents.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/booking/BookingHelpers.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/profile/AddressBookScreen.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/profile/AddressBookViewModel.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/data/repository/OrderRepository.kt`
- `frontend/src/components/orders/AddressPicker.tsx`
- `frontend/src/components/orders/OnDemandOrderForm.tsx`
- `frontend/src/components/orders/OnDemandOrderFormContent.tsx`
- `frontend/src/app/(portal)/alamat/page.tsx`

**Implementation checklist**
- [ ] Pickup/dropoff disimpan sebagai atomic address object: id/label/lat/lng/city/postal/receiver/contact/instruction.
- [ ] Mengganti saved address mengganti coordinates dan invalidate quote.
- [ ] Manual text tidak dapat submit sebelum pin/geocode ter-resolve.
- [ ] Permission denied mempunyai saved/manual map fallback.
- [ ] Reject coordinate `0,0`, stale GPS, dan out-of-service-area.
- [ ] Final review menampilkan kedua pin/alamat sebelum order.

---

### PKG-2026-002 — Package facts + server quote parity Android/Web

**Files to edit**
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/components/VehicleDetailInput.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/booking/BookingViewModel.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/data/model/CustomerModels.kt`
- `frontend/src/components/orders/OrderSchemas.ts`
- `frontend/src/components/orders/OnDemandOrderFormContent.tsx`
- `frontend/src/components/orders/OrderSummary.tsx`
- `backend/order-service/internal/service/pricing_service.go`
- `backend/order-service/internal/handler/parcel_handler.go`

**Implementation checklist**
- [ ] Capture berat, dimensi, volumetric weight, quantity, category, item value, fragile/dangerous flag, size tier, receiver, delivery-code requirement.
- [ ] Jelaskan actual vs volumetric chargeable weight di UI bila relevan.
- [ ] Quote menampilkan base, distance, dynamic/surge, platform, insurance, discount, tax, total, expiry.
- [ ] Jika package facts berubah setelah quote, force requote.
- [ ] Server menolak client total yang tidak cocok dengan quote.
- [ ] Android dan Web menggunakan terminology/price breakdown yang sama.

---

### PKG-2026-003 — Create → payment → matching tanpa duplicate assignment

**Files to edit**
- `android-app-customer/app/src/main/java/com/tembus/customer/data/repository/OrderRepository.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/booking/BookingViewModel.kt`
- `backend/order-service/internal/service/order_create.go`
- `backend/order-service/internal/service/order_matching.go`
- `backend/order-service/internal/handler/order_handler.go`
- `android-app/app/src/main/java/com/tembus/courier/ui/screens/OnDemandOfferScreens.kt`
- `android-app/app/src/main/java/com/tembus/courier/ui/components/OnDemandIncomingOfferSwipePanel.kt`
- `android-app/app/src/main/java/com/tembus/courier/ui/screens/order/OrderViewModel.kt`

**Implementation checklist**
- [ ] Create consumes valid quote + idempotency key.
- [ ] Dispatch hanya dimulai sesuai payment policy yang disepakati.
- [ ] Matching validate service capability, vehicle, radius, availability, and active-order constraints.
- [ ] Accept race dari dua courier menghasilkan satu winner atomically.
- [ ] No-courier mempunyai customer-visible retry/expand/cancel path.
- [ ] Reassignment tidak menduplikasi payout reservation.

---

### PKG-2026-004 — Pickup verification & chain of custody

**Files to edit**
- `android-app/app/src/main/java/com/tembus/courier/ui/screens/order/MandatoryPickupChecklist.kt`
- `android-app/app/src/main/java/com/tembus/courier/ui/screens/order/PackageChecklistCard.kt`
- `android-app/app/src/main/java/com/tembus/courier/ui/screens/scan/ScanScreen.kt`
- `android-app/app/src/main/java/com/tembus/courier/ui/screens/order/OnDemandProofPanel.kt`
- `backend/order-service/internal/handler/proof_handler.go`
- `backend/order-service/internal/service/order_service.go`

**Implementation checklist**
- [ ] Courier mark arrived sebelum pickup verification.
- [ ] Validate package identity/condition/quantity where required.
- [ ] PIN/QR atau proof equivalent wajib sebelum `picked_up`.
- [ ] Wrong/replayed code tidak boleh di-bypass oleh client state.
- [ ] Pickup proof/audit event immutable setelah handoff.

---

### PKG-2026-005 — Live tracking, ETA & communication

**Files to edit**
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/tracking/TrackingScreen.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/tracking/TrackingViewModel.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/data/model/OrderTrackingDetail.kt`
- `backend/order-service/internal/service/tracking_service.go`
- `backend/order-service/internal/handler/tracking_handler.go`
- `frontend/src/app/track/[token]/page.tsx`
- `frontend/src/app/(portal)/orders/[id]/RouteSnapshotPanel.tsx`
- `android-app/app/src/main/java/com/tembus/courier/ui/screens/order/DeliveryMapCard.kt`

**Implementation checklist**
- [ ] ETA bersumber dari backend route/state, bukan formula UI.
- [ ] Tampilkan staleness jika courier GPS terlambat.
- [ ] Mask contact data sesuai lifecycle dan privacy policy.
- [ ] Public tracking token scoped, expiring/revocable, dan tidak mengekspos internal identifiers berlebihan.
- [ ] Socket offline recover melalui REST snapshot.

---

### PKG-2026-006 — Delivery/POD/failed delivery/return flow

**Files to edit**
- `android-app/app/src/main/java/com/tembus/courier/ui/screens/pod/ProofOfDeliveryScreen.kt`
- `android-app/app/src/main/java/com/tembus/courier/ui/screens/pod/ProofOfDeliveryViewModel.kt`
- `android-app/app/src/main/java/com/tembus/courier/ui/screens/order/RegularFailedDeliveryPanel.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/detail/OrderDetailScreen.kt`
- `frontend/src/app/(portal)/orders/[id]/OrderDetailContent.tsx`
- `backend/order-service/internal/handler/proof_handler.go`

**Implementation checklist**
- [ ] POD policy dapat meminta photo/signature/PIN berdasarkan risk/service config.
- [ ] Failed delivery membutuhkan reason + evidence + next action: retry/return/support.
- [ ] Recipient mismatch mempunyai safe handoff rule.
- [ ] Payout/settlement tidak final sebelum proof/state invariant terpenuhi.
- [ ] Customer dapat membuka dispute dari final proof summary.

---

## P1 — Paket Customer Web Parity & UI/UX

### PKG-2026-007 — Customer Web full parity dengan Paket Android

**Files to edit**
- `frontend/src/app/(portal)/orders/new/ondemand/page.tsx`
- `frontend/src/components/orders/OnDemandOrderForm.tsx`
- `frontend/src/components/orders/OnDemandOrderFormContent.tsx`
- `frontend/src/components/orders/AddressPicker.tsx`
- `frontend/src/components/orders/OrderSummary.tsx`
- `frontend/src/components/orders/PaymentModal.tsx`
- `frontend/src/app/(portal)/orders/page.tsx`
- `frontend/src/app/(portal)/orders/[id]/page.tsx`
- `frontend/src/app/(portal)/orders/[id]/OrderDetailContent.tsx`
- `frontend/e2e/customer-flow.spec.ts`

**Recommended new files**
- `frontend/e2e/ondemand-package-flow.spec.ts`
- `frontend/src/hooks/useCreateOnDemandOrder.ts`

**Implementation checklist**
- [ ] Full web journey: login → alamat → package facts → quote → payment → order created → history → detail → tracking → completion/dispute.
- [ ] Refresh/back/duplicate submit tidak menciptakan order ganda.
- [ ] Mobile responsive dan keyboard-accessible.
- [ ] Android/Web memakai server quote dan state label yang sama.
- [ ] Error state mempunyai retry/requote/cancel action yang jelas.

---

### PKG-2026-008 — Paket UI/UX trust pass

**Files to edit**
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/components/ServiceGridMenu.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/components/ServiceIcons.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/main/DashboardScreen.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/history/OrderHistoryScreen.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/detail/OrderDetailScreen.kt`
- `frontend/src/app/(portal)/dashboard/page.tsx`
- `frontend/src/app/(portal)/orders/page.tsx`

**Implementation checklist**
- [ ] Bedakan jelas `Paket Instan` vs `Ekspedisi Antar-Kota` dari icon, subtitle, ETA expectation, dan price model.
- [ ] Booking menggunakan progressive disclosure; jangan tampilkan semua field sekaligus.
- [ ] Review selalu menampilkan route, package summary, service, ETA, price, receiver, cancellation policy.
- [ ] History mempunyai badge service dan status yang konsisten.
- [ ] Destructive action tidak ditempatkan berdekatan dengan primary CTA tanpa confirmation.

---

# PART C — FOOD MARKETPLACE 2026

> ID Food lama dipertahankan untuk continuity. Task berikut sekarang harus mengikuti `CORE-*` contract di atas.

## P0 — Food Production Blockers

### FOOD-2026-001 — Coordinate-safe food checkout

**Files to edit**
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/food/FoodCheckoutScreen.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/food/FoodViewModel.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/data/model/FoodModels.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/data/repository/OrderRepository.kt`
- `backend/order-service/internal/handler/food_handler.go`
- `backend/order-service/internal/service/order_food.go`
- `backend/order-service/internal/repository/food_repository.go`

**Implementation checklist**
- [ ] Selected destination adalah atomic address+coordinate object.
- [ ] Saved/manual/pinned address selalu mengganti coordinates delivery.
- [ ] Discovery/current GPS tidak boleh diam-diam dipakai sebagai delivery coordinate.
- [ ] Block missing/stale/out-of-range destination.
- [ ] Address change invalidate quote/ETA.
- [ ] Final pin/address confirmation sebelum place order.

---

### FOOD-2026-002 — Authoritative pre-order Food Quote

**Files to edit**
- `backend/order-service/internal/handler/food_handler.go`
- `backend/order-service/internal/service/order_food.go`
- `backend/order-service/internal/repository/food_repository.go`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/food/FoodCheckoutScreen.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/food/FoodViewModel.kt`

**Recommended new file only if shared `quote_service.go` cannot express Food rules cleanly**
- `backend/order-service/internal/service/food_quote_service.go`

**Implementation checklist**
- [ ] Quote validates merchant open/busy/paused state, item, variant, quantity, stock, voucher, destination, radius, taxes, fees, schedule.
- [ ] Return subtotal, add-ons, delivery, platform/service, tax, discount, final total, ETA range, expiry.
- [ ] Create consumes quote or returns explicit requote diff.
- [ ] Client-calculated totals never authoritative.

---

### FOOD-2026-003 — Idempotent Food order creation

**Files to edit**
- `backend/order-service/internal/service/order_food.go`
- `backend/order-service/internal/handler/food_handler.go`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/food/FoodViewModel.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/data/repository/OrderRepository.kt`

**Implementation checklist**
- [ ] Apply `CORE-2026-002` to Food create/payment callback.
- [ ] 10 repeated identical create requests produce one order.
- [ ] Duplicate callback cannot duplicate merchant notification or courier dispatch.

---

### FOOD-2026-004 — Secure merchant → courier/customer handoff

**Files to edit**
- `backend/order-service/internal/service/order_food.go`
- `backend/order-service/internal/handler/proof_handler.go`
- `android-app-merchant/app/src/main/java/com/tembus/merchant/ui/screens/home/StitchOrdersDashboardScreen.kt`
- `android-app-merchant/app/src/main/java/com/tembus/merchant/ui/screens/struk/MerchantZipOrderDetailScreens.kt`
- `android-app/app/src/main/java/com/tembus/courier/ui/screens/scan/ScanScreen.kt`
- `android-app/app/src/main/java/com/tembus/courier/ui/screens/order/FoodItemsCard.kt`

**Implementation checklist**
- [ ] One-time PIN/QR binds order, merchant, expected courier/customer, state, expiry, attempt count.
- [ ] Verification and `picked_up` transition atomic.
- [ ] Replay/wrong actor/wrong order rejected.
- [ ] Support override requires reason + audit.

---

### FOOD-2026-005 — Server-authoritative ETA & readiness prediction

**Files to edit**
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/food/FoodHomeScreen.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/food/MerchantDetailScreen.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/food/FoodCheckoutScreen.kt`
- `backend/order-service/internal/service/order_food.go`
- `backend/order-service/internal/service/matching_service.go`
- `backend/order-service/internal/repository/maps_repository.go`

**Implementation checklist**
- [ ] Remove fabricated client ETA formulas.
- [ ] ETA includes prep + dispatch/supply + pickup travel + delivery route/traffic + batching + confidence.
- [ ] Refresh after accept, courier assignment, ready, pickup, deviation, delay.
- [ ] Log predicted vs actual per stage/area/merchant.

---

### FOOD-2026-006 — Contactless delivery end-to-end

**Files to edit**
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/food/FoodCheckoutScreen.kt`
- `backend/order-service/internal/domain/order_food.go`
- `backend/order-service/internal/service/order_food.go`
- `android-app-merchant/app/src/main/java/com/tembus/merchant/ui/screens/struk/MerchantZipOrderDetailScreens.kt`
- `android-app/app/src/main/java/com/tembus/courier/ui/screens/order/OrderDetailScreen.kt`
- `android-app/app/src/main/java/com/tembus/courier/ui/screens/pod/ProofOfDeliveryScreen.kt`

**Implementation checklist**
- [ ] Contactless toggle + structured instruction persisted end-to-end.
- [ ] Courier sees instruction before delivery.
- [ ] POD supports contactless proof without forcing face-to-face signature.

---

### FOOD-2026-007 — Canonical Food state machine + cross-app contract tests

**Files to edit**
- `backend/order-service/internal/domain/order_food.go`
- `backend/order-service/internal/service/order_food.go`
- `backend/order-service/internal/service/order_food_merchant.go`
- `backend/order-service/internal/service/order_status_guard_test.go`
- `android-app-merchant/app/src/main/java/com/tembus/merchant/ui/screens/home/HomeViewModel.kt`
- `android-app/app/src/main/java/com/tembus/courier/ui/screens/order/OrderViewModel.kt`

**Recommended new file**
- `backend/order-service/internal/service/order_food_state_machine_test.go`

**Mandatory scenarios**
- [ ] Happy path payment → merchant accept → preparing → courier assign → secure pickup → delivery → settlement.
- [ ] Customer double-tap/retry create.
- [ ] Payment timeout/failure lalu late callback.
- [ ] Merchant reject.
- [ ] Merchant timeout/auto-cancel.
- [ ] Item/variant becomes unavailable before confirm.
- [ ] Substitution/edit with customer approval.
- [ ] Scheduled activation.
- [ ] No courier / delayed dispatch.
- [ ] Courier reject/reassignment.
- [ ] Courier issue at pickup with evidence.
- [ ] Early-ready and late-ready.
- [ ] Invalid/replayed handoff token.
- [ ] Contactless delivery.
- [ ] Partial refund/edit.
- [ ] Food batching path.
- [ ] Socket offline → reconnect → snapshot reconcile.
- [ ] Duplicate/out-of-order notification/webhook.

---

### FOOD-2026-008 — Customer location/privacy permission hardening

**Files to edit**
- `android-app-customer/app/src/main/AndroidManifest.xml`
- `android-app-customer/app/src/main/java/com/tembus/customer/receiver/BootReceiver.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/service/LocationTrackerService.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/food/FoodHomeScreen.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/food/FoodCheckoutScreen.kt`

**Implementation checklist**
- [ ] Audit need background location dan boot-start behavior.
- [ ] Food browsing/checkout uses least privilege.
- [ ] No persistent tracking after reboot tanpa justified user-visible feature.
- [ ] Manual/saved-address works when permission denied.
- [ ] Document retention, purpose, consent, telemetry granularity.

---

### FOOD-2026-009 — Food payment/refund/reconciliation invariants

**Files to edit**
- `backend/order-service/internal/service/payment_service.go`
- `backend/order-service/internal/service/refund_service.go`
- `backend/order-service/internal/service/merchant_settlement_service.go`
- `backend/order-service/internal/repository/merchant_settlement_repository.go`
- `admin-dashboard/src/pages/MerchantSettlements.tsx`
- `admin-dashboard/src/pages/finance/reconciliationPanel.tsx`

**Implementation checklist**
- [ ] Merchant reject/timeout/customer cancel/courier failure/edit/tip/refund/settlement all reconcile.
- [ ] Promo subsidy and merchant payable are explicit ledger components.
- [ ] Completed-with-unreconciled-money enters exception queue.

---

## P1 — Food Marketplace Parity

### FOOD-2026-010 — Customer Pickup / self-pickup

**Files to edit**
- `FoodHomeScreen.kt`, `MerchantDetailScreen.kt`, `FoodCheckoutScreen.kt` under `android-app-customer/.../ui/screens/food/`
- `backend/order-service/internal/domain/order_food.go`
- `backend/order-service/internal/service/order_food.go`
- `android-app-merchant/app/src/main/java/com/tembus/merchant/ui/screens/home/StitchOrdersDashboardScreen.kt`

**Implementation checklist**
- [ ] Delivery vs Pickup selectable before checkout.
- [ ] Pickup has no courier dispatch/delivery fee.
- [ ] Readiness notification + one-time pickup PIN/QR.
- [ ] No-show/expiry/cancel policy defined.

### FOOD-2026-011 — Merchant Busy mode distinct from Paused

**Files to edit**
- `android-app-merchant/app/src/main/java/com/tembus/merchant/ui/screens/home/StitchOrdersDashboardScreen.kt`
- `android-app-merchant/app/src/main/java/com/tembus/merchant/ui/screens/home/HomeViewModel.kt`
- `backend/order-service/internal/service/order_food_merchant.go`
- `backend/order-service/internal/service/matching_service.go`

- [ ] Busy keeps store open but extends promised prep/ETA.
- [ ] Busy can be timed and visible to customer/matching.
- [ ] Pause stops new orders and remains separate state.

### FOOD-2026-012 — Quantity-aware inventory & scheduled availability

**Files to edit**
- `android-app-merchant/app/src/main/java/com/tembus/merchant/ui/screens/menu/MenuViewModel.kt`
- `android-app-merchant/app/src/main/java/com/tembus/merchant/ui/screens/menu/MenuItemEditorZipContent.kt`
- `backend/order-service/internal/repository/food_repository.go`
- `backend/order-service/internal/service/order_food.go`

- [ ] Optional stock/sales limits + reset window.
- [ ] Scheduled item availability.
- [ ] Atomic reserve/decrement/release under concurrency.
- [ ] Prevent oversell.

### FOOD-2026-013 — Out-of-stock substitution/customer approval

**Files to edit**
- `android-app-merchant/app/src/main/java/com/tembus/merchant/ui/screens/home/EditOrderScreen.kt`
- `android-app-merchant/app/src/main/java/com/tembus/merchant/ui/screens/home/EditOrderViewModel.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/detail/OrderDetailScreen.kt`
- `backend/order-service/internal/service/order_food.go`
- `backend/order-service/internal/service/refund_service.go`

- [ ] Merchant proposes remove/replace/quantity changes.
- [ ] Customer sees delta total and approve/reject/timeout.
- [ ] Promo/tax/payment/refund delta recompute atomically.
- [ ] Courier informed if handoff contents materially change.

### FOOD-2026-014 — Discovery/ranking 2026

**Files to edit**
- `FoodHomeScreen.kt`, `FoodFavoritesScreen.kt`, `FoodViewModel.kt`, `MerchantDetailScreen.kt`
- `backend/order-service/internal/repository/food_repository.go`

- [ ] Cuisine/category/filter/sort by ETA/fee/rating/promo/open/halal/Pickup.
- [ ] Reorder/recent/favorite/popular rails.
- [ ] Server-ranked paginated results combine relevance + availability + ETA + distance.
- [ ] Sponsored placement, jika ada, diberi label dan tidak mencemari organic score.

### FOOD-2026-015 — Operating hours maturity

**Files to edit**
- `android-app-merchant/app/src/main/java/com/tembus/merchant/ui/screens/home/OperatingHoursDialog.kt`
- `backend/order-service/internal/repository/food_repository.go`
- `backend/order-service/internal/service/order_food.go`

- [ ] Regular hours, holiday closure, temporary closure, last-order cutoff, future schedule validation.

### FOOD-2026-016 — Food-specific checkout options

**Files to edit**
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/food/FoodCheckoutScreen.kt`
- `backend/order-service/internal/domain/order_food.go`

- [ ] Cutlery toggle, merchant note, delivery note, gift/receiver privacy separated clearly.

### FOOD-2026-017 — Courier waiting/merchant issue flow

**Files to edit**
- `android-app/app/src/main/java/com/tembus/courier/ui/screens/order/OrderDetailScreen.kt`
- `android-app/app/src/main/java/com/tembus/courier/ui/screens/order/CourierIssueReportDialog.kt`
- `android-app/app/src/main/java/com/tembus/courier/ui/screens/order/FoodItemsCard.kt`
- `backend/order-service/internal/service/order_food.go`

- [ ] `arrived_at_merchant`, `order_not_ready`, waiting timer, ready signal.
- [ ] Structured issues: closed, item problem, excessive wait, wrong order, damaged packaging, handoff failure.
- [ ] Waiting time feeds ops analytics/compensation policy.

### FOOD-2026-018 — Merchant kitchen cockpit / SLA UX

**Files to edit**
- `android-app-merchant/app/src/main/java/com/tembus/merchant/ui/screens/home/StitchOrdersDashboardScreen.kt`
- `android-app-merchant/app/src/main/java/com/tembus/merchant/ui/screens/home/HomeViewModel.kt`
- `android-app-merchant/app/src/main/java/com/tembus/merchant/data/notifications/OrderAlertNotifier.kt`
- `android-app-merchant/app/src/main/java/com/tembus/merchant/data/printer/EscPos.kt`

- [ ] Lanes: new, scheduled, preparing, ready/driver-arriving, completed.
- [ ] Countdown based promised ready + courier ETA.
- [ ] Accept/reject consequence clear.
- [ ] Printer failure never blocks order state.

### FOOD-2026-019 — Ratings/reviews trust surfaces

**Files to edit**
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/food/MerchantDetailScreen.kt`
- `backend/order-service/internal/service/order_rating.go`
- merchant profile/review screen under `android-app-merchant/app/src/main/java/com/tembus/merchant/ui/screens/`

- [ ] Rating count/detail, merchant reply/report, food vs delivery rating separation, spam/fraud controls.

---

## P2 — Food Scale Features

### FOOD-2026-020 — Group orders & optional split payment

**Recommended new files**
- `backend/order-service/internal/domain/group_order.go`
- `backend/order-service/internal/service/group_order_service.go`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/food/GroupOrderScreen.kt`

- [ ] Shared cart, participant deadline, creator controls, conflict-safe updates, optional split payment.

### FOOD-2026-021 — Membership/free-delivery entitlement

**Recommended new files**
- `backend/order-service/internal/domain/membership.go`
- `backend/order-service/internal/service/membership_service.go`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/membership/MembershipScreen.kt`

- [ ] Entitlement, eligibility, subsidy accounting, transparent exclusions.

### FOOD-2026-022 — Personalized ranking/recommendation
- [ ] Privacy-aware signals, cold-start fallback, experiments, explainable controls.

### FOOD-2026-023 — Sponsored merchant/menu placement
- [ ] Explicit ad label, campaign/budget/attribution/fraud control, organic isolation.

### FOOD-2026-024 — Multi-store / Mix & Match exploration
- [ ] Treat as separate orchestration project; do not overload current single-merchant invariants prematurely.

### FOOD-2026-025 — POS/KDS integration

**Recommended new files**
- `backend/integration-gateway/internal/domain/pos_provider.go`
- `backend/integration-gateway/internal/handler/pos_handler.go`

- [ ] Order injection/ack, catalog/stock sync, reconciliation, connector health.

### FOOD-2026-026 — Adaptive UI/accessibility modernization

**Files to edit**
- Food screens in customer Android
- Merchant Food screens
- Courier Food order screens

- [ ] Phone/tablet/foldable behavior, dynamic type, screen reader, touch targets, contrast, reduced-motion.

---

# PART D — TAMBAL BAN END-TO-END

## P0

### TIRE-2026-001 — Emergency location + structured problem context

**Files to edit**
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/service/TambalBanHomeScreen.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/service/TambalBanHomeViewModel.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/service/ServiceBookingScreen.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/service/ServiceBookingViewModel.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/components/VehicleDetailInput.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/data/model/ServiceModels.kt`

**Implementation checklist**
- [ ] Jangan gunakan `0.0,0.0` sebagai fallback location yang bisa lanjut transaksi.
- [ ] Customer dapat koreksi pin bila GPS tidak tepat.
- [ ] Capture vehicle type, tire position/count, symptom/damage, spare-tire availability, notes/photo if useful.
- [ ] Tampilkan safety guidance singkat bila posisi kendaraan berbahaya tanpa membuat user melewati booking utama.
- [ ] Selected location change invalidates technician list + quote.

---

### TIRE-2026-002 — Capability-safe technician discovery & selection

**Files to edit**
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/service/NearbyCouriersScreen.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/service/NearbyCouriersViewModel.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/service/CourierDetailScreen.kt`
- `backend/order-service/internal/domain/tambalban.go`
- `backend/order-service/internal/handler/tambalban_handler.go`
- `backend/order-service/internal/service/availability_service.go`
- `backend/order-service/internal/service/matching_service.go`

**Implementation checklist**
- [ ] Technician result filters exact capability `tambal_ban_motor/mobil`.
- [ ] Show rating count, ETA, distance, service price, vehicle compatibility, online/current workload state.
- [ ] Expired/stale availability cannot be selected silently.
- [ ] Preferred technician selection is server validated at create time.
- [ ] If selected technician becomes unavailable, provide reselect/rematch flow.

---

### TIRE-2026-003 — Quote + on-site additional cost approval

**Files to edit**
- `ServiceBookingScreen.kt` and `ServiceBookingViewModel.kt` under customer `ui/screens/service/`
- `android-app/app/src/main/java/com/tembus/courier/ui/screens/service/ServiceUpgradeScreen.kt`
- `android-app/app/src/main/java/com/tembus/courier/ui/screens/service/ServiceUpgradeViewModel.kt`
- `backend/order-service/internal/service/pricing_service.go`
- `backend/order-service/internal/handler/tambalban_handler.go`

**Recommended new files**
- `backend/order-service/internal/domain/service_adjustment.go`
- `backend/order-service/internal/service/service_adjustment_service.go`
- `backend/order-service/internal/handler/service_adjustment_handler.go`
- `database/migrations/<timestamp>_add_service_adjustments.sql`

**Implementation checklist**
- [ ] Initial quote server-authoritative dan snapshot technician/service fee.
- [ ] Material/repair upgrade setelah inspeksi harus dibuat sebagai structured adjustment proposal.
- [ ] Proposal menunjukkan old total, additions, reason/material, new total, expiry.
- [ ] Customer approve/reject eksplisit sebelum technician melakukan chargeable extra work.
- [ ] Approval + financial adjustment + audit atomic/idempotent.
- [ ] Technician tidak boleh mengubah total final hanya dari client UI.

---

### TIRE-2026-004 — Arrival → inspection → repair → proof → completion lifecycle

**Files to edit**
- `android-app/app/src/main/java/com/tembus/courier/domain/TambalBanFlow.kt`
- `android-app/app/src/main/java/com/tembus/courier/ui/screens/service/TambalBanFlowScreen.kt`
- `android-app/app/src/main/java/com/tembus/courier/ui/screens/service/TambalBanFlowViewModel.kt`
- `android-app/app/src/main/java/com/tembus/courier/ui/screens/service/InspectTireScreen.kt`
- `android-app/app/src/main/java/com/tembus/courier/ui/screens/order/TambalBanReportCard.kt`
- `backend/order-service/internal/domain/tambalban.go`
- `backend/order-service/internal/handler/tambalban_handler.go`

**Implementation checklist**
- [ ] Canonical sequence: assigned → navigating → arrived/on-site → inspection → approved work → repair → after-proof → completed.
- [ ] Before/after tire photo requirement configurable but server validated.
- [ ] Materials/duration/notes are structured report fields.
- [ ] Step cannot be skipped by reopening/deep-link client.
- [ ] Customer tracking/detail exposes current human-readable service stage.

---

### TIRE-2026-005 — Payment, warranty/claim & rating

**Files to edit**
- `backend/order-service/internal/service/payment_service.go`
- `backend/order-service/internal/service/payout_service.go`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/service/ServiceReportScreen.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/service/ServiceReportViewModel.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/detail/OrderDetailScreen.kt`
- `frontend/src/app/(portal)/disputes/page.tsx` if web support is shared for claims

**Recommended new files if warranty is a product requirement**
- `backend/order-service/internal/domain/service_warranty.go`
- `backend/order-service/internal/service/service_warranty_service.go`

**Implementation checklist**
- [ ] Settlement only after completion/proof invariant.
- [ ] Customer sees final report and approved adjustments.
- [ ] Claim/dispute links to immutable before/after evidence.
- [ ] Rating can distinguish technician service quality from generic delivery rating.

---

## P1 — Tambal Ban UI/UX

### TIRE-2026-006 — Emergency-first UI/UX

**Files to edit**
- `TambalBanHomeScreen.kt`
- `TambalBanSearchScreen.kt`
- `NearbyCouriersScreen.kt`
- `CourierDetailScreen.kt`
- `ServiceBookingScreen.kt`
- `ServiceTrackingScreen.kt`

**Implementation checklist**
- [ ] First screen asks what vehicle/problem/location, not operational jargon.
- [ ] Technician cards prioritize ETA, capability, rating, total estimate.
- [ ] Tracking prioritizes “petugas menuju Anda / tiba / inspeksi / pengerjaan / selesai”.
- [ ] Additional charge approval uses high-clarity confirmation with reason and total delta.
- [ ] Safety copy concise and contextual.

---

# PART E — AGGREGATOR PAKET ANTAR-KOTA END-TO-END

## P0

### AGG-2026-001 — Remove hardcoded CGK, mock cities & static provider truth

**Files to edit**
- `frontend/src/components/orders/AggregatorWizard.tsx`
- `frontend/src/components/orders/AggregatorForm.tsx`
- `frontend/src/components/orders/OrderSchemas.ts`
- `frontend/src/app/(portal)/orders/new/aggregator/page.tsx`
- `backend/order-service/internal/handler/parcel_handler.go`
- `backend/integration-gateway/internal/domain/provider.go`
- `backend/integration-gateway/internal/handler/logistics_handler.go`
- `backend/integration-gateway/cmd/api/main.go`

**Recommended new files**
- `frontend/src/hooks/useLogisticsLocations.ts`
- `frontend/src/hooks/useLogisticsProviders.ts`
- `frontend/src/types/logistics.ts`

**Implementation checklist**
- [ ] Derive origin city/code dari validated pickup address/location; jangan default `CGK` untuk semua user.
- [ ] Destination uses provider-compatible canonical location code resolved by backend.
- [ ] Provider list berasal dari backend capabilities/config, bukan static UI list.
- [ ] Provider unavailable/circuit-open state terlihat dan tidak selectable.
- [ ] City/location search paginated/searchable; jangan embed mock list sebagai production fallback.

---

### AGG-2026-002 — Backend-mediated geocoding/location normalization

**Files to edit**
- `frontend/src/components/orders/AggregatorWizard.tsx`
- `frontend/src/components/orders/AddressPicker.tsx`
- `backend/integration-gateway/internal/handler/maps_handler.go`
- `backend/integration-gateway/internal/provider/maps_factory.go`
- `backend/integration-gateway/internal/provider/tomtom.go`
- `backend/order-service/internal/repository/maps_repository.go`

**Recommended new file if integration contract needs dedicated location endpoint**
- `backend/integration-gateway/internal/handler/logistics_location_handler.go`

**Implementation checklist**
- [ ] Remove browser direct request to Nominatim.
- [ ] Geocode/reverse-geocode melalui controlled backend API dengan timeout/retry/rate policy.
- [ ] Normalize city/district/postal/provider code separately from display label.
- [ ] Cache safely where possible.
- [ ] Never expose server provider key to browser.

---

### AGG-2026-003 — Authoritative carrier rate snapshot

**Files to edit**
- `frontend/src/components/orders/AggregatorWizard.tsx`
- `frontend/src/hooks/useLogisticsTariff.ts`
- `backend/integration-gateway/internal/handler/logistics_handler.go`
- `backend/integration-gateway/internal/provider/jne_adapter.go`
- `backend/integration-gateway/internal/provider/jnt_adapter.go`
- `backend/integration-gateway/internal/provider/logistics_test.go`
- `backend/order-service/internal/handler/parcel_handler.go`
- `backend/order-service/internal/service/pricing_service.go`
- `backend/order-service/internal/service/payment_link_service.go`

**Recommended new files**
- `backend/order-service/internal/domain/aggregator_quote.go`
- `backend/order-service/internal/service/aggregator_quote_service.go`
- `backend/order-service/internal/service/aggregator_quote_service_test.go`

**Implementation checklist**
- [ ] Rate request includes normalized origin/destination, chargeable weight, dimensions, category/value, COD/insurance flags.
- [ ] Persist selected provider service + gross/net tariff + ETA + provider/rule version + expiry.
- [ ] Carrier rate changes after review produce requote instead of silent change.
- [ ] Display provider ETA as provider promise/range; do not invent local ETA.
- [ ] Circuit breaker/provider error becomes typed degraded state.

---

### AGG-2026-004 — Replace manual fake-success with real create-order

**Current production blocker:** manual mode in `AggregatorWizard.tsx` currently simulates a delay then navigates to `/orders?success=true`.

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

**Implementation checklist**
- [ ] Manual final submit calls real API using idempotency key + selected aggregator quote.
- [ ] API returns persisted order id/reference before success navigation.
- [ ] Payment policy explicitly handled before/after AWB creation.
- [ ] Browser refresh/retry rehydrates existing transaction instead of creating duplicate.
- [ ] Success page/history verifies order exists server-side.
- [ ] Remove all fake delay/mock success from production path.

**Acceptance criteria**
- [ ] Network tab shows a real create mutation.
- [ ] Created order appears in database/order API/history and survives logout/login.
- [ ] API failure cannot show success.

---

### AGG-2026-005 — Bulk upload safety & resumable processing

**Files to edit**
- `frontend/src/components/orders/AggregatorWizard.tsx`
- `frontend/src/app/(portal)/orders/bulk/page.tsx`
- `frontend/src/components/orders/bulk/UploadStep.tsx`
- `frontend/src/components/orders/bulk/ReviewStep.tsx`
- `frontend/src/components/orders/bulk/PaymentStep.tsx`
- `frontend/src/lib/csv.ts`
- backend bulk endpoints wired by Order/API service

**Recommended new tests**
- `frontend/e2e/aggregator-bulk-flow.spec.ts`
- `backend/order-service/internal/service/order_bulk_idempotency_test.go`

**Implementation checklist**
- [ ] Validate file schema, row count, duplicate client reference, phone/address/weight/destination before processing.
- [ ] Show per-row valid/error status and downloadable error report.
- [ ] Bulk process idempotent per job and per row.
- [ ] Partial failure does not hide successful child orders.
- [ ] Payment maps exact order set/version; adding/removing rows invalidates payment quote.
- [ ] Polling can resume after refresh using persisted `job_id` scoped to owner.
- [ ] No user can query another customer's job id.

---

### AGG-2026-006 — First-mile pickup → provider AWB → carrier handoff

**Files to edit**
- `backend/order-service/internal/service/payment_link_service.go`
- `backend/order-service/internal/service/resi_service.go`
- `backend/order-service/internal/handler/resi_handler.go`
- `backend/order-service/internal/handler/proof_handler.go`
- `android-app/app/src/main/java/com/tembus/courier/ui/screens/order/PackageChecklistCard.kt`
- `android-app/app/src/main/java/com/tembus/courier/ui/screens/scan/ScanScreen.kt`
- `frontend/src/app/(portal)/resi/page.tsx`
- `frontend/src/app/(portal)/resi/[id]/page.tsx`
- `admin-dashboard/src/pages/settings/logisticsawb.tsx`

**Recommended new files**
- `backend/order-service/internal/domain/carrier_handoff.go`
- `backend/order-service/internal/service/carrier_handoff_service.go`

**Implementation checklist**
- [ ] Define who creates AWB and at what financial/order state.
- [ ] AWB creation retry idempotent; do not generate multiple provider shipments.
- [ ] First-mile courier pickup has chain-of-custody proof.
- [ ] Carrier handoff records provider, AWB, handoff time/location/evidence/actor.
- [ ] Once carrier accepts parcel, internal state maps cleanly into provider tracking state.

---

### AGG-2026-007 — Normalize provider tracking webhooks

**Files to edit**
- `backend/integration-gateway/internal/handler/tracking_webhook_handler.go`
- `backend/integration-gateway/internal/domain/provider.go`
- `backend/order-service/internal/handler/delivery_webhook_handler.go`
- `backend/order-service/internal/service/tracking_service.go`
- `backend/order-service/internal/service/order_events.go`
- `frontend/src/app/(portal)/orders/[id]/OrderDetailContent.tsx`
- `frontend/src/app/(portal)/resi/[id]/page.tsx`
- `frontend/src/app/cek-resi/page.tsx`

**Recommended new files**
- `backend/integration-gateway/internal/domain/carrier_event.go`
- `backend/integration-gateway/internal/provider/carrier_event_normalizer.go`
- `backend/integration-gateway/internal/provider/carrier_event_normalizer_test.go`

**Implementation checklist**
- [ ] Verify webhook authenticity/signature/provider allowlist where supported.
- [ ] Persist provider event id/raw reference before processing for dedupe/audit.
- [ ] Normalize picked-up/in-transit/hub/out-for-delivery/delivered/failed/return/lost/damaged.
- [ ] Out-of-order provider event cannot regress terminal status.
- [ ] Unknown provider status stored for investigation without corrupting customer state.

---

### AGG-2026-008 — COD, return, lost/damaged & claim finance flow

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

**Implementation checklist**
- [ ] COD eligibility/provider fee/remittance state modeled explicitly.
- [ ] Return-to-sender has reason, fee owner, new tracking lifecycle.
- [ ] Lost/damaged claim references item value, insurance, provider liability, evidence, payout state.
- [ ] Provider reimbursement and customer refund never double-credit ledger.
- [ ] Admin claim override auditable.

---

## P1 — Aggregator Customer Web UI/UX

### AGG-2026-009 — Wizard redesign around logistics decisions, not internal fields

**Files to edit**
- `frontend/src/app/(portal)/orders/new/aggregator/page.tsx`
- `frontend/src/components/orders/AggregatorWizard.tsx`
- `frontend/src/components/orders/AggregatorForm.tsx`
- `frontend/src/components/orders/AddressPicker.tsx`
- `frontend/src/components/orders/OrderSummary.tsx`

**Implementation checklist**
- [ ] Recommended step order: Pickup → Receiver/Package → Compare Carrier → Review & Pay.
- [ ] Carrier cards show logo/name/service, ETA promise, chargeable weight, price, COD/insurance capabilities, known limitation.
- [ ] Explain volumetric weight with compact helper, not logistics jargon dump.
- [ ] Preserve form values on back/forward.
- [ ] Success only after persisted order.
- [ ] Clear distinction between first-mile status and external carrier status.

---

# PART F — TOWING END-TO-END

## P0

### TOW-2026-001 — Structured Towing booking: exact pickup, destination, vehicle & incident facts

**Files to edit**
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/service/ServiceBookingScreen.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/service/ServiceBookingViewModel.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/components/VehicleDetailInput.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/data/model/ServiceModels.kt`
- `backend/order-service/internal/domain/tambalban.go`
- `backend/order-service/internal/handler/tambalban_handler.go`

**Recommended new customer files only if generic screen becomes too branch-heavy**
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/service/TowingBookingScreen.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/service/TowingBookingViewModel.kt`

**Implementation checklist**
- [ ] Pickup pin can be corrected; reject `0,0` fallback.
- [ ] Destination must be selected from normalized geocode/pin, not free text only.
- [ ] Capture vehicle type, make/model if needed, wheel/steering condition, drivable/non-drivable, damage/incident notes, access constraints.
- [ ] Replace parcel-shaped placeholders (`small`, zero weight/dimensions, recipient `Customer`, phone `-`) with proper structured service metadata or explicit nullable non-parcel fields.
- [ ] Show route preview and selected towing provider/operator.
- [ ] Customer contact comes from authenticated/customer/receiver profile, not placeholder string.

---

### TOW-2026-002 — Capability & vehicle-safe towing matching

**Files to edit**
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/service/NearbyCouriersScreen.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/service/NearbyCouriersViewModel.kt`
- `backend/order-service/internal/domain/tambalban.go`
- `backend/order-service/internal/service/availability_service.go`
- `backend/order-service/internal/service/matching_service.go`
- `backend/order-service/internal/handler/tambalban_handler.go`
- `android-app/app/src/main/java/com/tembus/courier/ui/components/service/ServiceModeSelector.kt`

**Implementation checklist**
- [ ] `towing_motor` and `towing_mobil` capability validated server-side.
- [ ] Operator/vehicle capacity compatibility validated before offer/accept.
- [ ] Current availability/active job/radius considered.
- [ ] Customer cannot force an incompatible preferred courier id.
- [ ] Reassignment preserves inspection/evidence ownership rules.

---

### TOW-2026-003 — Route/toll-aware quote + explicit requote approval

**Files to edit**
- `ServiceBookingScreen.kt` and `ServiceBookingViewModel.kt` under customer service screens
- `backend/order-service/internal/service/pricing_service.go`
- `backend/order-service/internal/handler/tambalban_handler.go`
- `android-app/app/src/main/java/com/tembus/courier/ui/screens/service/ServiceUpgradeScreen.kt`

**Use shared recommended files from `TIRE-2026-003`**
- `service_adjustment.go`
- `service_adjustment_service.go`
- `service_adjustment_handler.go`

**Implementation checklist**
- [ ] Quote is based on actual pickup→dropoff route, service subtype/operator price, distance, toll policy, platform fee, insurance if any.
- [ ] Replace vague UI statement “biaya final dapat disesuaikan admin/support” with an explicit adjustment/requote protocol.
- [ ] Route/toll/vehicle-condition change produces proposal with old/new total and reason.
- [ ] Customer approval required before material charge increase except documented emergency policy.
- [ ] Admin cannot mutate final amount silently.

---

### TOW-2026-004 — Inspection → loading → transit → unloading → completion proof

**Files to edit**
- `android-app/app/src/main/java/com/tembus/courier/domain/TowingFlow.kt`
- `android-app/app/src/main/java/com/tembus/courier/ui/screens/service/TowingFlowScreen.kt`
- `android-app/app/src/main/java/com/tembus/courier/ui/screens/service/TowingFlowViewModel.kt`
- `android-app/app/src/main/java/com/tembus/courier/ui/screens/service/InspectVehicleScreen.kt`
- `android-app/app/src/main/java/com/tembus/courier/ui/components/service/TowingProgressSteps.kt`
- `android-app/app/src/main/java/com/tembus/courier/ui/screens/order/TowingReportCard.kt`
- `android-app/app/src/main/java/com/tembus/courier/data/repository/ServiceReportProofUploader.kt`
- `backend/order-service/internal/domain/tambalban.go`
- `backend/order-service/internal/handler/tambalban_handler.go`

**Implementation checklist**
- [ ] Mandatory before-condition proof before loading.
- [ ] Capture odometer/vehicle condition only where operationally useful.
- [ ] Loading photo/timestamp precedes transit state.
- [ ] Transit state cannot start if required loading proof missing.
- [ ] Unloading proof + destination verification precedes completion.
- [ ] Completion photo/signature policy server validated.
- [ ] Customer can inspect final towing report after completion.

---

### TOW-2026-005 — Damage dispute protection

**Files to edit**
- Towing files in `TOW-2026-004`
- `frontend/src/app/(portal)/disputes/page.tsx` if shared customer dispute surface is used
- `admin-dashboard/src/pages/Disputes.tsx`
- `backend/order-service/internal/handler/proof_handler.go`

**Recommended new files if claim logic diverges from generic dispute**
- `backend/order-service/internal/domain/towing_claim.go`
- `backend/order-service/internal/service/towing_claim_service.go`

**Implementation checklist**
- [ ] Before evidence becomes immutable once transit begins.
- [ ] After evidence records same vehicle/order/operator.
- [ ] Dispute workflow can compare before vs after proof.
- [ ] Manual liability decision records actor/reason/evidence references.
- [ ] Financial compensation reconciles with payment/insurance/settlement.

---

### TOW-2026-006 — Customer service tracking parity

**Files to edit**
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/service/ServiceTrackingScreen.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/service/ServiceTrackingViewModel.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/detail/OrderDetailScreen.kt`
- `backend/order-service/internal/service/tracking_service.go`

**Implementation checklist**
- [ ] Human-readable stages: operator menuju pickup → tiba → inspeksi → loading → perjalanan → unloading → selesai.
- [ ] Route/ETA refresh at meaningful transitions.
- [ ] Show operator identity/capability and safe contact option.
- [ ] Offline/reconnect recovery uses snapshot.

---

## P1 — Towing architecture/UI

### TOW-2026-007 — Conditional backend split when shared Tambal/Towing file becomes a liability

**Current rule:** do **not** split merely for naming cleanliness.

**Recommended new files only if complexity threshold is reached**
- `backend/order-service/internal/domain/towing.go`
- `backend/order-service/internal/handler/towing_handler.go`
- `backend/order-service/internal/service/towing_service.go`
- `backend/order-service/internal/repository/towing_repository.go`
- `backend/order-service/internal/service/towing_service_test.go`

**Split trigger checklist**
- [ ] Towing transition rules materially diverge from Tambal Ban.
- [ ] Towing pricing/adjustment logic has independent dependencies.
- [ ] Towing report/claim code dominates shared file.
- [ ] Split preserves shared interfaces for availability/settlement where useful.

### TOW-2026-008 — Towing UI/UX safety & trust pass

- [ ] Customer sees pickup and destination visually before quote.
- [ ] Vehicle compatibility is explained before operator selection.
- [ ] Price adjustments always require explicit understandable consent.
- [ ] Before-condition evidence is visible as a trust feature, not hidden operational metadata.
- [ ] Destructive cancellation clearly explains fee before confirmation.

---

# PART G — CUSTOMER WEB PLATFORM (PAKET + AGGREGATOR)

## WEB-2026-001 — No fake or optimistic transaction success

**Files to edit**
- `frontend/src/components/orders/AggregatorWizard.tsx`
- `frontend/src/components/orders/OnDemandOrderForm.tsx`
- `frontend/src/components/orders/PaymentModal.tsx`
- `frontend/src/lib/api.ts`

- [ ] Success state requires persisted server resource.
- [ ] Network error/timeout shows pending/retry status rather than success.
- [ ] Duplicate browser submit uses same idempotency key.
- [ ] Reload after submit can resolve order by client transaction/idempotency reference.

---

## WEB-2026-002 — Service-aware history/detail/resi semantics

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

- [ ] Paket Instan and Aggregator render correct service labels and stage vocabulary.
- [ ] External carrier tracking is visually distinct from LANCAR first-mile status.
- [ ] Price/refund/payment state is not mixed with delivery state.
- [ ] Timeline handles unknown future states gracefully.

---

## WEB-2026-003 — Accessibility, responsive & failure recovery baseline

**Files to edit**
- `frontend/src/components/a11y/FocusTrap.tsx`
- `frontend/src/components/a11y/VisuallyHidden.tsx`
- `frontend/src/components/a11y/useAnnounce.ts`
- order pages/components listed above

- [ ] Keyboard navigation, focus restore, form error association, screen-reader status announcement.
- [ ] Mobile viewport does not hide sticky CTA or modal actions.
- [ ] Loading skeleton does not look like final amount/status.
- [ ] Empty/error/offline states have explicit recovery actions.

---

# PART H — SHARED CUSTOMER & COURIER UI/UX

## UX-2026-001 — Customer Dashboard information architecture for 5 services

**Files to edit**
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/main/DashboardScreen.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/components/ServiceGridMenu.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/components/ServiceIcons.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/navigation/RootNavGraph.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/navigation/Screen.kt`

- [ ] Five service entries have distinct labels, purpose, icon, and expectation.
- [ ] Recommended naming: `Paket Instan`, `Food`, `Tambal Ban`, `Ekspedisi Antar-Kota`, `Towing`.
- [ ] Do not use similar package icons/text for on-demand and aggregator without explanatory subtitle.
- [ ] Emergency services Tambal Ban/Towing are easy to reach but not visually confused with normal delivery.
- [ ] Deep link lands at correct service context.

---

## UX-2026-002 — One history/detail shell, service-specific sections

**Files to edit**
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/history/OrderHistoryScreen.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/detail/OrderDetailScreen.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/detail/OrderDetailViewModel.kt`

**Recommended new files**
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/detail/OrderDetailSections.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/detail/OrderActionPolicy.kt`

- [ ] Shared shell handles status, price, timeline, support.
- [ ] Service sections show only relevant fields: package, food, roadside, carrier, towing.
- [ ] Action policy determines cancel/pay/track/rate/claim based on state+service, not scattered UI conditions.
- [ ] Unsupported state never crashes screen.

---

## UX-2026-003 — Courier service-mode clarity

**Files to edit**
- `android-app/app/src/main/java/com/tembus/courier/ui/components/service/ServiceModeSelector.kt`
- `android-app/app/src/main/java/com/tembus/courier/ui/components/OnDemandServiceActivationCard.kt`
- `android-app/app/src/main/java/com/tembus/courier/ui/components/OnDemandServiceToggleRow.kt`
- `android-app/app/src/main/java/com/tembus/courier/ui/screens/order/OrderDetailScreen.kt`

- [ ] Courier understands active capability/mode before receiving offer.
- [ ] Offer card exposes service type, required capability, earnings, route, special proof requirement.
- [ ] Food/Tambal/Towing/Paket visual cues differ enough to prevent wrong workflow.
- [ ] Disabling capability stops new offers without breaking active job.

---

## UX-2026-004 — Notification/deep-link consistency

**Files to edit**
- `backend/order-service/internal/service/push_service.go`
- `backend/order-service/internal/handler/push_handler.go`
- `android-app/app/src/main/java/com/tembus/courier/service/TEMBUSFirebaseMessagingService.kt`
- `android-app/app/src/main/java/com/tembus/courier/notification/NotificationLaunchTarget.kt`
- customer Android notification/deep-link handling
- `frontend/src/components/PushNotificationPrompt.tsx`
- `frontend/src/lib/deepLink.ts`

- [ ] Every push contains service/category + order id + target route + event/state version.
- [ ] Stale push cannot regress UI.
- [ ] Deep link to cancelled/completed order opens current detail snapshot gracefully.

---

# PART I — ADMIN / OPERATIONS

## OPS-2026-001 — Unified operational order timeline & service filter

**Files to edit**
- `admin-dashboard/src/components/ActiveOrdersTable.tsx`
- `admin-dashboard/src/pages/Orders.tsx`
- `admin-dashboard/src/pages/AuditLogs.tsx`
- `admin-dashboard/src/pages/Disputes.tsx`
- `admin-dashboard/src/components/LiveMap.tsx`
- `admin-dashboard/src/lib/api.ts`
- `backend/order-service/internal/handler/admin_handler.go`
- `backend/order-service/internal/handler/analytics_handler.go`

**Recommended new backend files if current admin API lacks timeline aggregate**
- `backend/order-service/internal/service/order_audit_service.go`
- `backend/order-service/internal/handler/order_audit_handler.go`

- [ ] Admin filters by 5 service categories + subtype/provider/merchant/courier/payment state.
- [ ] One timeline shows business transitions, actor, proof, payment, refund, provider events, override.
- [ ] Admin sees state version/correlation id for debugging but customer-inappropriate details stay hidden from customer UI.
- [ ] Manual override action always reasoned/audited.

---

## OPS-2026-002 — Exception queues instead of silent stuck orders

**Files to edit**
- `admin-dashboard/src/pages/Orders.tsx`
- `admin-dashboard/src/pages/FinanceContent.tsx`
- `admin-dashboard/src/pages/finance/reconciliationPanel.tsx`
- `admin-dashboard/src/pages/finance/treasury/ManualReviewSection.tsx`

**Recommended new page if current Orders filters become overloaded**
- `admin-dashboard/src/pages/OrderExceptions.tsx`

**Exception checklist**
- [ ] No courier/technician/operator.
- [ ] Payment pending beyond SLA.
- [ ] Paid but create/dispatch inconsistency.
- [ ] Provider AWB failed/circuit open.
- [ ] Carrier webhook unknown/out-of-order.
- [ ] Food merchant timeout/late readiness.
- [ ] Tambal/Towing adjustment awaiting approval too long.
- [ ] Mandatory proof missing.
- [ ] Completed but settlement/reconciliation mismatch.

---

# PART J — OBSERVABILITY & BUSINESS METRICS

## OBS-2026-001 — Common transaction telemetry

**Files to edit**
- `backend/order-service/internal/service/analytics_service.go`
- `backend/order-service/internal/handler/analytics_handler.go`
- `backend/order-service/cmd/api/main.go`
- `frontend/src/lib/clientLogger.ts`
- `admin-dashboard/src/lib/clientLogger.ts`
- `admin-dashboard/src/pages/Analytics.tsx`

- [ ] Quote latency/success/requote rate.
- [ ] Idempotent duplicate attempts prevented.
- [ ] Create-to-payment and payment-to-dispatch latency.
- [ ] Matching time/reassign/no-supply rate.
- [ ] State transition latency and invalid transition attempts.
- [ ] Realtime disconnect/recovery mismatch.
- [ ] Payment/refund/payout/reconciliation exceptions.
- [ ] Proof/handoff failure/replay/override.
- [ ] Crash/ANR/client network errors by service.

---

## OBS-2026-002 — Service-specific KPI dashboard

- [ ] **Paket:** quote→order, match time, pickup SLA, delivery SLA, failed delivery, POD failure, cancellation reason.
- [ ] **Food:** merchant acceptance/timeout, prep prediction accuracy, courier wait, handoff failures, delivery ETA error, refunds.
- [ ] **Tambal Ban:** technician discovery→booking, technician ETA, onsite duration, adjustment approval, repeat claim.
- [ ] **Aggregator:** rate-provider success, selected provider mix, AWB failure, carrier SLA, lost/damaged/return, COD reconciliation.
- [ ] **Towing:** operator match, arrival SLA, loading time, transit ETA error, adjustment rate, damage dispute.

---

# PART K — AUTOMATED TESTING / QA RELEASE GATES

## QA-2026-001 — Paket Android E2E

**Recommended new tests**
- `android-app-customer/app/src/androidTest/java/com/tembus/customer/PackageOrderFlowTest.kt`
- `backend/order-service/internal/service/order_package_e2e_test.go`

- [ ] Saved/manual/current-location address.
- [ ] Quote expiry/requote.
- [ ] Double submit.
- [ ] Payment pending/fail/late callback.
- [ ] Courier accept race/reassign/no supply.
- [ ] Pickup verification.
- [ ] Offline/reconnect tracking.
- [ ] Failed delivery/POD/dispute.

## QA-2026-002 — Food cross-app E2E

**Recommended new tests**
- `backend/order-service/internal/service/order_food_e2e_test.go`
- merchant/customer/courier instrumentation tests for critical handoff states.

- [ ] Complete all mandatory scenarios under `FOOD-2026-007`.

## QA-2026-003 — Tambal Ban E2E

**Recommended new tests**
- `backend/order-service/internal/service/tambalban_e2e_test.go`
- `android-app-customer/app/src/androidTest/java/com/tembus/customer/TambalBanFlowTest.kt`

- [ ] GPS denied/manual pin.
- [ ] Capability matching.
- [ ] Technician becomes unavailable.
- [ ] Quote + adjustment approve/reject.
- [ ] Inspection/proof cannot skip.
- [ ] Completion/settlement/claim.

## QA-2026-004 — Aggregator Customer Web E2E

**Recommended new file**
- `frontend/e2e/aggregator-order-flow.spec.ts`

- [ ] Real location/provider/rate.
- [ ] Manual persisted create; explicitly fail test if only redirect occurs.
- [ ] Duplicate submit.
- [ ] Provider unavailable/rate expiry.
- [ ] Payment/AWB success and failure.
- [ ] History/detail/resi tracking.
- [ ] Carrier webhook progression and return/lost scenario.

## QA-2026-005 — Towing E2E

**Recommended new tests**
- `backend/order-service/internal/service/towing_e2e_test.go`
- `android-app-customer/app/src/androidTest/java/com/tembus/customer/TowingFlowTest.kt`
- `android-app/app/src/androidTest/java/com/tembus/courier/TowingCourierFlowTest.kt`

- [ ] Pickup/dropoff validation.
- [ ] Capability match.
- [ ] Route quote/requote approval.
- [ ] Before proof → loading → transit → unloading → after proof/signature.
- [ ] Cancel before/after operator departure.
- [ ] Damage dispute evidence integrity.

## QA-2026-006 — Paket Customer Web E2E

**Recommended new file**
- `frontend/e2e/ondemand-package-flow.spec.ts`

- [ ] Create → quote → payment → history → detail → tracking → completion.
- [ ] Refresh/back/retry idempotency.
- [ ] Address mismatch/requote.
- [ ] Mobile responsive and keyboard navigation smoke test.

## QA-2026-007 — Backend concurrency & replay suite

**Recommended new files**
- `backend/order-service/internal/service/order_concurrency_test.go`
- `backend/order-service/internal/service/webhook_replay_test.go`
- `backend/order-service/internal/service/financial_invariants_test.go`

- [ ] Parallel create.
- [ ] Parallel courier accept.
- [ ] Duplicate payment/refund/provider callback.
- [ ] Out-of-order state events.
- [ ] Concurrent service adjustment approval/cancel.
- [ ] Terminal-state immutability.

---

# PART L — DATABASE / MIGRATION PLAN

## DATA-2026-001 — Schema changes required by hardening

**Migration directory:** `database/migrations/`

**Recommended migration names — create only after checking current schema to avoid duplicate columns/tables**
- `database/migrations/<timestamp>_add_order_idempotency_keys.sql`
- `database/migrations/<timestamp>_add_order_quote_snapshots.sql`
- `database/migrations/<timestamp>_add_order_state_version.sql`
- `database/migrations/<timestamp>_add_handoff_verification.sql`
- `database/migrations/<timestamp>_add_service_adjustments.sql`
- `database/migrations/<timestamp>_add_carrier_event_inbox.sql`
- `database/migrations/<timestamp>_add_reconciliation_exceptions.sql`

**Implementation checklist**
- [ ] Inspect current schema/migrations first; reuse existing table when semantics match.
- [ ] Every migration has safe up/down or documented irreversible strategy.
- [ ] Backfill legacy orders without inventing false facts.
- [ ] Add indexes/uniques needed for idempotency, provider event dedupe, owner queries, exception queues.
- [ ] Large backfill separated from blocking schema migration if needed.

---

# PART M — SECURITY, PRIVACY & FRAUD

## SEC-2026-001 — AuthZ, public-token & data-exposure hardening

**Files to edit**
- `backend/order-service/internal/middleware/auth_middleware.go`
- `backend/order-service/internal/middleware/rate_limiter.go`
- `backend/order-service/internal/middleware/validator.go`
- `frontend/src/middleware.ts`
- `frontend/src/lib/customerSession.ts`
- `frontend/src/app/track/[token]/page.tsx`
- `admin-dashboard/src/lib/csrf.ts`
- `admin-dashboard/src/pages/settings/security.tsx`

- [ ] Every order/proof/job/payment/refund/claim lookup verifies owner/role.
- [ ] Public tracking token scoped+expiring/revocable.
- [ ] Proof object access uses controlled URL policy.
- [ ] Location retention/precision follows least privilege.
- [ ] Rate limit geocode, quote, OTP, tracking/public endpoints, and abuse-prone mutations.

## SEC-2026-002 — Cross-service fraud/abuse controls

- [ ] Voucher/payment abuse signals do not block legitimate retries.
- [ ] Fake GPS/impossible movement monitoring for courier operational review.
- [ ] Handoff brute-force attempts rate-limited and audited.
- [ ] Repeated cancellation after courier/operator departure surfaced for policy review.
- [ ] Provider webhook signature/replay protection.
- [ ] Manual financial override threshold can require elevated role/dual review where risk warrants it.

---

# PART N — FINAL UI/UX ACCEPTANCE BY SERVICE

## N1 — Paket On-Demand
- [ ] User can understand pickup, destination, package, vehicle/service, ETA, total, receiver, and cancellation before paying.
- [ ] Tracking communicates one clear next step at every stage.
- [ ] Web and Android tell the same price/state story.

## N2 — Food
- [ ] Discovery → menu → customization → cart → destination → quote/payment → live order is understandable without operational jargon.
- [ ] Merchant UI optimizes prep/SLA; courier UI optimizes pickup readiness/handoff; customer UI optimizes confidence.

## N3 — Tambal Ban
- [ ] Emergency booking is short, location-first, capability-aware, and does not hide additional cost approval.
- [ ] Before/after service report creates visible trust.

## N4 — Aggregator
- [ ] User understands LANCAR pickup vs external carrier delivery responsibilities.
- [ ] Carrier comparison uses real rate/capability data.
- [ ] Success cannot exist without persisted order/AWB path.

## N5 — Towing
- [ ] Pickup/destination/vehicle compatibility/route/price are clear before booking.
- [ ] Any price increase is explicit and consented.
- [ ] Inspection/loading/unloading evidence protects customer and operator.

---

# PART O — GLOBAL DEFINITION OF DONE

A feature/task is **not complete merely because UI exists**. It is complete only when all applicable boxes below are true:

- [ ] Domain/API contract documented.
- [ ] Server-side validation implemented.
- [ ] Authorization/ownership enforced.
- [ ] Quote/pricing authoritative and auditable.
- [ ] Idempotency/retry behavior defined and tested.
- [ ] State transition invariant defined and tested.
- [ ] Required customer/merchant/courier/web/admin surfaces wired.
- [ ] Offline/reconnect behavior defined.
- [ ] Realtime events cannot regress authoritative state.
- [ ] Payment/refund/payout/settlement effect reconciled.
- [ ] Manual override, if any, fully audited.
- [ ] Proof/handoff requirement enforced server-side.
- [ ] Typed actionable error states rendered by clients.
- [ ] Unit tests added.
- [ ] Integration/contract tests added.
- [ ] Mandatory E2E scenario automated or has explicit staging validation script.
- [ ] Observability metrics/logging added with correlation id.
- [ ] Privacy/security review complete for new data.
- [ ] No client-only fabricated price, ETA, availability, provider status, or order state remains in production path.
- [ ] No fake success/mock transaction remains in production path.

---

# Recommended Implementation Order

1. `AGG-2026-004` fake-success blocker + `AGG-2026-001/002` real origin/location source.
2. `CORE-2026-001` canonical contract and `CORE-2026-002` idempotency.
3. `CORE-2026-003/004` quote + state machine.
4. `CORE-2026-005/006/007/008` finance, proof, realtime recovery, typed errors.
5. Paket P0 + Customer Web parity.
6. Food P0 tasks, then Food P1.
7. Tambal Ban P0 including adjustment consent.
8. Towing P0 including structured metadata and proof lifecycle.
9. Aggregator AWB/provider webhook/claim hardening.
10. Admin exception/reconciliation surfaces.
11. Full E2E/concurrency suites.
12. P1/P2 parity, accessibility, ranking/personalization/scale features.

---

# Architecture Notes / Guardrails

- Keep `backend/order-service/internal/domain/tambalban.go` shared with Towing **until** divergence justifies split; do not create duplicate business logic for cosmetic naming.
- Prefer shared `quote_service.go`, `idempotency_service.go`, `order_transition_service.go`, and `service_adjustment_service.go` over five separate implementations unless service invariants genuinely differ.
- `backend/integration-gateway` remains the correct boundary for external logistics/provider adapters (`jne_adapter.go`, `jnt_adapter.go`, maps/provider webhook normalization); Customer Web should not directly call third-party carrier/maps APIs.
- Customer Web Aggregator must never again signal success based only on client timeout/redirect.
- Existing courier Towing flow should be hardened, not discarded.
- Do not create every recommended migration/file automatically. First inspect whether equivalent schema/module already exists; recommended names are intended to make ownership explicit when a new file is actually needed.
