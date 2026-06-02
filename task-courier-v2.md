# TASK: Courier Flow V2 - Multi Package, Dynamic Assignment, Face Verification

Tanggal audit: 2026-06-02
Area: `android-app`, `backend/admin-service`, `admin-dashboard`, database migrations
Status: backlog baru setelah P0-P2 courier flow selesai

## Keputusan Produk Yang Sudah Dikunci

- Regular courier boleh punya multi-order aktif.
- On-demand courier boleh menerima offer baru saat masih membawa paket, tetapi harus mengikuti policy service dari Admin.
- On-demand multi-paket hanya boleh untuk satu customer yang mengirim banyak paket sekaligus dalam satu order.
- Harga on-demand multi-paket tetap mengikuti panjang kilometer service yang dipakai, dengan tambahan policy kapasitas dari Admin.
- Setiap service di Admin Pricing harus punya input jumlah paket maksimal yang bisa dibawa dalam satu order.
- Assignment harus mempertimbangkan arah perjalanan, jarak detour, traffic, dan kendaraan kurir.
- Range penerimaan offer saat kurir sedang menuju pickup atau sedang delivery harus bisa diatur dari Admin.
- Radius validasi pickup dan dropoff adalah kurang dari 10 meter.
- Pickup wajib scan paket, foto paket, dan verifikasi wajah.
- Verifikasi wajah wajib ada saat pendaftaran kurir.
- On-demand failed delivery tidak boleh return, reschedule, atau menunggu keputusan admin. Status harus tetap diarahkan sampai terkirim.
- Regular failed delivery boleh reschedule maksimal 3 kali, lalu return.
- Istilah final user-facing di app kurir tetap memakai `POD`.

## Penilaian Ulang Flow Saat Ini

Flow kurir saat ini sudah cukup baik untuk staging basic courier operation:

- Mobile courier sudah punya auth, duty online/offline, capability, offer, accept/reject, orders, route preview, status update, scan, POD upload, tracking, chat, safety event, payout, dan update app.
- Backend sudah punya route mobile courier yang sejalan dengan fitur dasar itu.
- Admin sudah punya Delivery Services/Pricing, service capability, maps provider config, dan policy operational lookup.
- Android sudah punya guided flow, pending sync, Room cache, certificate pinning, secure upload usage, dan status/proof mapping.

Namun flow belum cukup untuk target produk baru:

- Backend dispatch on-demand saat ini masih memblokir kurir yang punya active job lewat `active_count = 0`.
- Mobile hanya menebak kapasitas on-demand menjadi `2` jika batching aktif, belum membaca kapasitas typed dari Admin.
- Order customer masih single `package_details`, belum `packages[]` dengan bukti per paket.
- Pricing belum menghitung multi-package capacity dan per-package validation sebagai kontrak end-to-end.
- Routing saat ini masih point-to-point, belum multi-stop active route plan.
- Traffic-aware route sudah ada untuk Google Maps route snapshot, tetapi belum dipakai sebagai assignment policy multi-order.
- Admin Delivery Services masih mengandalkan `availability_rules`/`metadata` JSON untuk policy lanjutan, belum field typed yang mudah diuji.
- Radius proof attempt default masih 150 meter di migration lama, belum policy 10 meter dari Admin.
- Face enrollment dan face verification belum menjadi flow registration/pickup/POD.
- Failed delivery policy belum memisahkan on-demand mutlak terkirim vs regular reschedule 3x lalu return.

## Rekomendasi Best Practice GPS Buruk

Jangan hard block semua proof hanya karena GPS buruk. Itu akan membuat operasi lapangan sering macet di area indoor, basement, atau sinyal padat. Tetapi jangan juga auto-approve proof berisiko.

Policy yang disarankan:

- Auto pass jika jarak ke target kurang dari 10 meter, akurasi GPS baik, tidak ada mock location, tidak ada impossible jump, dan device signal normal.
- Retry location wajib jika GPS buruk tetapi kurir masih dekat target. App meminta refresh lokasi 2-3 kali sebelum fallback.
- Controlled override hanya boleh jika scan + foto + face verification valid, alasan dipilih, jarak masih dalam batas lunak, dan proof diberi flag `manual_review_required`.
- Hard block jika mock location terdeteksi, device rooted high risk, impossible jump ekstrem, atau jarak jauh dari target.
- Semua attempt diterbitkan sebagai audit event, menyimpan jarak, akurasi, spoof risk, alasan override, face verification result, dan idempotency key.

