# P0 - E2E Multi-Service Courier Flow Repair

Created: 2026-08-21
Status: Active

## Goal

Perbaiki flow end-to-end untuk empat service utama:

- On-demand paket
- Food delivery
- Tambal ban
- Towing

Scope tidak boleh berhenti di aplikasi kurir. Setiap perbaikan harus memastikan customer create order, payment, dispatch, courier execution, tracking, proof, settlement, admin ops, dan history/status berjalan konsisten.

## Service Flow Matrix

### On-Demand Paket

- Customer web/mobile pilih pickup/dropoff, paket, dimensi/berat, service, harga.
- Backend validasi alamat, route snapshot, pricing, payment gate, dan dispatch readiness.
- Dispatch membuat offer TTL ke kurir yang eligible.
- Kurir accept, verifikasi wajah, scan/foto pickup, mulai antar, POD.
- Customer tracking melihat status, route, proof, dan final history.
- Admin bisa melihat stuck state, cancellation, proof, dan settlement.

### Food Delivery

- Customer mobile pilih merchant, menu, varian, notes, checkout/payment.
- Backend menyimpan snapshot item/varian dan men-trigger dispatch setelah paid.
- Merchant/admin menerima order dan status preparation/pickup bila flow merchant aktif.
- Kurir melihat item, qty, varian, notes, pickup, antar, POD.
- Settlement merchant dan earning kurir tercatat idempotent.
- Customer tracking/history menampilkan food context dan proof.

### Tambal Ban

- Customer mobile/web memilih layanan tambal ban, teknisi/courier, lokasi, harga jasa + perjalanan + platform fee.
- Backend menyimpan route/pricing snapshot dan dispatch maintenance order.
- Kurir masuk satu flow dedicated, bukan flow paket generik.
- Kurir arrival soft-gate, face verification nyata, inspeksi ban + damage type + foto before, service progress, completion foto after, report submit.
- Customer melihat teknisi menuju lokasi, sedang dikerjakan, selesai, invoice/proof.
- Settlement memakai service fee + travel fee - commission travel saja.

### Towing

- Customer mobile/web memilih towing, lokasi pickup/dropoff, tipe kendaraan, payment non-cash, estimasi.
- Backend mendukung status pickup/dropoff khusus, pricing snapshot, dan jika bisnis mengharuskan harga final driver-set, kontrak final price adjustment harus jelas.
- Kurir masuk flow dedicated towing: pickup navigation, arrival, face verification, vehicle inspection + foto before, loading, transit ke dropoff, unloading, completion proof + customer signature.
- UI kurir harus memakai active address sesuai fase: pickup sebelum transit, dropoff saat transit/unloading.
- Customer tracking/history menampilkan pickup, transit, tujuan, completion proof, invoice.
- Admin/support bisa menangani adjustment, cancellation fee, incident, dan settlement.

## Tasks

### 1. E2E Contract Audit

- [x] Petakan status lifecycle per service dari customer, backend, courier app, admin, dan database.
- [x] Buat tabel canonical status per service: created, pending_payment, paid/ready_dispatch, offered, accepted, arriving, arrived, verifying, inspecting, in_progress/loading, in_transit, completed, cancelled, failed.
- [x] Identifikasi status yang masih berbagi template paket tetapi dipakai maintenance.
- [x] Pastikan order payload mobile kurir membawa `service_category`, `service_code`, `order_number`, route snapshot, pricing breakdown, proof requirements, customer contact, pickup/dropoff coords.
- [x] Pastikan customer payload tracking/history membawa status human-readable, route, ETA, proof, invoice, dan service-specific fields.

### 2. Backend Order, Dispatch, Payment

