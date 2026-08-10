# FOOD-BIKE — Task Plan End-to-End (Food Delivery Khusus Kurir Sepeda)

> Task plan ini disusun berdasarkan eksplorasi langsung ke repo `LANCAR`
> (https://github.com/yogisyahroni/LANCAR). Semua referensi file/tabel di bawah
> adalah kondisi nyata di codebase, bukan asumsi.

---

## Ringkasan Fitur

Vertical baru di Tembus: **Food Delivery yang eksklusif untuk kurir bersepeda**
(motor tidak boleh mengambil order tipe ini). Mencakup:
- Radius jangkauan yang bisa diatur driver sendiri (dropdown 1–20 km)
- Aplikasi merchant baru (kelola menu, terima/tolak order)
- State machine order dengan tahap "merchant accept & prep time"
- Skema kompensasi win-win (merchant/driver/customer) untuk kasus ghosting/cancel
- Saldo hold/deposit driver sebagai jaminan, self-funding dari revenue (bukan bakar modal)
- Skema poin/bonus "tutup poin" yang self-scaling dari 1 driver sampai jutaan

---

## Temuan Kunci dari Codebase (Sebelum Eksekusi)

| Area | Kondisi Saat Ini | Implikasi |
|---|---|---|
| `courier_profiles.vehicle_type` | `CHECK` constraint hanya `('bebek','matic','sport')` | **'sepeda' belum ada** — wajib migration |
| `users.role` | `CHECK` constraint tidak ada `'merchant'` | Wajib migration tambah role |
| Vehicle restriction per service | **Sudah ada polanya** di `vehicle_validation.go` (dipakai untuk Tambal Ban & Towing) | Tinggal extend matrix-nya, tidak perlu bikin sistem baru |
| Service catalog per produk | **Sudah ada**: tabel `delivery_service_products` (base_fare, per_km, `vehicle_types[]`, route_model) | Tinggal insert row baru untuk `food_delivery` |
| Merchant settlement/escrow | Skema & cron pemrosesan **sudah ada** (`merchant_settlements`, `ProcessPendingSettlements` jalan tiap 5 menit) — **tapi `CreateSettlement()` tidak pernah dipanggil dari manapun**, jadi belum benar-benar jalan otomatis untuk order manapun | Perlu wiring, lihat Phase 8 (FOOD-BIKE-067) — ini bug lintas-sistem, bukan cuma food |
| Menu/katalog produk | Ada `product_catalogs`, tapi keyed ke `customer_id` (untuk UMKM titip-beli), belum ada jam operasional/prep time/kategori | Butuh tabel baru `merchant_menu_items`, jangan reuse langsung |
| Order state machine | `orders.service_sub_type` + kolom custom sudah dipakai untuk tambal_ban (pola di `20260725000003_tambalban_order_extensions.sql`) | Tiru pola yang sama untuk food |
| Wallet driver | Cuma field `balance` tunggal (`payment-service/internal/domain/wallet.go`) | **Belum ada hold/deposit split** — wajib kolom baru |
| Radius per driver | `delivery_service_products.search_radii_km` ada, tapi di level servis bukan per-driver | Butuh kolom baru di `courier_profiles` |
| Aplikasi merchant (mobile) | **Belum ada** — cuma `android-app` (driver) & `android-app-customer` | Folder baru wajib dibuat |
| Scan barcode + foto pickup/delivery | **Sudah LIVE** di `backend/admin-service` (Node/TS): `POST /api/v1/orders/pod/upload`, lengkap geofence/GPS-accuracy/spoof-risk/face-verification check | Tinggal disambungkan ke flow food, lihat Phase 3.5 |
| QR/barcode per order | **Sudah auto-generate** dari `order.HandoverToken` via `GenerateQRCodeDataURI()` | Reuse untuk struk pembelian food |
| Validasi barcode saat scan | Barcode yang di-scan **tidak dicocokkan** ke `order.handover_token`, cuma disimpan buat audit | Celah keamanan — wajib ditutup (FOOD-BIKE-032) |
| Struk pembelian customer-facing | Belum ada (`resi_service.go` yang ada itu label AWB aggregator, beda konteks) | Perlu dibangun baru, lihat Phase 3.5 |
| Alur pendaftaran driver | **Satu bentuk untuk semua kendaraan** — `requiredDocuments` list statis (KTP, SIM, STNK, SKPD, dll), tidak ada percabangan per `vehicleType` | Wajib bikin conditional flow — lihat Phase 1.5 |
| Struktur pemesanan (cart → order) | `CreateOrderRequest` 100% dibentuk untuk parcel tunggal, **tidak ada tabel `order_items`** untuk multi-item | Wajib dibangun baru, lihat Phase 7.5 |
| Home screen / pemilihan layanan | **Sudah ada** `ServiceGridMenu.kt` bergaya Gojek (3x2 grid, data-driven dari `delivery_service_products`), tapi **grid penuh** (6/6 slot terpakai) | Geser "Riwayat" (redundant dgn bottom nav) untuk kasih slot Food — lihat FOOD-BIKE-030 |

---

## PHASE 0 — Database Migrations

Lokasi: `database/migrations/`, format `YYYYMMDDHHMMSS_nama.sql` (goose migration)

| Task ID | File Migration Baru | Detail |
|---|---|---|
| FOOD-BIKE-001 | `..._add_sepeda_vehicle_type.sql` | `DROP`/`ADD CONSTRAINT` pada `courier_profiles.vehicle_type`, tambahkan `'sepeda'` |
| FOOD-BIKE-002 | `..._add_merchant_role.sql` | Extend `users_role_check`, tambahkan `'merchant'` (ikuti pola `20260604000001_maps_runtime_credentials.sql`) |
| FOOD-BIKE-003 | `..._create_merchants_table.sql` | Tabel baru `merchants`: `id, user_id FK, nama_toko, alamat, lokasi GEOGRAPHY, jam_buka, jam_tutup, is_open, completion_rate_pct, created_at, updated_at` |
| FOOD-BIKE-004 | `..._create_merchant_menu_items.sql` | Tabel baru `merchant_menu_items`: `id, merchant_id FK, nama, harga, foto, kategori, prep_time_minutes, is_available, created_at, updated_at` |
| FOOD-BIKE-005 | `..._add_radius_max_courier_profiles.sql` | `ALTER TABLE courier_profiles ADD COLUMN radius_max_km INT DEFAULT 1 CHECK (radius_max_km IN (1,2,4,6,10,12,14,16,18,20))` |
| FOOD-BIKE-006 | `..._food_delivery_order_extensions.sql` | Ikuti pola persis `20260725000003_tambalban_order_extensions.sql`: extend `orders.service_sub_type` tambah `'food_delivery'`, kolom baru `merchant_id, merchant_accepted_at, prep_time_minutes, food_ready_at` |
| FOOD-BIKE-007 | `..._seed_food_delivery_service_product.sql` | `INSERT` ke `delivery_service_products`: `code='food_delivery'`, `vehicle_types=ARRAY['sepeda']`, `route_model='p2p'` |
| FOOD-BIKE-008 | `payment-service/migrations/..._wallet_hold_balance.sql` | `ALTER TABLE wallets ADD COLUMN hold_balance BIGINT DEFAULT 0, hold_minimum_required BIGINT DEFAULT 0` |
| FOOD-BIKE-009 | `..._driver_penalty_log.sql` | Tabel baru `driver_penalty_log`: `driver_id, order_id, violation_type, amount_deducted, evidence_ref, appeal_status` |
| FOOD-BIKE-010 | `..._driver_points_bonus.sql` | Tabel `driver_daily_points`, `driver_bonus_payout` (poin harian/mingguan, status tutup poin) |

---

## PHASE 1 — Backend: Enforcement Sepeda-Only

Lokasi: `backend/order-service/`

| Task ID | File | Detail |
|---|---|---|
| FOOD-BIKE-011 | `internal/service/vehicle_validation.go` | Tambah entry `vehicleRestrictionMatrix["food_delivery"] = []string{"sepeda"}`, fungsi helper `IsFoodDelivery(serviceSubType)` |
| FOOD-BIKE-012 | `internal/service/availability_service.go` | Di `FindAvailableCouriers`: tambah filter — jika `serviceSubType == "food_delivery"`, wajib `courier.VehicleType == "sepeda"` **dan** `order_distance <= courier.RadiusMaxKM` |
| FOOD-BIKE-013 | `internal/domain/courier.go` | Tambah field `RadiusMaxKM int` ke struct `Courier` |
| FOOD-BIKE-014 | `internal/repository/postgres_repository.go` | Query `FindCouriersByCapability` — tambah kondisi `radius_max_km >= distance_km` |

---

## PHASE 2 — Backend: Domain Merchant (Service Baru)

Bikin `backend/merchant-service/` baru, ikuti struktur `payment-service/` sebagai template
(`cmd/api/main.go`, `internal/domain`, `internal/handler`, `internal/repository`, `internal/service`)

| Task ID | File | Detail |
|---|---|---|
| FOOD-BIKE-015 | `merchant-service/internal/domain/merchant.go` | Struct `Merchant`, interface `MerchantRepository` |
| FOOD-BIKE-016 | `merchant-service/internal/domain/menu_item.go` | Struct `MenuItem`, interface CRUD |
| FOOD-BIKE-017 | `merchant-service/internal/service/merchant_service.go` | Logic accept/reject order, toggle buka/tutup, CRUD menu |
| FOOD-BIKE-018 | `merchant-service/internal/handler/merchant_handler.go` | Endpoint: `POST/GET/PATCH /merchant/menu`, `POST /merchant/orders/{id}/accept`, `POST /merchant/orders/{id}/reject` |
| FOOD-BIKE-019 | `backend/api-gateway/` | Daftarkan route baru untuk `merchant-service` (cek pola routing existing di `api-gateway/src`) |

---

## PHASE 3 — Backend: State Machine Order Food

Lokasi: `backend/order-service/internal/domain/order.go` & `internal/service/order_service.go`

| Task ID | Detail |
|---|---|
| FOOD-BIKE-020 | Tambah `OrderStatus` baru: `StatusPendingMerchant`, `StatusPreparing` (disisipkan di antara `pending_payment` dan `searching` yang sudah ada) |
| FOOD-BIKE-021 | `order_service.go` — fungsi `AcceptByMerchant()`, `RejectByMerchant()`. Transisi ke `searching` dipicu otomatis mendekati `food_ready_at` (pakai worker, ikuti pola `internal/worker/sla_worker.go`) |
| FOOD-BIKE-022 | `internal/worker/food_prep_worker.go` (baru) — cron cek `merchant_accepted_at + prep_time_minutes`, trigger matching 5 menit sebelum makanan siap. Timeout 3 menit merchant tidak respon → auto-cancel (ikuti pola `sla_worker.go`) |

**State machine target:**
```
pending_payment → pending_merchant → preparing → searching
  → accepted (driver assigned) → picking_up → picked_up
  → delivering → delivered
```

---

## PHASE 3.5 — Struk Pembelian & Bukti Scan Pickup/Delivery

> **Temuan penting:** sistem scan barcode + foto untuk pickup/delivery **sudah LIVE**
> di `backend/admin-service` (Node/TS) — endpoint `POST /api/v1/orders/pod/upload`
> (fungsi `uploadMobileCourierPod` → `verifyOnDemandStep`), lengkap dengan geofence
> radius check, GPS accuracy threshold, spoof-risk check, dan face verification gate.
> QR code per order juga **sudah auto-generate** dari `order.HandoverToken` via
> `utils.GenerateQRCodeDataURI()` (`order_service.go`). Driver app (`android-app`)
> juga **sudah punya UI lengkap**: `ScanScreen.kt` (ZXing, multi-format) dan
> `ProofOfDeliveryScreen.kt` / `ProofOfDeliveryViewModel.kt` (foto + barcode +
> tanda tangan + face verification), sudah wired ke API tersebut.
>
> Yang perlu dikerjakan bukan membangun dari nol, tapi **menutup celah** dan
> **menyambungkan ke flow food**.

| Task ID | File | Detail |
|---|---|---|
| FOOD-BIKE-032 | `backend/admin-service/src/controllers/courierAuth.controller.ts` (fungsi `verifyOnDemandStep`) | **Celah keamanan**: `barcode_value` yang di-scan driver saat ini **tidak divalidasi** terhadap `order.handover_token` — hanya disimpan untuk audit. Tambahkan pengecekan `barcode_value === order.handover_token` sebelum proof status di-set `'accepted'`, tolak dengan `rejection_reason='barcode_mismatch'` jika tidak cocok |
| FOOD-BIKE-033 | `database/migrations/..._seed_food_delivery_service_product.sql` (extend FOOD-BIKE-007) | Saat insert row `food_delivery` ke `delivery_service_products`, set kolom proof-nya: `proof_geofence_radius_m` (radius kecil, cocok untuk pickup dari warung/merchant sempit), `pod_label='Bukti Terima Makanan'`, `face_verification_required` (tentukan perlu atau tidak untuk pickup di merchant) |
| FOOD-BIKE-034 | `merchant-service/internal/service/struk_service.go` (baru, di service Phase 2) | Generate struk pembelian: reuse `order.HandoverToken` + `utils.GenerateQRCodeDataURI()` (duplikasi util dari `order-service/pkg/utils/qrcode.go` karena tidak ada shared package antar service). Isi struk: nama menu, harga, ongkir, nomor order, QR code |
| FOOD-BIKE-035 | `merchant-service/internal/handler/struk_handler.go` (baru) | Endpoint `GET /merchant/orders/{id}/struk` — return data struk + QR untuk dirender/diprint di app merchant |
| FOOD-BIKE-036 | `android-app-merchant/` (folder baru dari Phase 5) | Screen "Print Struk" — render struk + QR, lalu kirim ke printer thermal via Bluetooth |
| FOOD-BIKE-037 | Riset & pilih library | **Belum ada library ESC/POS Bluetooth printer di project ini** — perlu riset & pilih library Android yang aktif maintained sebelum implementasi FOOD-BIKE-036 |
| FOOD-BIKE-038 | `backend/admin-service` — `status_transition_policies` | Cek/tambahkan policy row untuk transisi `food_delivery` (`picked_up`, `delivered`) dengan `requires_proof=TRUE`, supaya order food **wajib** ada proof attempt di kedua titik (pickup dari merchant, delivery ke customer) sebelum status bisa lanjut |

---

## PHASE 1.5 — Alur Pendaftaran Driver Sepeda

> **Temuan penting:** alur registrasi driver saat ini (`android-app`, wizard 4 step)
> **satu bentuk untuk semua kendaraan** — tidak ada percabangan sama sekali
> berdasarkan `vehicleType`. Field `vehiclePlate`, `vehicleCc`, `engineType`,
> `simActive`, `skpdTaxActive` di `CourierRegistrationRequest` semuanya
> hardcoded/wajib, dan `requiredDocuments` di `CourierRegistrationScreen.kt`
> adalah **list statis** (KTP, SIM, STNK, SKPD, foto kendaraan, SKCK, bank, face)
> — tidak ada logic berbeda untuk sepeda. Backend `RegisterCourier`
> (`auth-service/internal/service/auth_service.go`) juga tidak melakukan
> validasi apapun yang berbeda per jenis kendaraan.
>
> **Prinsip desain:** driver TIDAK perlu memilih service secara manual saat
> daftar. Cukup pilih jenis kendaraan — sistem otomatis menentukan servis apa
> saja yang eligible lewat `vehicleRestrictionMatrix` yang sudah ada (persis
> pola yang dipakai untuk Tambal Ban/Towing). Sepeda otomatis eligible untuk
> kirim barang jarak dekat & food delivery, otomatis tidak eligible untuk
> tambal ban/towing — tanpa perlu checkbox pilihan servis terpisah.

**Alur form yang direkomendasikan:**
1. Step 2 (Vehicle) diawali dengan pemilihan jenis kendaraan: Motor / Mobil / Sepeda
2. Motor/Mobil → alur sama persis seperti sekarang (plat, STNK, SIM, SKPD, CC, dst)
3. Sepeda → skip otomatis: plat nomor, STNK, SIM, SKPD (pajak kendaraan tidak relevan), CC/engine_type
4. Tetap wajib untuk sepeda: KTP, foto sepeda (ganti dari "foto kendaraan"), selfie/face verification, rekening bank, SKCK

| Task ID | File | Detail |
|---|---|---|
| FOOD-BIKE-039 | `database/migrations/..._courier_plate_optional.sql` (baru) | `ALTER COLUMN vehicle_plate DROP NOT NULL` (aman — `UNIQUE` constraint Postgres tetap mengizinkan banyak NULL) |
| FOOD-BIKE-040 | `auth-service/internal/domain/courier.go` | `VehiclePlate` diubah jadi `*string` (nullable) |
| FOOD-BIKE-041 | `auth-service/internal/service/auth_service.go` (`RegisterCourier`) | Tambah validasi conditional: jika `vehicleType=="sepeda"`, skip requirement plat/STNK/SIM/SKPD |
| FOOD-BIKE-042 | `android-app/app/src/main/java/com/tembus/courier/data/model/CourierRegistration.kt` | `vehiclePlate`, `vehicleCc`, `engineType`, `simActive`, `skpdTaxActive` diubah jadi nullable/optional |
| FOOD-BIKE-043 | `android-app/.../ui/screens/auth/CourierRegistrationScreen.kt` | `requiredDocuments` diubah dari list statis menjadi fungsi dinamis berdasarkan `state.vehicleType` — sembunyikan field SIM/STNK/SKPD jika sepeda |
| FOOD-BIKE-044 | `android-app/.../ui/screens/auth/CourierRegistrationViewModel.kt` | `Step2VehicleContent`: tambah pemilihan jenis kendaraan di awal, drive semua conditional field di step berikutnya |

---

## PHASE 2.5 — Alur Pendaftaran & Verifikasi Merchant

> **Gap:** Phase 2 (Domain Merchant) mengasumsikan merchant sudah punya akun
> dan diverifikasi. Belum ada alur bagaimana merchant sebenarnya **daftar**
> dan **diverifikasi admin** — analog dengan gap yang sama seperti driver
> sebelum Phase 1.5 dibuat.

| Task ID | File | Detail |
|---|---|---|
| FOOD-BIKE-045 | `merchant-service/internal/handler/merchant_registration_handler.go` (baru) | Endpoint pendaftaran merchant: nama toko, alamat, lokasi, jam operasional, KTP pemilik, foto tempat usaha, rekening bank. `NIB`/izin usaha bersifat opsional (banyak UMKM kuliner belum punya) |
| FOOD-BIKE-046 | `..._merchant_verification_status.sql` (migration baru) | Tambah kolom `verification_status` (`pending`/`approved`/`rejected`) di tabel `merchants` — merchant baru default `pending`, tidak bisa terima order sampai `approved` |
| FOOD-BIKE-047 | `admin-dashboard/src/pages/Merchants.tsx` (baru) | Ikuti pola `CourierApplications.tsx` — list merchant pending, review dokumen, approve/reject |
| FOOD-BIKE-048 | `admin-service/src/controllers/merchants.controller.ts` (baru) | Endpoint admin: `GET /admin/merchants`, `POST /admin/merchants/{id}/approve`, `/reject` |
| FOOD-BIKE-049 | `android-app-merchant/` | Screen pendaftaran + status "menunggu verifikasi" sebelum bisa akses menu/order |

---

## PHASE 4 — Backend: Wallet Hold & Bonus Poin

Lokasi: `backend/payment-service/` & `backend/order-service/`

| Task ID | Detail |
|---|---|
| FOOD-BIKE-023 | `payment-service/internal/domain/wallet.go` — tambah `HoldBalance`, `HoldMinimumRequired` ke struct `Wallet` |
| FOOD-BIKE-024 | `payment-service/internal/service/wallet_service.go` — fungsi `DeductFromHold()`, `AutoRefillHold()` |
| FOOD-BIKE-025 | `order-service/internal/service/driver_penalty_service.go` (baru) — kategorisasi ghosting (silent/soft/coerced cancel), kalkulasi potongan bertingkat |
| FOOD-BIKE-026 | `order-service/internal/worker/tier_evaluator.go` (**sudah ada**) — cek isinya, kemungkinan besar reliability-score logic bisa di-extend langsung untuk food, bukan bikin baru |
| FOOD-BIKE-027 | `order-service/internal/service/driver_points_service.go` (baru) — logic tutup poin harian/mingguan, faktor skala self-funding (sama seperti model finansial di spreadsheet) |

---

## PHASE 5 — Mobile & Web Apps

| Task ID | Path | Detail |
|---|---|---|
| FOOD-BIKE-028 | **`android-app-merchant/`** (folder baru) | Kotlin, ikuti struktur persis `android-app-customer/`, package `com.tembus.merchant` |
| FOOD-BIKE-029 | `android-app/app/src/main/java/com/tembus/...` | Tambah dropdown radius (1,2,4,6,10–20 km) di settings driver, vehicle type picker tambah opsi "Sepeda" |
| FOOD-BIKE-030 | `android-app-customer/.../ui/components/ServiceGridMenu.kt` | **Revisi dari rencana awal** ("tab Food") setelah dicek ke kode: Tembus sudah punya grid layanan bergaya Gojek (komentar di file: "Gojek-style 3x2 Grid"), data-driven dari `delivery_service_products` — tabel yang sama dengan FOOD-BIKE-007. Grid saat ini **penuh** (6 slot: Antar Barang, Tambal Ban Motor/Mobil, Towing Motor/Mobil, Riwayat). Geser "Riwayat" keluar dari grid (sudah ada di bottom nav tab, redundant) untuk kasih slot ke Food, atau ekspansi ke 3x3 |
| FOOD-BIKE-030b | `android-app-customer/.../ui/navigation/RootNavGraph.kt` | Tambah case baru di `onBookingClick` handler (`DashboardScreen` composable): `"food_delivery" -> navController.navigate(Screen.FoodHome.route)` — route baru, bukan `Screen.Booking` generik yang dipakai parcel, karena food butuh landing page sendiri (lihat FOOD-BIKE-055) |
| FOOD-BIKE-031 | `frontend/` | Cek relevansi — sync flow food kalau customer web ordering juga didukung |

---

## PHASE 6 — Admin: Manajemen & Rekonsiliasi

> **Gap terbesar:** plan sebelumnya nol task untuk admin. Padahal admin butuh
> visibilitas ke semua entitas baru (merchant, menu, wallet hold, penalty log)
> dan perlu **keputusan arsitektur** soal sistem tier/campaign yang sudah ada.

| Task ID | File | Detail |
|---|---|---|
| FOOD-BIKE-050 | *(keputusan arsitektur, bukan file)* | **Reconcile sistem poin/bonus.** `courier_tier_configs` (Starter/Reliable/Elite berdasarkan rating+completion_rate) & `courier_incentive_campaigns` (target-based, campaign period) **sudah ada**, tapi beda desain dari skema tutup-poin self-funding yang sudah dirancang (Phase 4, FOOD-BIKE-027). Yogi perlu putuskan: (a) reuse `courier_incentive_campaigns` sebagai wadah campaign tutup-poin mingguan, (b) `courier_tier_configs` dipakai untuk reliability score bike (ganti threshold-nya), atau (c) tetap bikin tabel baru dan biarkan dua sistem berjalan terpisah |
| FOOD-BIKE-051 | `admin-dashboard/src/pages/CourierPerformance.tsx` (extend) atau baru `MerchantPerformance.tsx` | Dashboard performa merchant: completion rate, rata-rata prep time, rating |
| FOOD-BIKE-052 | `admin-service/src/controllers/disputes.controller.ts` | Sudah generik (order_id + category + evidence_urls) — cukup tambah kategori baru di enum/dropdown: `makanan_tidak_sesuai`, `driver_ghosting_food`, `coerced_cancel` |
| FOOD-BIKE-053 | `admin-dashboard/src/pages/DeliveryServices.tsx` | Verifikasi row `food_delivery` (dari FOOD-BIKE-007) bisa dikelola di sini — cek kompatibel dengan field `vehicle_types[]`, `proof_geofence_radius_m` yang ditambahkan |
| FOOD-BIKE-054 | `admin-dashboard/src/pages/` (baru, misal `DriverWalletHold.tsx`) | Visibilitas admin ke `hold_balance`, `driver_penalty_log`, status appeal — untuk investigasi manual saat driver banding |

---

## PHASE 7 — Customer Experience Lengkap

> **Gap:** task sebelumnya cuma "tambah tab Food". Padahal customer app
> `android-app-customer` belum punya satupun screen browse/menu/cart — cuma
> punya `booking`, `tracking`, `rating`, `chat`, `payment`, `history` yang
> dibangun untuk flow kirim-barang, sebagian reusable sebagian tidak.

| Task ID | File | Detail |
|---|---|---|
| FOOD-BIKE-055 | `android-app-customer/.../ui/screens/food/` (baru) | Screen browse merchant terdekat (list + search + filter kategori) |
| FOOD-BIKE-056 | `android-app-customer/.../ui/screens/food/MerchantDetailScreen.kt` (baru) | Detail merchant + daftar menu, jam buka/tutup, badge "Ramah Kurir Sepeda" (dari diskusi eco-branding) |
| FOOD-BIKE-057 | `android-app-customer/.../ui/screens/food/CartScreen.kt` (baru) | Keranjang: tambah/kurangi item, catatan per item, ringkasan harga (makanan+ongkir+biaya layanan sesuai Unit Ekonomi) |
| FOOD-BIKE-058 | `android-app-customer/.../ui/screens/tracking/` (extend, cek existing) | Tracking screen existing kemungkinan dibangun untuk status parcel — perlu cek kompatibilitas dengan status baru food (`pending_merchant`, `preparing`, dst dari Phase 3) dan tampilkan tahapan yang sesuai |
| FOOD-BIKE-059 | `database/migrations/..._create_merchant_ratings.sql` (baru) | **Gap ditemukan:** `courier_ratings` hardcoded cuma untuk rating driver. Tabel baru `merchant_ratings` (struktur sama: order_id, merchant_id, rated_by, stars, comment, tags) supaya customer bisa nilai makanan & kurir terpisah |
| FOOD-BIKE-060 | `android-app-customer/.../ui/screens/rating/` (extend) | Setelah delivered, tampilkan **dua** form rating terpisah: rating merchant (rasa/kesesuaian) dan rating driver (kecepatan/kesopanan) |
| FOOD-BIKE-061 | `android-app-customer/.../ui/screens/chat/` (cek reuse) | Verifikasi chat existing bisa dipakai generik untuk chat customer↔driver dan customer↔merchant, atau perlu channel terpisah |

---

## PHASE 7.5 — Pemesanan Multi-Item (Cart → Order)

> **Gap struktural ditemukan:** `CreateOrderRequest` di order-service saat ini
> 100% dibentuk untuk parcel tunggal (`ItemDescription`, dimensi panjang/lebar/
> tinggi/berat) — cocok untuk kirim barang, tapi tidak ada konsep "daftar item
> + kuantitas + harga per item" yang dibutuhkan untuk pesanan makanan (bisa
> pesan beberapa menu sekaligus dari satu merchant). Tidak ada tabel
> `order_items`/`cart_items` di database manapun. Tanpa ini, Cart (FOOD-BIKE-057)
> tidak punya tempat menyimpan hasil pesanan, dan struk (Phase 3.5) tidak bisa
> menampilkan rincian item.