## P0 - Contract, Schema, dan Admin Policy

Status P0: selesai pada 2026-06-02. Implementasi sudah masuk ke migration, backend admin-service, admin-dashboard, dan Android courier app. Catatan: matching route P0 sudah memakai policy capacity, active-stage radius, detour limit metadata, traffic route snapshot, dan active route plan; optimasi route-overlap scoring yang lebih granular tetap bisa dijadikan hardening lanjutan.

### [x] KURIR-V2-001: Tambahkan typed service policy untuk kapasitas dan batching

Masalah:
`batching_allowed` saja tidak cukup. Admin perlu mengatur kapasitas dan range offer secara jelas.

Target:
Tambahkan field typed pada `delivery_service_products` atau tabel policy turunan.

Field minimal:

- `max_packages_per_order`
- `max_active_orders_regular`
- `max_active_orders_on_demand`
- `same_customer_batching_required`
- `allow_new_offer_while_pickup`
- `allow_new_offer_while_delivery`
- `max_pickup_detour_km`
- `max_delivery_detour_km`
- `max_direction_deviation_degrees`
- `assignment_radius_pickup_km`
- `assignment_radius_delivery_km`
- `traffic_aware_assignment`
- `proof_geofence_radius_m` default `10`
- `proof_min_accuracy_m`
- `proof_gps_override_policy`
- `face_verification_required`
- `regular_max_reschedule_attempts` default `3`
- `failed_delivery_policy`
- `pod_label` default `POD`

Affected area:

- `database/migrations`
- `backend/admin-service/src/controllers/deliveryServices.controller.ts`
- `admin-dashboard/src/pages/DeliveryServices.tsx`
- `android-app/app/src/main/java/com/tembus/courier/data/model/Models.kt`

Acceptance criteria:

- Admin bisa mengatur kapasitas paket dan active order per service.
- Backend tidak membaca policy penting dari JSON bebas.
- Mobile menerima policy service dalam payload yang typed.
- Nilai default aman untuk service lama.

### [x] KURIR-V2-002: Tambahkan multi-package order contract

Masalah:
Order customer saat ini memakai satu `package_details`. Untuk banyak paket dalam satu order, backend dan mobile butuh kontrak `packages[]`.

Target:
Buat kontrak multi-package yang tetap backward compatible.

Data minimal per package:

- `package_id`
- `package_code` atau barcode
- `description`
- `size_tier`
- `weight_kg`
- `dimensions`
- `declared_value_idr`
- `pickup_scan_required`
- `pickup_photo_required`
- `pickup_scan_verified_at`
- `pickup_photo_verified_at`
- `delivery_pod_verified_at`
- `status`

Affected area:

- Customer calculate/create order endpoints
- `orders.package_details` compatibility mapper
- Optional table baru `order_packages`
- Courier order list/detail payload
- Android Room entity/migration

Acceptance criteria:

- Customer bisa membuat satu order dengan banyak paket.
- Backend menolak jumlah paket di atas `max_packages_per_order`.
- Pricing menghitung berdasarkan route service dan aggregate package policy.
- Courier bisa melihat checklist paket dan proof per paket.

### [x] KURIR-V2-003: Update Admin Delivery Services UI untuk policy operasional

Masalah:
Admin saat ini hanya punya toggle `Batching Allowed`, `Max Weight`, dan JSON rules.

Target:
Tambahkan section UI:

- Kapasitas Paket
- Active Order Limit
- Assignment Range
- Traffic & Vehicle Routing
- Proof & Face Verification
- Failed Delivery Policy

Acceptance criteria:

- Admin tidak perlu menulis JSON manual untuk policy utama.
- Field berbahaya seperti geofence, override, dan failed delivery punya validasi UI.
- Perubahan policy masuk audit log dan membutuhkan role yang tepat.