- [x] Pastikan order creation untuk keempat service punya payment gate yang sama: order tidak dispatch sebelum payment valid, kecuali policy eksplisit.
- [x] Audit `order-service` dan `admin-service` dispatch untuk service category `on_demand`, `food_delivery`, `tambal_ban`, `towing`.
- [x] Pastikan offer TTL, expired/re-offer, active capacity, vehicle/capability eligibility konsisten lintas service.
- [x] Tambahkan/rapikan service report contract untuk tambal ban dan towing: Android sekarang mengirim `completed_at` RFC3339, menganggap HTTP 2xx/201 sebagai sukses, dan backend towing report mengubah auth `user_id` ke `courier_profiles.id`.
- [x] Pastikan report endpoint idempotent dan tidak langsung `completed` jika proof wajib belum lengkap.
- [x] Pastikan settlement food, tambal ban, towing, dan paket tidak double credit dan bisa diaudit.
- [x] Pastikan notification event customer/kurir/merchant/admin muncul di status kritis: paid, offered, accepted, arrived, pickup/service started, completed, cancelled/failed.
  - Completed 2026-08-21: customer/kurir tetap menerima existing realtime + in-app/FCM paths; merchant owner/staff join `merchant:{merchant_id}` socket room dari verified DB identity; lifecycle payload now emits merchant `merchant_order_update`/`order_update`; admin roles receive `admin_order_lifecycle`/`order_update`; admin dashboard invalidates `admin-orders` and detail query on lifecycle update.

### 3. Customer Web/Mobile

- [x] Audit customer booking per service: input, address, service detail, price estimate, payment, tracking.
  - Completed 2026-08-21 static/code audit: package input/address/price/payment/tracking covered by customer order contract; food menu/variant/notes/payment/tracking covered by food snapshot; tambal ban service detail/courier price/travel fee/platform fee covered by service booking; towing pickup/dropoff/non-cash/final adjustment/cancel policy/tracking covered by service booking and tracking payload. Manual emulator UAT remains separate.
- [x] Tambal ban: pastikan customer bisa melihat harga jasa teknisi + biaya perjalanan + fee platform dengan label konsisten.
- [x] Towing: pastikan customer melihat non-cash payment, pickup/dropoff, harga estimasi/final, cancellation fee policy, dan invoice.
- [x] Food: pastikan varian/notes/menu snapshot masuk sampai courier detail dan customer history.
- [x] On-demand paket: pastikan dimensi/berat/kategori/pickup/dropoff/proof tampil konsisten di customer history.
- [x] Pastikan tracking customer membaca status service-specific, bukan copy "paket" untuk maintenance.

### 4. Courier App

- [x] Hilangkan dual-path untuk tambal ban/towing: service order sekarang hanya membuka dedicated service flow, tidak lagi panel paket generik.
- [x] Fix towing completion blocker: `CAPTURE_COMPLETION` sekarang punya CTA dan membuka completion flow.
- [x] Fix towing active address: pickup untuk fase pickup/loading, dropoff untuk transit/unloading/completion.
- [x] Ganti pseudo face verification di TambalBan/Towing ViewModel dengan `FaceVerificationScreen` nyata atau kontrak explicit verified state dari backend.
- [x] Tambahkan proof capture nyata untuk inspeksi dan completion: foto before, foto after, notes, signature towing bila wajib.
  - [x] Completion foto after upload ke backend sebelum report submit: tambal ban mengisi `tire_photo_after_url`, towing mengisi `completion_photo_url`.
  - [x] Towing signature image capture/upload: kurir wajib isi nama penerima dan tanda tangan digital; Android upload proof type `signature` dan report mengirim `signature_url`.
  - [x] Inspection before-photo untuk tambal ban/towing upload saat fase inspeksi dan report completion mengirim `tire_photo_before_url` / `vehicle_photo_before_url`.
- [x] Order list harus membedakan service dengan chip/label: Paket, Food, Tambal Ban, Towing; bukan hanya ON DEMAND/REGULAR.
- [x] Kurir food harus melihat merchant/customer context, item, qty, variant, notes, contact, dan proof requirements.
- [x] Aksi kritis di semua service harus pakai swipe/confirmation sesuai risiko: accept, start trip/service, complete delivery/service.
- [x] Hapus emoji UI di service components dan pakai Material Icons sesuai ADR-006.

### 5. Admin, Merchant, Support Ops

- [x] Admin order detail harus menampilkan service-specific timeline dan proof lengkap untuk tambal ban/towing service reports.
- [x] Admin harus punya filter/status untuk stuck: paid no dispatch, offered expired, accepted no arrival, service started no completion, proof failed, settlement missing.
- [x] Merchant food flow harus tetap sinkron: order paid, prepare, courier pickup, delivered, settlement holding/release.
- [x] Support harus bisa melihat cancellation/failed reason, proof photo, location, and audit trail.
- [x] Finance/settlement dashboard harus memperlihatkan gross, platform fee, courier earning, merchant settlement, adjustment, refund/cancel fee.

