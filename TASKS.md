# Tasks

## Active

- [x] **P2 - Maps provider observability dan ops safety** - perubahan provider maps harus aman untuk operasional nasional.
  - [x] Log structured untuk provider aktif, fallback provider, route/geocode latency, error rate, cache hit/miss, dan disabled mode.
  - [x] Alert saat provider gagal tinggi, latency tinggi, kuota mendekati limit, atau fallback OSM terlalu sering.
  - [x] Admin melihat status provider, last error, dan tombol emergency disable/restore OSM.
  - [x] Test mencakup Google enabled, OSM enabled, Google disabled fallback OSM, disabled fallback, provider failure alert, dan quota near-limit alert.
  - [x] Acceptance criteria: operator bisa mematikan Google Maps dari admin dan semua client tetap usable via text/ETA fallback.

- [x] **P0 - Samakan kontrak order customer web dan mobile** - webapp customer, mobile customer, backend, dan aplikasi kurir harus memakai kontrak order/payment/address yang sama agar order tidak bisa macet di tengah.
  - Web customer address book wajib pindah dari `localStorage` ke endpoint database yang sama dengan mobile customer.
  - Web order form wajib membaca, membuat, mengubah, dan memilih alamat dari database customer address book.
  - Mobile customer payment wajib punya endpoint status/check yang eksplisit seperti web, bukan hanya WebView success URL atau webhook.
  - Backend wajib menyediakan kontrak payment customer yang sama untuk web dan mobile: create payment, get status, confirm/check paid, dan retry aman.
  - Mobile customer wajib menampilkan state pembayaran: menunggu pembayaran, mengecek pembayaran, berhasil, gagal, expired, dan retry.
  - Order hanya boleh masuk dispatch kurir setelah payment benar-benar mengubah order ke status siap dispatch.
  - Acceptance criteria: order dari web dan mobile sama-sama menghasilkan order `pending_payment`, payment paid, dispatch offer 15 detik ke kurir, dan customer tracking aktif tanpa refresh manual.

- [x] **P0 - Hilangkan placeholder address/location di customer booking** - pickup/dropoff dan alamat favorit harus berasal dari user, geolocation, map picker, receiver location request, atau database, bukan fallback statis.
  - Hapus dependency UI ke sample/fallback address untuk flow utama booking.
  - Jika lokasi user belum tersedia, tampilkan empty state dan CTA pilih lokasi, bukan alamat demo.
  - Web dan mobile wajib punya validasi koordinat pickup/dropoff sebelum price calculation.
  - Backend wajib menolak order tanpa koordinat valid untuk layanan on-demand.
  - Acceptance criteria: tidak ada order on-demand baru yang memakai alamat demo seperti Monas kecuali data itu dipilih/disimpan oleh user.

- [x] **P1 - Receiver location request parity web dan mobile** - fitur minta lokasi penerima harus tersedia end-to-end di web customer dan mobile customer.
  - Web order form wajib bisa membuat link minta lokasi penerima dari endpoint database.
  - Mobile customer tetap memakai endpoint yang sama dan menampilkan status link aktif/terisi/expired.
  - Public receiver location page wajib menyimpan nama penerima, nomor, alamat, catatan, dan koordinat ke request yang sama.
  - Setelah penerima mengisi lokasi, web/mobile customer wajib bisa apply lokasi itu ke dropoff order tanpa input ulang.
  - Acceptance criteria: customer membuat link dari web/mobile, penerima isi lokasi di public page, lalu dropoff otomatis tersedia di booking.

- [x] **P1 - Dimension dan package detail enterprise parity** - ukuran, berat, isi paket, dan service eligibility harus konsisten antara customer web, customer mobile, pricing admin, dan kurir.
  - Backend harus punya aturan tunggal untuk `requires_dimension_scan`, batas berat, vehicle type, dan service capability.
  - Mobile customer harus punya flow package size/weight yang tidak fake dan cukup untuk service yang tidak wajib scan.
  - Untuk service yang wajib scan, mobile harus punya scanner nyata atau backend/admin harus menandai service tersebut tidak tersedia di mobile sampai scanner siap.
  - Web scan modal harus jelas statusnya: real scan, manual estimate, atau disabled by policy.
  - Kurir harus melihat detail paket yang sama dengan customer: isi paket, berat, dimensi, service, dan bukti pickup/POD.
  - Acceptance criteria: service yang dipilih customer selalu cocok dengan kendaraan/capability kurir dan tidak gagal di tengah karena detail paket tidak lengkap.