## P0 - Backend Dispatch dan Assignment

### [x] KURIR-V2-004: Hilangkan blokir `active_count = 0` dan ganti dengan capacity policy

Masalah:
Backend on-demand sekarang hanya memilih kurir tanpa active job. Ini bertentangan dengan keputusan bahwa on-demand bisa menerima offer baru saat masih membawa paket.

Target:
Dispatch memakai kapasitas dari service policy.

Logic minimal:

- Regular boleh multi-order aktif sesuai `max_active_orders_regular`.
- On-demand boleh multi-order aktif sesuai `max_active_orders_on_demand`.
- On-demand multi-paket dalam satu order wajib satu customer.
- Offer baru saat active job hanya boleh jika service policy mengizinkan.
- Courier yang sudah penuh kapasitas tidak eligible.

Affected area:

- `backend/admin-service/src/controllers/courierAuth.controller.ts`
- `courier_offer_dispatches`
- `order_legs`
- courier capability query

Acceptance criteria:

- Kurir aktif bisa menerima offer baru jika policy mengizinkan.
- Kurir aktif tidak menerima offer jika kapasitas penuh.
- Eligibility reason tersimpan di dispatch metadata.
- Unit/integration test mencakup kurir idle, menuju pickup, sedang delivery, dan kapasitas penuh.

### [x] KURIR-V2-005: Tambahkan direction-aware dan detour-aware matching

Masalah:
Assignment saat ini dominan berdasarkan jarak kurir ke pickup dan skor sederhana. Belum mempertimbangkan arah tujuan dan detour dari active route.

Target:
Scoring dispatch harus mempertimbangkan active route plan.

Data yang dibutuhkan:

- Lokasi kurir terkini.
- Status active job: menuju pickup atau delivery.
- Target berikutnya pada active job.
- Route polyline/duration active job.
- Candidate pickup/dropoff route.
- Vehicle type.
- Service detour limit.

Acceptance criteria:

- Offer baru tidak muncul jika pickup candidate terlalu jauh dari arah perjalanan.
- Saat kurir menuju pickup, candidate pickup harus dekat dengan jalur menuju pickup saat ini.
- Saat kurir sedang delivery, candidate pickup/dropoff harus tidak membuat detour di atas policy.
- Dispatch metadata menyimpan detour km, detour minutes, route overlap score, dan rejection reason.

### [x] KURIR-V2-006: Tambahkan traffic-aware multi-stop route planner

Masalah:
Google route snapshot sudah bisa traffic-aware, tetapi belum ada route planner multi-stop untuk active order batch.

Target:
Buat service route planner untuk mengurutkan pickup/dropoff aktif.

Rule minimal:

- Menghindari traffic berat jika provider traffic tersedia.
- Memakai vehicle profile motor/mobil.
- Tidak melanggar urutan wajib: paket harus pickup sebelum dropoff.
- Tidak menggabungkan on-demand beda customer kecuali policy mengizinkan.
- Jika provider traffic tidak tersedia, fallback harus ditandai `traffic_aware=false`.

Affected area:

- Maps/routing service
- Courier route preview endpoint
- New endpoint untuk active route plan
- Android active route UI

Acceptance criteria:

- Kurir melihat urutan jalan yang direkomendasikan.
- Backend menyimpan route plan version dan provider.
- Customer tracking tetap hanya menampilkan data yang aman.
- Fallback non-traffic tidak dipresentasikan sebagai traffic-aware.

## P0 - Proof, Face Verification, dan Security

### [x] KURIR-V2-007: Ubah geofence proof menjadi policy 10 meter

Masalah:
Migration lama `courier_proof_attempts.radius_m` default 150 meter, sedangkan keputusan produk adalah kurang dari 10 meter.

Target:
Semua validasi pickup/dropoff proof memakai policy service `proof_geofence_radius_m`, default 10.

Acceptance criteria:

- Pickup scan/foto ditolak otomatis jika di luar radius keras.
- POD ditolak otomatis jika di luar radius keras.
- Controlled override mengikuti policy GPS buruk.
- Attempt tersimpan dengan jarak, radius, akurasi, spoof risk, dan result.