### 6. Automated Tests

- [ ] Unit test domain resolver: `CourierFlow`, `TambalBanFlow`, `TowingFlow` untuk setiap status.
- [ ] Unit/integration test backend status transitions dan report contract.
- [ ] API test payment paid -> dispatch -> offer -> accept untuk keempat service.
- [ ] Android courier instrumentation atau emulator test untuk paket, food, tambal ban, towing sampai completion.
- [ ] Customer mobile test untuk booking/tracking/history masing-masing service.
- [ ] Playwright web customer/admin smoke untuk booking, admin order detail, status/proof visibility.
- [x] Settlement test: food merchant settlement, courier earning, tambal/towing commission travel-only.

### 7. Manual UAT With Real Accounts

- [ ] Siapkan akun customer, courier on-demand/package, courier maintenance/towing, merchant food, admin/support.
- [ ] Jalankan UAT per service dari create order sampai completed/history.
- [ ] Ambil screenshot/video tiap fase kritis di Android Studio/emulator.
- [ ] Catat semua copy yang masih salah vocab: pickup/paket di maintenance, tujuan/customer mismatch, harga/fee ambigu.
- [ ] Rebuild Docker/local staging setelah perubahan backend/mobile sesuai aturan LANCAR.

## Acceptance Criteria

- [ ] Satu order on-demand paket berjalan dari customer booking sampai courier POD dan customer melihat proof akhir.
- [ ] Satu order food berjalan dari cart/checkout sampai courier delivered, merchant settlement tercatat, customer melihat item/proof.
- [ ] Satu order tambal ban berjalan dari customer booking sampai teknisi completion, proof before/after tersimpan, earning benar.
- [ ] Satu order towing berjalan dari customer booking sampai unloading/completion, active address benar, signature/proof tersimpan.
- [ ] Admin/support bisa melihat lifecycle, proof, stuck diagnostics, settlement, dan audit trail untuk semua service.
- [ ] Tidak ada flow maintenance yang menampilkan atau menjalankan scan/foto "paket" kecuali memang service paket.
- [ ] Semua test utama hijau: backend unit/integration, Android compile/test, customer/admin web build, Playwright smoke yang relevan.

## Canonical Status Matrix

Code-level status map for UAT and regression checks:

| Canonical phase | On-demand paket | Food delivery | Tambal ban | Towing |
| --- | --- | --- | --- | --- |
| Created / unpaid | `pending_payment` | `pending_payment` | `pending_payment` | `pending_payment` |
| Paid / ready dispatch | `pending` / `searching` | `pending_merchant` after payment; `scheduled` for scheduled food | `pending` / `searching` | `pending` / `searching` |
| Merchant/service prep | N/A | `preparing`; `food_ready_at` drives `searching`; merchant ready forces `searching` | N/A | N/A |
| Offered | courier offer dispatch row active | courier offer dispatch row active after `searching` | courier offer dispatch row active | courier offer dispatch row active |
| Accepted | `accepted` / leg `assigned` | `accepted` / `picking_up` | dedicated flow accepted/arriving | dedicated flow accepted/arriving |
| Arriving / arrived | `picking_up` / arrival event | `picking_up` at merchant | `arrived` before face verification | pickup arrival before face verification/loading |
| Face verification | pickup/delivery face when policy requires | pickup/delivery face when policy requires | `VERIFY_FACE` uses real `FaceVerificationScreen` and returns to service flow | `VERIFY_FACE` uses real `FaceVerificationScreen` and returns to service flow |
| Inspection / pickup proof | pickup scan + pickup photo | merchant pickup scan/photo/handover token | `inspecting` with damage type + `tire_photo_before_url` | `inspecting` with `vehicle_photo_before_url` |
| Work / transit | `in_transit` | `picked_up` / `delivering` | `in_progress` | `loading` -> `in_transit` -> `unloading` |
| Completion proof | POD photo / package POD verified | POD photo / package POD verified | `tire_photo_after_url` + report | `completion_photo_url` + `signature_url` + report |
| Final | `delivered` / `completed` client alias | `delivered`, merchant settlement `HOLDING` then release cron | `completed` after valid report | `completed` after valid report |
| Cancel / failed | `cancelled`, `failed`, pickup cancellation proof | merchant reject/timeout/customer cancel with refund rules | `cancelled` / `failed` with service events | `cancelled` / `failed` with service events |