- [x] **P1 - Customer proof visibility parity** - semua bukti dari kurir wajib terlihat dengan jelas di customer web dan mobile.
  - Customer mobile detail/tracking wajib menampilkan pickup scan, pickup photo, POD photo, cancellation proof, dan event timestamp.
  - Customer web order detail wajib memakai kontrak proof yang sama dengan mobile.
  - Cancellation sebelum pickup wajib tampil ke customer dengan alasan yang tenang dan bukti foto bila ada.
  - Admin tetap menjadi sumber audit penuh, tetapi customer harus melihat bukti operasional yang relevan.
  - Acceptance criteria: setelah kurir scan/foto/cancel/POD, customer web dan mobile sama-sama melihat update tanpa inkonsistensi label/status.

- [x] **P2 - Full UI E2E customer web/mobile ke kurir** - tambah test perjalanan nyata lintas aplikasi, bukan hanya backend contract test.
  - Playwright untuk web customer: login, pilih alamat DB, hitung harga, buat order, bayar/check payment, buka tracking.
  - Maestro atau Android instrumentation untuk mobile customer: login, pilih pickup/dropoff, pilih service, payment status, tracking.
  - Android courier E2E: login kurir on-demand, duty aktif, terima offer 15 detik, pickup proof scan+foto, delivery, POD.
  - Test harus memverifikasi event customer balik: offer accepted, otw pickup, pickup verified, delivery started, POD completed, ledger earning.
  - Acceptance criteria: satu command CI/staging bisa menjalankan skenario customer order sampai kurir selesai dan customer melihat proof akhir.

- [x] **P2 - Real FCM device validation** - jalur push notification harus dibuktikan dengan token Firebase asli di emulator/device staging.
  - Register token customer dan kurir dari app setelah login.
  - Trigger order on-demand sampai offer masuk ke kurir via push saat app foreground, background, dan killed bila memungkinkan.
  - Trigger status update kurir dan pastikan customer menerima push/timeline.
  - Catat fallback socket/polling saat FCM gagal.
  - Code-level readiness selesai: backend memvalidasi format token/platform, menyimpan token aman, dan readiness endpoint menunggu secret/device staging.
  - Acceptance criteria: notifikasi kritis tetap sampai atau punya fallback visual yang terbukti berjalan.

- [x] **P2 - Route/ETA production hardening** - tracking customer harus memakai ETA dan route polyline yang stabil saat API key tersedia, dan fallback aman saat provider gagal.
  - Staging wajib diisi `GOOGLE_MAPS_API_KEY` atau `GOOGLE_DIRECTIONS_API_KEY`.
  - Tracking web/mobile wajib render route polyline dari backend jika tersedia.
  - Jika provider gagal/rate limited, UI wajib menampilkan ETA perkiraan dengan label yang jujur tanpa crash.
  - Observability wajib mencatat provider latency, cache hit/miss, dan fallback count.
  - Acceptance criteria: customer melihat posisi kurir, rute, ETA, dan status stage yang sama di web/mobile.

- [x] **P3 - Frontend dependency security cleanup** - vulnerability frontend dari docker build harus ditutup sebelum production-grade.
  - Jalankan audit dependency frontend dan klasifikasikan moderate/high.
  - Upgrade dependency yang aman tanpa memecahkan Next.js build.
  - Jika ada vulnerability transitive yang belum ada patch, dokumentasikan compensating control dan pin versi.
  - CI harus tetap build, lint, dan test setelah upgrade.
  - Dokumentasi audit: `docs/frontend-security-audit.md`.
  - Hasil akhir: `npm audit --audit-level=moderate` pada `frontend` = 0 vulnerability.
  - Acceptance criteria: tidak ada high vulnerability yang belum punya mitigasi tertulis.