| Task ID | File | Detail |
|---|---|---|
| FOOD-BIKE-071 | `database/migrations/..._create_food_order_items.sql` (baru) | Tabel `food_order_items`: `id, order_id FK, menu_item_id FK, item_name` (snapshot nama saat order — jaga-jaga menu berubah nama nanti), `item_price` (snapshot harga saat order, **jangan** ambil live dari menu supaya harga tidak berubah kalau merchant update harga di tengah proses), `quantity, notes, subtotal` |
| FOOD-BIKE-072 | `order-service/internal/domain/order.go` | Tambah struct `CreateFoodOrderRequest`: `merchant_id`, `items []{menu_item_id, quantity, notes}`, alamat antar. Terpisah dari `CreateOrderRequest` yang ada (jangan dipaksa reuse, beda bentuk data) |
| FOOD-BIKE-073 | `order-service/internal/service/order_service.go` — fungsi `CreateFoodOrder()` (baru) | Validasi server-side (jangan percaya harga dari client): merchant `is_open=true`, tiap `menu_item.is_available=true`, hitung ulang harga dari data merchant di database, jumlahkan subtotal + ongkir (formula existing) + biaya layanan. Simpan `food_order_items` dalam satu transaction dengan order |
| FOOD-BIKE-074 | `order-service/internal/handler/order_handler.go` | Endpoint baru `POST /orders/food` |
| FOOD-BIKE-075 | `android-app-customer/.../ui/screens/food/CheckoutScreen.kt` (baru) | Layar konfirmasi: ringkasan item dari cart, alamat antar, breakdown harga (makanan+ongkir+biaya layanan) — submit ke `POST /orders/food`, lanjut ke flow payment yang sudah ada |
| FOOD-BIKE-076 | `android-app-customer/.../ui/screens/payment/` (cek & extend) | Verifikasi payment screen existing bisa menampilkan breakdown multi-item (bukan cuma 1 baris harga barang), sesuaikan kalau perlu |