Maintenance template issue found and fixed:

- Tambal ban/towing previously could show generic package delivery action controls in courier order detail; now service orders open only dedicated service flow.
- Towing previously reused pickup address in later phases; now transit/unloading/completion use dropoff address.
- Tambal ban/towing previously had client-side face-verification bypass; now dedicated flow calls real face verification screen.
- Service report completion previously relied on client discipline for proof; backend now rejects incomplete report proof payloads.

## Initial Findings From Static Audit

- `OrderDetailScreen` masih menampilkan dedicated service flow button dan generic delivery action panel untuk service order.
- `TowingFlowScreen` menyembunyikan CTA ketika action `CAPTURE_COMPLETION`, sehingga towing bisa mentok di `UNLOADING`.
- `CompletionScreen`, `InspectVehicleScreen`, dan `InspectTireScreen` masih punya TODO untuk kamera/signature.
- Tambal ban/towing ViewModel melewati face verification nyata dengan update status langsung.
- `TowingFlowViewModel` selalu memakai pickup address sebagai active address.
- Order list belum membedakan Food/Tambal Ban/Towing/Paket secara tegas.

## Progress Log

### 2026-08-21

- Fixed courier app service-order dual path in `OrderDetailScreen`: tambal ban/towing no longer render generic delivery action controls.
- Fixed towing completion blocker by showing the sticky CTA for `CAPTURE_COMPLETION` and routing it to completion.
- Fixed towing active address selection so transit/dropoff/unloading/completion stages show destination address.
- Fixed service report submission contract:
  - Android sends `completed_at` as RFC3339 instead of epoch milliseconds.
  - Android treats backend HTTP 2xx/201 service report response as success, matching current Go handler.
  - Android no longer marks completion as `completed` when service report submission fails.
  - Backend towing report now stores `courier_profiles.id` resolved from authenticated `user_id`, matching the FK schema and tambal ban behavior.
- Improved courier order list service labels: `PAKET`, `FOOD`, `TAMBAL BAN`, `TOWING`, `REGULAR`.
- Replaced emoji earnings markers with Material icons.
- Wired real face verification into tambal ban/towing:
  - Service flow CTA `VERIFY_FACE` now opens `FaceVerificationScreen` instead of advancing status directly.
  - Successful verification syncs status to `inspecting` and returns to the correct service flow.
  - Route saver keeps service return context across configuration changes.
  - VM fallback no longer bypasses face verification.
- Added completion proof guard:
  - `CompletionScreen` requires a camera completion photo before submit.
  - Towing completion also requires recipient/signature name before submit.
  - Completion notes include evidence text. Binary proof upload into service report URL fields remains open because there is no service-report proof upload endpoint yet.
- Added service-report completion proof persistence:
  - Admin-service now exposes `POST /api/v1/courier/service-report/proof` with mobile auth, idempotency key, secure upload validation, order ownership check, and hardened storage.
  - Android uploads completion photo to that endpoint before creating the report.
  - Tambal ban report receives `tire_photo_after_url`; towing report receives `completion_photo_url`.
- Added towing signature proof persistence:
  - `CompletionScreen` now includes a customer signature pad for towing and requires signature ink plus recipient name before completion.
  - Android uploads the signature as service-report proof type `signature`.
  - Towing report receives `signature_url` and only completes after signature upload succeeds.
  - Completion still fails closed if any required proof upload fails.
- Added inspection before-photo proof persistence:
  - New reusable Android proof uploader centralizes multipart service-report proof uploads.
  - New local draft store keeps uploaded before-photo URLs per order/service until completion report succeeds.
  - Tambal ban inspection now requires damage type plus before-photo; upload proof type `tire_photo_before`, then advance to service progress.
  - Towing inspection now requires vehicle before-photo; upload proof type `vehicle_photo_before`, then advance to loading.
  - Completion report refuses to complete tambal ban/towing if the before-photo URL draft is missing.
  - Tambal ban report receives `tire_photo_before_url`; towing report receives `vehicle_photo_before_url`.