- [x] **P3 - Operational readiness customer-kurir workflow** - siapkan checklist operasional agar tim bisa menjalankan, memantau, dan memulihkan workflow nasional.
  - Runbook order stuck di `pending_payment`, `pending`, `offered`, `accepted`, `pickup_verified`, dan `delivery_started`.
  - Dashboard/SQL query untuk cek order tanpa courier offer, payment paid tanpa dispatch, dispatch expired terus, dan POD tanpa ledger.
  - Checklist rollback aman tanpa update ledger langsung.
  - Runbook operasional: `docs/customer-courier-operational-readiness.md`.
  - Acceptance criteria: setiap status macet punya prosedur diagnosis dan recovery yang aman.

## Waiting On

- [ ] **Production/staging deploy secret operator** - lokal dan no-maps automation sudah selesai; untuk server staging/production masih perlu isi env di host/GitHub Secrets: `FIREBASE_CUSTOMER_PROJECT_ID`, `FIREBASE_CUSTOMER_SERVICE_ACCOUNT_B64`, `FIREBASE_COURIER_PROJECT_ID`, dan `FIREBASE_COURIER_SERVICE_ACCOUNT_B64`; `GOOGLE_MAPS_API_KEY`/`GOOGLE_DIRECTIONS_API_KEY` tetap dibutuhkan jika provider `google_maps` diaktifkan, tetapi tidak boleh menjadi blocker total setelah runtime OSM fallback selesai.
## Someday

No someday on-demand readiness tasks.

## Done

- [x] **P1 - Mobile map abstraction untuk customer dan kurir** - Android customer dan courier sekarang memakai renderer peta runtime, bukan layar workflow yang hardcode ke satu provider.
  - Dependency MapLibre native ditambahkan ke mobile customer dan kurir untuk renderer OpenStreetMap.
  - Komponen `RuntimeMapRenderer` dibuat di customer dan courier dengan kontrak `MapsProviderConfig`, marker list, route overlay, camera/follow location, Google renderer, MapLibre/OSM renderer, dan fallback disabled/text-safe.
  - Customer mobile booking preview dan tracking screen membaca config backend, menampilkan marker pickup/dropoff/kurir, dan merender route dari backend saat tersedia.
  - Courier mobile offer dialog, home active job, dan detail pengantaran memakai renderer yang sama; route preview detail memakai polyline/ETA dari backend, bukan kalkulasi client.
  - Verifikasi: tidak ada penggunaan `GoogleMap(` di layar workflow selain wrapper runtime; customer dan courier `:app:compileDebugKotlin` hijau dengan JBR Android Studio.

- [x] **P0 - Runtime maps provider config dari admin** - Google Maps, OpenStreetMap, dan mode text-only sekarang bisa dikontrol dari config admin tanpa rebuild mobile customer/kurir.
  - Migration `20260519000007_maps_provider_runtime_config.sql` menambahkan `maps_provider_config` scoped untuk global, customer mobile, courier mobile, dan web customer.
  - Backend menyediakan gateway `GET /api/v1/maps/config`, `GET /api/v1/maps/route`, `GET /api/v1/maps/geocode`, `GET /api/v1/maps/reverse-geocode`, `GET/PATCH /admin/maps-provider-config`, fallback ETA haversine, Google Directions, Google Geocoding, OSM OSRM, dan OSM Nominatim tanpa mengekspos API key ke mobile/web.
  - Admin Settings punya tab `Maps Provider` untuk memilih provider global/scope, toggle enable/disable per client, TTL config, dan OSM tile template.
  - Web customer order form membaca config runtime dan memakai maps gateway untuk pencarian alamat; mobile customer membaca config runtime pada tracking dan menampilkan fallback text-safe saat provider bukan Google; mobile courier membaca config saat ViewModel start/refresh dan route preview memakai provider backend.
  - Verifikasi: admin-service build, admin-service test suite 58/58, admin-dashboard build, migration fresh PostGIS up, Android customer/courier `:app:compileDebugKotlin` hijau dengan JBR Android Studio.