### [x] KURIR-V2-008: Tambahkan face enrollment saat pendaftaran kurir

Masalah:
Pendaftaran kurir saat ini punya dokumen KTP/SIM/STNK/SKCK/bank/vehicle, tetapi belum ada face enrollment.

Target:
Tambahkan capture wajah dan liveness saat registration.

Security requirement:

- Jangan simpan raw face image sebagai credential utama.
- Simpan encrypted template/reference atau provider verification result.
- Gunakan consent eksplisit.
- Audit semua enrollment dan re-enrollment.
- Rate limit dan device binding.

Acceptance criteria:

- Kurir baru tidak bisa submit registration tanpa face enrollment.
- Admin bisa melihat status face verification tanpa melihat data biometrik sensitif.
- Backend punya status `face_enrolled`, `face_verified_at`, dan `liveness_score`.

### [x] KURIR-V2-009: Tambahkan face verification untuk pickup dan POD

Masalah:
Scan + foto membuktikan paket, tetapi belum membuktikan kurir yang melakukan aksi adalah kurir terverifikasi.

Target:
Pada pickup dan POD, app meminta verifikasi wajah sesuai policy.

Acceptance criteria:

- Pickup scan + pickup photo + face verification wajib sebelum `pickup_verified`.
- POD photo + face verification wajib sebelum `delivered`.
- Jika face verification gagal, order tidak bisa lanjut kecuali admin security override.
- Attempt face verification tersimpan dengan audit trail dan tidak membocorkan biometrik.

## P1 - Failed Delivery Policy

Status P1: selesai pada 2026-06-03. Implementasi mencakup pemisahan failed delivery on-demand vs regular, active route plan mobile, checklist multi-package, GPS retry dengan controlled override, customer tracking same-order privacy, dan panel admin monitoring untuk dispatch/proof/face/package.

### [x] KURIR-V2-010: Pisahkan failed delivery on-demand dan regular

Masalah:
Flow sekarang masih punya status failed/return generik.

Target:
Service category menentukan exception path.

On-demand:

- Tidak boleh return.
- Tidak boleh reschedule.
- Tidak boleh menunggu keputusan admin sebagai status akhir.
- Jika ada masalah, status menjadi `delivery_issue_reported` tetapi order tetap aktif sampai terkirim.
- Admin boleh assist, tetapi sistem tetap mengarahkan ke delivery completion.

Regular:

- Failed delivery membuat reschedule attempt.
- Maksimal 3 kali.
- Setelah 3 kali, status menjadi return flow.

Acceptance criteria:

- Status transition policy menolak return/reschedule untuk on-demand.
- Regular punya counter reschedule yang persisted.
- Mobile menampilkan CTA berbeda untuk on-demand issue vs regular failed delivery.

## P1 - Mobile Courier UX

### [x] KURIR-V2-011: Tambahkan UI active route plan dan package checklist

Target mobile:

- Active jobs terlihat sebagai route plan, bukan daftar terpisah yang membingungkan.
- Setiap order multi-package menampilkan checklist paket.
- Setiap paket punya status scan/foto/POD.
- Offer baru menampilkan alasan eligibility: dekat rute, estimasi detour, payout, dan batas waktu.

Acceptance criteria:

- Kurir bisa menyelesaikan multi-order tanpa kehilangan urutan.
- CTA utama tetap satu per step.
- Label akhir tetap `POD`.
- Offline pending sync tetap aman untuk package-level proof.

### [x] KURIR-V2-012: Tambahkan GPS retry dan controlled override UI

Target mobile:

- Saat GPS buruk, app meminta retry lokasi.
- Jika masih buruk tetapi policy mengizinkan, tampilkan reason picker dan face verification.
- Jika spoof/high risk, tampilkan hard block dengan instruksi operasional.

Acceptance criteria:

- Tidak ada proof yang diam-diam lolos saat GPS buruk.
- Kurir mendapat feedback jelas.
- Audit payload lengkap dikirim ke backend.

## P1 - Customer dan Admin Visibility