- Added admin/customer service proof visibility:
  - Admin-service customer order detail and mobile tracking-detail now include `tambal_ban_report` and `towing_report` objects.
  - Admin order detail renders tambal ban before/after photos and towing before/loading/unloading/completion/signature proofs from report URL fields.
  - Customer web order detail renders a dedicated "Bukti layanan" section for tambal ban/towing report photos and signature.
  - Customer Android tracking detail model carries service reports and tracking proof section renders service proof images.
  - Customer Android service report screen now resolves relative upload URLs, passes auth headers for protected images, and shows towing loading/unloading/signature images.
- Added food order snapshot visibility parity:
  - Admin order detail now fetches food item variants from `food_order_item_variants`, not only item name/qty/notes.
  - Admin order detail renders variant selections under each food item for CS investigation.
  - Customer web order detail hydrates `food_items` from the order-detail response and renders item, quantity, variant, notes, and subtotal.
  - Existing courier Android food card was verified to already show item, qty, variants, notes, and service/customer context.
- Fixed food settlement trigger parity from courier mobile POD:
  - Static audit verified payment webhook moves paid food order to `pending_merchant` and notifies merchant.
  - Merchant-service accept/ready flow moves `pending_merchant -> preparing -> searching` and records food-ready event.
  - Order-service delivery path triggers customer/merchant picked-up/delivered notifications and merchant settlement.
  - Order-service settlement worker releases `HOLDING` merchant settlements after `holding_release_at` via `ProcessPendingSettlements`.
  - Admin-service courier POD flow now sends `X-Internal-Api-Key` when calling order-service `/api/v1/internal/orders/food-settlement`, fixing a silent settlement trigger failure when internal auth is enabled.
- Hardened payment gate and dispatch readiness:
  - `dispatchNextOnDemandCourier`, `dispatchToPreferredCourier`, and `advanceOnDemandDispatchQueue` no longer treat `pending_payment` as dispatch-ready.
  - Dispatcher now requires an existing `payments.status = 'paid'` before creating `courier_offer_dispatches`; explicit dev bypass still creates a paid bypass payment shell before dispatch.
  - Midtrans webhook and manual customer confirm route food orders to `pending_merchant`, not parcel `pending`, so food waits for merchant accept/ready before courier dispatch.
  - Existing dispatcher audit verified TTL expiry/re-offer, active capacity, same-customer batching, approved vehicle, and courier service capability checks before offer insertion.
- Added on-demand package customer visibility:
  - Customer web order detail now renders `package_details` as a dedicated "Rincian paket" section with category, item description, weight, dimensions, dimension validation, and package count.
  - Customer Android tracking detail now decodes backend `packages` rows from tracking-detail response.
  - Customer Android tracking screen now shows package description/code/size/weight and per-package pickup scan, pickup photo, and POD completion states.
- Added customer towing booking contract:
  - Customer Android towing booking now requires a separate searched/selected dropoff before price estimate, courier selection, and order submission.
  - Towing estimate/create-order payload uses pickup as `pickup_location` and selected destination as `dropoff_location`; non-towing maintenance still uses the service location for both ends.
  - Towing pricing preview clearly labels non-cash payment, pickup/dropoff dependency, final adjustment, cancellation fee policy, and invoice estimate.
- Added critical-action confirmation coverage:
  - Existing accept/package critical delivery flow already uses swipe/security challenge.
  - Tambal ban dedicated flow now asks confirmation before arrival, inspection proof, start service, and complete service actions.
  - Towing dedicated flow now asks confirmation before pickup arrival, inspection proof, loading, transit, dropoff arrival, and unloading actions.
  - Service completion submit now asks confirmation before final tambal ban/towing report submission.
- Added notification lifecycle coverage:
  - `emitOnDemandRealtime` now supports `merchant_id` and `admin_broadcast`.
  - Merchant owner/staff sockets join `merchant:{merchant_id}` using `merchants.user_id` and active `merchant_staff.user_id`, not client-supplied query data.
  - Payment, offer, accept, pickup proof/service started, POD completed, status update, and pickup cancelled events now carry merchant/admin routing where applicable.
  - Lapay payment completion now publishes the same payment lifecycle event as Midtrans/manual payment.
  - Admin dashboard socket hook invalidates `admin-orders` and `admin-order-detail` when order lifecycle updates arrive.