- [x] **Someday - Realtime WebSocket scale test** - simulasi ribuan order on-demand aktif dan banyak kurir online sudah dikunci di test backend.
  - Test `onDemandRealtimeScale.test.ts` membangun 2.500 payload tracking dengan 5.000 kurir virtual.
  - Contract memastikan event, room id, customer id, courier id, dan location payload tidak berubah.

- [x] **Someday - Offline-first tracking replay** - replay lokasi kurir sudah aman untuk retry saat jaringan putus.
  - Aplikasi kurir mengirim `client_location_id` stabil per titik lokasi lokal.
  - Backend menyimpan `client_location_id` dan `device_id`, lalu men-skip duplicate replay tanpa membuat posisi ganda.
  - Response sync mengembalikan `acceptedCount`, `rejectedCount`, dan `duplicateCount`.

- [x] **Someday - Customer sharing public tracking link** - customer bisa membuat link tracking publik untuk penerima tanpa login setelah kurir menerima pekerjaan.
  - Endpoint: `POST /auth/web/orders/:id/public-tracking-link`.
  - Public page: `/track/:token`.
  - Link memakai token hash di database, TTL 12 jam, dan tidak mengekspos token asli di storage.

- [x] **Waiting On infra readiness prepared** - external key infra sudah siap dan tinggal diisi secret/API key.
  - Docker Compose sekarang meneruskan Google Directions dan Firebase Admin env ke `admin-service`.
  - Endpoint aman `GET /api/v1/system/on-demand-readiness` dibuat untuk cek status tanpa mengekspos secret.
  - Env template dan dokumen setup key dibuat: `docs/on-demand-external-keys-setup.md`.
  - FCM staging checklist dihubungkan ke readiness endpoint.

- [x] **Waiting On local Firebase credentials inserted** - Firebase Admin customer dan kurir sudah terpasang untuk Docker lokal tanpa mengekspos secret.
  - Customer project: `android-customer-c2872`.
  - Courier project: `android-kurir`.
  - `.env` lokal memakai `FIREBASE_CUSTOMER_SERVICE_ACCOUNT_B64` dan `FIREBASE_COURIER_SERVICE_ACCOUNT_B64`.
  - `admin-service` sudah support multi-project FCM: customer token dikirim lewat Firebase customer, courier token lewat Firebase kurir.
  - Readiness lokal sudah `ready_for_staging_validation`.

- [x] **Waiting On no-maps E2E automation** - validasi waiting-on bisa dijalankan tanpa `GOOGLE_MAPS_API_KEY`/`GOOGLE_DIRECTIONS_API_KEY`.
  - Test: `backend/admin-service/src/onDemandWaitingOnNoMaps.e2e.test.ts`.
  - Script: `npm run test:e2e:waiting-on:no-maps`.
  - Coverage: readiness Firebase tetap ready tanpa Maps key, Firebase Admin customer/kurir init, customer notification memakai project customer, courier offer notification memakai project kurir, FCM payload membawa order/dispatch metadata.
  - Batasan: foreground/background/killed app tetap harus divalidasi di emulator/device karena itu perilaku OS dan Firebase runtime nyata.

- [x] **Waiting On OS-level push automation** - validasi push nyata bisa dijalankan dari PowerShell + ADB + backend Docker tanpa Google Maps key.
  - Script: `scripts/e2e-fcm-os-validation.ps1`.
  - Probe backend: `backend/admin-service/src/scripts/sendFcmDeviceProbe.ts`.
  - Command: `powershell -ExecutionPolicy Bypass -File .\scripts\e2e-fcm-os-validation.ps1 -CustomerSerial emulator-5556 -CourierSerial emulator-5554`.
  - Bukti tersimpan di `artifacts/fcm-os-validation/<timestamp>/summary.json`, logcat, dan dumpsys notification.
  - Courier sudah lolos foreground, background, dan killed via Android OS notification evidence.
  - Customer sudah lolos foreground, background, dan killed via Android OS notification evidence setelah login `customer.mobile@lancar.id`.