---

## PRASYARAT LINTAS-FITUR — Push Notification Infrastructure

> **Gap paling kritis, ditemukan saat audit end-to-end:** tidak ada satupun
> kolom `fcm_token` / `device_token` / `push_token` di seluruh skema database.
> Tanpa ini, **SLA "merchant wajib respon dalam 3 menit" (FOOD-BIKE-022) tidak
> akan berfungsi** — merchant tidak akan tahu ada order masuk kalau app-nya
> di-background/closed. Ini prasyarat, bukan nice-to-have, dan sebaiknya
> dikerjakan **sebelum atau paralel dengan Phase 2 & 3**, bukan di akhir.

| Task ID | Detail |
|---|---|
| FOOD-BIKE-062 | Riset & pilih provider push notification (Firebase Cloud Messaging paling umum untuk Android) |
| FOOD-BIKE-063 | Migration baru: tabel `user_device_tokens` (user_id, token, platform, updated_at) |
| FOOD-BIKE-064 | Backend: service pengiriman push, dipanggil dari `food_prep_worker.go` (order masuk ke merchant), `matching_service.go` (order offer ke driver), dan `order_service.go` (status update ke customer) |
| FOOD-BIKE-065 | Mobile (ketiga app: driver, customer, merchant baru): registrasi token saat login, handle notification tap → deep link ke order terkait |