- Added settlement travel-only regression:
  - `settlement_service_test.go` covers tambal ban and towing `SettlementBasisPerKM` with intentionally large courier service fees.
  - Test proves platform commission is calculated only from travel revenue (`base_fare + per_km * distance`), while service fee remains outside the commission base.
- Completed customer booking static audit:
  - Package customer flow covers address, package detail/dimensions/category, pricing/payment gate, tracking/history proof.
  - Food customer flow covers merchant/menu item, variant, notes, payment to `pending_merchant`, courier/customer history item context.
  - Tambal ban customer flow covers service detail, selected technician/courier price, travel fee, platform fee, payment, service-specific tracking/proof.
  - Towing customer flow covers pickup/dropoff, service detail, non-cash payment copy, estimate/final adjustment/cancellation policy, tracking/proof.
- Hardened service report endpoint proof contract:
  - Order-service rejects tambal ban report creation when `tire_photo_before_url`, `tire_photo_after_url`, or `completed_at` is missing.
  - Order-service rejects towing report creation when `vehicle_photo_before_url`, `completion_photo_url`, `signature_url`, or `completed_at` is missing.
  - Report handlers map validation failures to HTTP 400 `ERR_INVALID_SERVICE_REPORT`.
  - Report repository now uses per-order advisory transaction locks and returns existing report rows for same-order retries, making tambal ban/towing report creation idempotent without a schema migration.
- Verification:
  - `backend/admin-service`: `npm run build` passed after admin food variant query changes.
  - `frontend`: `npm run build` passed after customer web food detail changes.
  - `admin-dashboard`: `npm run build` passed with production env placeholders after admin food variant rendering changes.
  - `backend/admin-service`: `npm test -- onDemandCourierProof.e2e.test.ts --runInBand` passed after food-settlement internal-auth regression coverage.
  - `frontend`: `npm run build` passed after web package detail section.
  - `android-app-customer`: `.\gradlew.bat :app:compileDebugKotlin` passed after mobile tracking package section.
  - `backend/order-service`: `go test ./...` passed after service report validation/idempotency changes.
  - `backend/admin-service`: `npm run build` passed after customer report payload changes.
  - `admin-dashboard`: `npm run build` passed with production env placeholders `VITE_API_URL=https://api.lancar.local/api/v1` and `VITE_SOCKET_URL=wss://api.lancar.local`.
  - `frontend`: `npm run build` passed after customer web proof visibility changes.
  - `android-app-customer`: `.\gradlew.bat :app:compileDebugKotlin` passed after mobile customer proof visibility changes.
  - `graphify update .` passed after admin/customer proof visibility changes.
  - `android-app`: `.\gradlew.bat :app:compileDebugKotlin` passed after inspection before-photo proof changes.
  - `android-app`: `.\gradlew.bat :app:compileDebugKotlin` passed after towing signature proof changes.
  - `android-app-customer`: `.\gradlew.bat :app:compileDebugKotlin` passed after towing dropoff booking changes.
  - `android-app`: `.\gradlew.bat :app:compileDebugKotlin` passed after critical-action confirmation changes.
  - `backend/admin-service`: `npm run build` passed after notification lifecycle routing.
  - `backend/admin-service`: `npm test -- onDemandRealtime.e2e.test.ts --runInBand` passed after merchant/admin lifecycle broadcast regression.
  - `admin-dashboard`: `VITE_API_URL=https://api.lancar.local/api/v1 VITE_SOCKET_URL=wss://api.lancar.local npm run build` passed after socket invalidation changes.
  - `backend/order-service`: `go test ./internal/service -run TestCalculateSettlementPerKMCommissionIgnoresServiceFee` passed after tambal/towing travel-only settlement regression.
  - `backend/admin-service`: `npm run build` passed.
  - `backend/admin-service`: `npm test -- routes.test.ts --runInBand` passed.
  - `backend/order-service`: `go test ./...` passed.
  - `graphify update .` passed with existing SQL parser warning.