- [x] **P0 - Realtime contract hardening untuk on-demand** - semua event utama memakai payload `on_demand_event` stabil dan room `order:{order_id}` dengan legacy fallback event.
  - Event minimal selesai: offer_created, offer_accepted, courier_otw_pickup, pickup_verified, delivery_started, pod_completed, pickup_cancelled, chat_message, tracking_updated.
  - Backend contract test ditambahkan untuk tracking, chat, offer_created, dan token registration.

- [x] **P0 - Customer web realtime zero-refresh** - customer web order detail join/leave order room dan menerima tracking/chat/status tanpa manual refresh.
  - Tracking page web menerima `on_demand_event`, `tracking_updated`, `order_tracking_updated`, dan `tracking:update`.
  - Chat customer web memakai room order dengan de-duplication message id.
  - Polling lama tetap dipertahankan sebagai fallback.

- [x] **P0 - FCM registration hook readiness** - endpoint mobile/customer/courier token registration diverifikasi lewat unit test dan checklist staging dibuat.
  - Checklist: `docs/on-demand-fcm-staging-checklist.md`.

- [x] **P1 - ETA dan route polyline akurat** - tracking on-demand memakai route provider abstraction dengan Google Directions cache Redis dan fallback graceful.
  - Endpoint tracking mengembalikan `eta`, `eta_minutes`, `route_polyline`, `route_provider`, `target`, dan lokasi terakhir valid.
  - Cache route pendek aktif 60 detik saat `GOOGLE_MAPS_API_KEY`/`GOOGLE_DIRECTIONS_API_KEY` tersedia.
  - Tanpa API key/provider down, endpoint tetap mengirim ETA fallback haversine dan status perjalanan.

- [x] **P1 - Stage-aware tracking customer** - customer tracking sekarang punya stage dan timeline yang sama untuk mobile/web.
  - Fase selesai: mencari kurir, kurir menuju pickup, validasi pickup, menuju tujuan, selesai, dibatalkan.
  - Detail tracking mobile menyertakan `tracking`, `events`, dan `proofs`.
  - POD/cancellation proof tetap tersedia dari detail tracking/order.

- [x] **P1 - Location quality guard** - update lokasi kurir divalidasi sebelum tampil ke customer.
  - Lokasi mock, akurasi buruk, timestamp lama, koordinat invalid, dan loncatan tidak wajar ditandai.
  - Safety event otomatis dibuat di `courier_safety_events`.
  - Customer hanya melihat lokasi valid terakhir; data mencurigakan tidak dipublish ke room realtime.

- [x] **P2 - Full staging E2E scenario automation** - test otomatis customer order sampai ledger payout sudah dibuat di backend.
  - Test `onDemandCourierProof.e2e.test.ts` mengunci flow pickup scan wajib, pickup photo wajib, delivery POD, event customer/kurir, notifikasi customer, dan earning ledger setelah POD.
  - Test `onDemandRealtime.e2e.test.ts` tetap mengunci courier tracking, customer tracking, chat order room, dan offer realtime.
  - Backend test harus gagal kalau event lifecycle utama atau ledger credit hilang.

- [x] **P2 - Observability realtime on-demand** - log/metric untuk socket, push, tracking, chat, dan alert sudah ditambahkan.
  - Metric: socket connected/disconnected by role, join_order_room denied, notification socket, tracking update latency, FCM success/failure/skipped, event emit, chat delivery via on-demand emitter.
  - Alert: tracking update stale saat order aktif dan offer accepted tanpa customer-visible location update.
  - Alert order ditulis ke `order_events` sebagai `realtime_observability_alert`, plus structured log domain `on_demand_realtime`.

- [x] **P3 - Operational runbook on-demand incident** - runbook operasional untuk tracking/push/chat/POD/ledger on-demand sudah dibuat.
  - Dokumen: `docs/on-demand-incident-runbook.md`.
  - Berisi cara cek order room, token FCM, lokasi terakhir, safety event, proof, order event, dan ledger earning.
  - Berisi recovery aman tanpa merusak ledger, rollback rule append-only, escalation matrix, dan checklist sebelum deploy nasional.