---

## PHASE 8 — Integrasi & Deteksi Real-Time (Event Wiring)

> **Ditemukan lewat audit rantai peristiwa end-to-end** (order dibuat → selesai):
> beberapa komponen sudah punya task masing-masing, tapi **sambungan antar
> komponennya belum ada**. Tanpa phase ini, sistem akan terlihat lengkap secara
> kode tapi tidak benar-benar nyambung saat dijalankan.

| Task ID | File | Detail |
|---|---|---|
| FOOD-BIKE-066 | `order-service/internal/worker/driver_ghost_detection_worker.go` (baru) | **Gap nyata**: `order_monitor_worker.go` yang ada cuma deteksi order "stuck di searching" (belum dapat driver) — TIDAK ada deteksi "driver sudah accept tapi tidak bergerak". Worker baru ini: cek `courier_locations` vs waktu sejak assignment, kalau tidak ada progress GPS dalam threshold (10-15 menit) → trigger `driver_penalty_service.go` (FOOD-BIKE-025) |
| FOOD-BIKE-067 | `order-service/internal/service/order_service.go` — fungsi transisi ke `delivered` | **Gap kritis, bukan cuma untuk food**: `CreateSettlement()` di `merchant_settlement_repository.go` **tidak dipanggil dari manapun** di codebase. Cron `ProcessPendingSettlements` jalan tiap 5 menit tapi tidak ada yang membuat record pending-nya. Perlu wire: begitu order masuk status `delivered`, panggil `CreateSettlement()` untuk order dengan `merchant_id` terisi. **Prioritas tinggi — pengaruh ke seluruh sistem settlement yang sudah ada, tidak cuma food** |
| FOOD-BIKE-068 | `order-service/internal/service/order_service.go` — fungsi transisi ke `delivered` | Wire pemanggilan `driver_points_service.go` (FOOD-BIKE-027) — tambah poin harian/mingguan setiap order food selesai |
| FOOD-BIKE-069 | *(keputusan desain, bukan file)* | Konfirmasi: scan di titik "delivery" pakai barcode/QR **yang sama** dengan titik "pickup" (struk fisik yang sudah dipegang driver), bukan kode baru dari customer — mengikuti pola resi logistik standar. Kalau ini disetujui, **tidak perlu** task customer-facing QR tambahan di Phase 7 |