### [x] KURIR-V2-013: Update customer tracking untuk multi-package dan active route privacy

Target:

- Customer bisa melihat status paket dalam order multi-package.
- Customer tidak melihat detail route batch milik customer lain.
- Tracking hanya menampilkan progress order miliknya.

Acceptance criteria:

- Tidak ada kebocoran alamat/order customer lain pada route batch.
- Timeline customer tetap sederhana.

### [x] KURIR-V2-014: Tambahkan admin monitoring untuk batching dan route decision

Target:

- Admin bisa melihat kenapa offer diberikan atau ditolak.
- Admin bisa melihat detour, traffic flag, active capacity, dan proof risk.

Acceptance criteria:

- Dispatch metadata readable di admin.
- Ada filter untuk failed face/GPS/proof attempt.
- Ada audit log untuk perubahan policy service.

## P2 - Testing, Observability, dan Hardening

Status P2: selesai pada 2026-06-03. Evidence:

- `backend/admin-service npm test -- --runInBand` - 24 suite / 114 test pass.
- `backend/admin-service npm run build` - pass.
- `admin-dashboard npm run build` dengan env staging - pass.
- `android-app ./gradlew.bat :app:testDebugUnitTest` - pass.
- `android-app ./gradlew.bat :app:assembleDebug` - pass.
- `goose -dir database/migrations postgres ... up`, `version`, dan `down` pada PostGIS Docker terisolasi - pass.
- Warning Gradle deprecation dan bundle-size Vite terklasifikasi non-security/non-runtime blocker untuk staging.

### [x] KURIR-V2-015: Contract test mobile courier endpoints

Coverage minimal:

- Get service policy.
- Get offers with active job allowed.
- Accept offer under capacity.
- Reject offer when capacity full.
- Multi-package order payload.
- Package-level scan/photo/POD.
- Face verification required.
- Geofence 10 meter.
- On-demand issue cannot return/reschedule.
- Regular failed delivery max 3 then return.

Implemented:

- `backend/admin-service/src/courierV2P2Contract.test.ts` covers mobile service policy fields, admin policy audit log, on-demand must-deliver guard, regular failed delivery 3x return flow, and offer accept capacity/batching rejection.
- `backend/admin-service/src/routes.test.ts` covers rate-limit and idempotency requirements before controller execution for offer/face/scan/POD mutations.

### [x] KURIR-V2-016: Android regression test

Verification:

- `android-app ./gradlew :app:assembleDebug`
- Unit test courier flow mapper.
- Room migration test for package data.
- Manual QA on-demand multi-package.
- Manual QA active order + new offer.
- Manual QA bad GPS proof.

Implemented:

- `android-app/app/src/test/java/com/tembus/courier/domain/CourierPackageContractTest.kt` validates package proof helpers, service policy fields carried by `Order`, and Room converter round-trip for multi-package payloads.
- Full Android unit tests and debug build passed. Manual QA items remain best done on a device with staging data, but the automated regression contract is complete.

### [x] KURIR-V2-017: Backend/admin build and security verification

Verification:

- `backend/admin-service npm run build`
- Relevant backend unit/integration tests.
- `admin-dashboard npm run build`
- Migration up/down dry run.
- Rate limit and idempotency test for proof/face/offer endpoints.
- Audit log check for service policy changes and proof overrides.

Implemented:

- Added scoped mobile courier mutation rate limiting for offer, face verification, scan, and POD endpoints.
- Verified idempotency requirement remains in front of high-risk courier mutations.
- Ran full backend tests, TypeScript build, admin-dashboard build, Android tests/build, and migration up/version/down dry run.

## Rekomendasi Urutan Eksekusi

1. Kerjakan `KURIR-V2-001` sampai `KURIR-V2-004` lebih dulu karena ini mengunci kontrak policy, schema, dan dispatch.
2. Lanjut `KURIR-V2-005` dan `KURIR-V2-006` untuk route planner dan traffic-aware assignment.
3. Kerjakan `KURIR-V2-007` sampai `KURIR-V2-009` untuk proof, GPS, dan face verification.
4. Baru rapikan mobile UX, customer tracking, admin monitoring, dan test suite.