---

1. **`order-service/internal/worker/tier_evaluator.go`** — kemungkinan besar reliability-score/tier driver sudah punya logic yang bisa direuse untuk Phase 4, bukan dibangun dari nol.
2. **`order-service/internal/service/settlement_service.go`** — cek apakah payout-split logic (merchant/driver/PT) sudah punya fungsi generik yang tinggal dipanggil untuk food, bukan duplikasi dari `merchant_settlement_service.go`.
3. **`backend/api-gateway/src`** — pola routing & auth middleware existing perlu dipetakan dulu sebelum daftarin `merchant-service` baru.

---

## Urutan Eksekusi yang Disarankan

1. **Prasyarat Push Notification** — kerjakan paralel dengan Phase 0, karena Phase 2/3/5 semua bergantung ke ini untuk terasa "real-time"
2. **Phase 0** (migrations) — fondasi dulu, semua phase lain bergantung ke sini
3. **Phase 1** (enforcement sepeda) + **Phase 1.5** (alur pendaftaran driver) — satu tema besar "sepeda sebagai kendaraan warga negara kedua di sistem", enak dikerjakan berurutan
4. **Phase 2.5** (pendaftaran & verifikasi merchant) — dikerjakan sebelum Phase 2, karena Phase 2 butuh merchant yang sudah `approved`
5. **Phase 2 + 3** (merchant service + state machine order) — bisa paralel karena beda service
6. **Phase 3.5** (struk & proof pickup/delivery) — butuh Phase 2 & 3 jalan dulu
7. **Phase 7.5** (cart → order multi-item) — kerjakan sebelum atau paralel dengan Phase 3, karena Phase 3 (state machine order) & Phase 3.5 (struk) sama-sama butuh struktur `food_order_items` ini sudah ada
8. **Phase 4** (wallet hold + bonus) — selesaikan dulu keputusan arsitektur di FOOD-BIKE-050 sebelum mulai coding, biar gak bangun sistem yang tumpang tindih sama yang sudah ada
9. **Phase 5** (mobile apps driver/customer settings) + **Phase 7** (customer experience lengkap) — paralel, beda screen
10. **Phase 6** (admin) — bisa mulai lebih awal dari dugaan (begitu Phase 2.5 & 0 selesai), jangan ditaruh di akhir — admin butuh visibilitas dari hari pertama merchant mulai daftar
11. **Phase 8** (event wiring) — paralel dari awal untuk FOOD-BIKE-067 (bug settlement lintas-sistem, prioritas tinggi terpisah dari food-bike), sisanya menyusul begitu Phase 3 & 4 selesai
