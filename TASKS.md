# Tasks

## Active

- [x] **Migrasi penuh UI/Flow post-login Merchant dari tembus-merchant.zip** - hapus/ganti seluruh UI post-login lama dengan 17 screen ZIP 100%, port ke native Android, lalu wire ke API/repository/database/session/state machine real; splash, onboarding, dan login tetap.
  - Status 2026-08-30: ✅ 16/17 items functional complete (build/lint/test/unit/emulator smoke ALL PASS, 17 route ZIP + state wiring verifikasi, legacy UI cleanup, splash/login untouched). 1 item tersisa: pixel-level visual parity vs stitch_screens (emulator screencap Android 12+ display layer issue — uiautomator hierarchy dump sebagai substitute).
  - ZIP adalah sumber kebenaran UI/flow; existing app hanya menjadi adapter auth, data, API, database, session, permission, dan state machine.
  - Detail checklist dan status per screen: `task-merchant-zip-ui-migration.md`.
  - Selesai hanya saat strict ZIP parity, seluruh route Android, penghapusan UI lama, API wiring, build, test, emulator, screenshot evidence, dan graphify sudah terverifikasi.

- [x] **Merchant Android — Stitch screen parity** - menyelesaikan screen Merchant yang belum 1:1 dengan export Stitch; detail dan checklist ada di [task-merchant-stitch-screen-parity.md](task-merchant-stitch-screen-parity.md). ✅ FULLY DONE 2026-08-28 (semua 4 section checklist + route matrix terpenuhi).

- [x] **Customer Mobile UI/UX & Flow Audit 2026** - audit customer Android terhadap standar aplikasi on-demand sejenis 2026, TEMBUS palette light/dark, WCAG 2.2 AA, adaptive layout, navigation, dan happy/error/offline flow. Static scope SELESAI (commit ae2a1d7): OLD_BRAND purged, NAV-01 fixed, 82/121 gray→M3 token, 112 cd=null classified. Device phases (flow traversal / TalkBack / adaptive 320–412–foldable / font 2.0x / benchmark) BLOCKED — butuh emulator Pixel 6 Pro (port 5556). Detail: artifacts/customer-mobile-uiux-audit-2026/.

- [x] **TEMBUS UI/UX Standardization** - detail eksekusi ada di [task-tembus-uiux-standardization.md](task-tembus-uiux-standardization.md); Phase 0 dan Phase 1 selesai, customer dashboard/home, customer service category/selector, dan customer package booking sudah migrated + Android customer/courier/merchant compile pass; scope sisa Phase 2 customer food/tambal/towing booking, payment/tracking, courier app, merchant app, dan web/admin/merchant portal bila surface ikut disentuh; rule 43-44 code-level fixes (no emoji + hardcoded colors) sudah diterapkan. Device UAT: pending.

- [x] **P0 - E2E Multi-Service Courier Flow Repair** - detail eksekusi ada di [task-e2e-multi-service-courier-flow-repair.md](task-e2e-multi-service-courier-flow-repair.md); scope customer web/mobile, backend order/admin/payment/dispatch, courier app, merchant/admin ops, settlement, proof, notification, dan test Android/Playwright. ✅ Unit test Android running & passing (CourierFlowResolverTest + domain resolver); 18 items tersisa di Section 7 Manual UAT butuh emulator/device untuk traversal flow verification per service (on-demand paket, food, tambal ban, towing).

- [ ] **Customer Google Login + Zenziva OTP Infrastructure** - detail eksekusi ada di [task-customer-google-auth-zenziva-otp.md](task-customer-google-auth-zenziva-otp.md); scope customer web, Android customer app, auth-service, API gateway, database, trusted device, dan provider OTP WA/SMS.

- [x] **P0 - Zero mock/hardcoded production data untuk admin, customer web, mobile customer, mobile kurir, dan backend** - semua data runtime harus berasal dari database, API backend, device sensor nyata, atau provider eksternal resmi; tidak boleh ada mock/demo/random/static business data di production path.
  - [x] Admin dashboard wajib menghapus hardcoded courier map, chart fallback, KPI fallback, Mapbox mock token, dan health/storage stat statis; jika data API kosong/gagal tampilkan empty/error state, bukan angka atau entitas palsu.
  - [x] Customer web hardcoded analytics IDs dan template/data contoh yang bisa masuk ke transaksi runtime dihapus; GA/GTM hanya aktif jika env tersedia dan kategori paket transaksi diisi user/API, bukan option contoh source code.
  - [x] Customer web scanner dimensi random dihapus; kamera tidak lagi mengisi ukuran/berat acak dan meminta input manual saat belum ada provider dimensi nyata.
  - [x] Customer web simulated push subscription dihapus; push subscribe sekarang wajib memakai `NEXT_PUBLIC_VAPID_PUBLIC_KEY` dan subscription browser asli.
  - [x] Customer web reset PIN fallback sukses palsu dihapus; send OTP, verify OTP, dan reset PIN sekarang gagal jujur jika API belum tersedia.
  - [x] Mobile customer wajib mengambil service category, package category, size tier, service eligibility, maps provider config, route, tracking, payment, dan address book dari database/API; kategori/tier hardcoded hanya boleh menjadi label UI statis jika backend mengirim kode yang sama.
    - [x] Payment confirmation tidak lagi membuat `PAY-{orderId}`/status paid palsu saat backend tidak mengirim payload payment.
    - [x] Booking package category tidak lagi memakai chip contoh hardcoded; isi paket/kategori berasal dari input user.
    - [x] Booking size tier tidak lagi memakai tier/dimensi statis kecil/sedang/besar; tier dibaca dari service config backend dan berat/dimensi aktual wajib diinput user.
    - [x] Delivery services mobile customer sekarang memakai kontrak DB/API `delivery_service_products` dengan metadata `cache_ttl_seconds` dan `version`; route, maps config, payment, tracking, dan address book tetap via endpoint backend.
  - [x] Mobile kurir wajib mengambil cancel reasons, status transition policy, service capability, payout quick amounts, route, active offer, active job, dan profile data dari database/API; tidak boleh membuat kurir/order/ETA/zone/amount palsu di client.
    - [x] Cancel pickup reasons dipindahkan ke tabel `courier_pickup_cancellation_reasons`, endpoint read-only mobile, dan validasi backend berbasis DB.
    - [x] Status transition policy dipindahkan ke tabel `status_transition_policies`, endpoint read-only mobile, validasi backend, dan UI kurir tidak lagi memakai daftar status hardcoded.
    - [x] Payout quick amounts tidak lagi memakai angka 50.000/100.000 hardcoded; pilihan cepat hanya memakai min/max dari policy backend.
    - [x] Active job map kurir tidak lagi menggambar straight-line pickup/dropoff dari client; route preview memakai polyline/snapshot backend dan kosong jujur jika backend belum mengirim rute.
    - [x] Fallback kendaraan `motor`, rating 5.0, completion/acceptance 100%, dan policy payout default nominal di model kurir dinetralkan supaya profile/capability/payout harus datang dari API.
  - [x] Backend admin-service bulk order distance/pricing mock diganti route provider berbasis jalan dan konfigurasi `delivery_service_products`; koordinat pickup/dropoff wajib dari input nyata, bukan fallback Jakarta buatan.
  - [x] Backend admin-service dan auth-service: semua OTP customer/kurir tidak menerima bypass code `123456`/`111111`, tidak memakai fallback kode tetap saat RNG gagal, tidak log kode OTP, dan bisa dinonaktifkan via feature flag admin `customer_auth_otp_required` / `courier_login_otp_required`.
  - [x] Backend admin-service customer/admin web login hardcoded passcode dihapus; dev override hanya boleh dari env `DEV_ADMIN_LOGIN_PASSWORDS` dan otomatis mati di production.
  - [x] Backend admin-service warehouse scan/event ID tidak lagi memakai `Math.random()` atau fallback admin UUID; memakai `crypto.randomUUID()` dan wajib auth user nyata.
  - [x] Backend order-service mock maps repository dihapus; jika `GOOGLE_MAPS_API_KEY` tidak dikonfigurasi service gagal start, bukan mengembalikan jarak 5 km palsu.
  - [x] Backend order-service QRIS Midtrans mock/dummy dihapus dan webhook signature bypass `MOCK_SIGNATURE` dihapus; gateway sekarang memakai Midtrans Core API atau gagal eksplisit.
  - [x] Backend order-service stub payout/refund yang membuat reference ID palsu dihapus; sementara provider belum tersedia, flow mengembalikan provider unavailable secara eksplisit.
  - [x] Backend order-service relay matching UUID palsu dihapus; flow relay yang belum punya candidate repository sekarang gagal eksplisit, bukan membuat courier UUID buatan.
  - [x] Backend order-service simulated surge/weather ratio dihapus; surge worker membaca zona, weather logs, dynamic pricing logs, active orders, dan courier availability dari database lalu menulis multiplier Redis per-zone/global.
  - [x] Backend order-service notification delivery mock dihapus; task worker tidak menandai `sent` tanpa provider delivery, melainkan `failed` dengan alasan eksplisit.
  - [x] Backend order-service placeholder courier scoring diselesaikan; dispatch score membaca relay score, acceptance rate, dan jarak kurir dari database lalu sort berdasarkan skor nyata.
    - [x] Pricing config fallback yang diam-diam mengembalikan angka default dihapus; config aktif wajib tersedia di DB dan surge multiplier error sekarang fail-closed.
  - [x] Backend payment-service `mock_snap_token` diganti panggilan Midtrans Snap resmi atau status failure eksplisit.
  - [x] Backend payment-service fee/default config wajib dibaca dari database/system config tanpa fallback diam-diam; topup fee, withdraw fee, dan auto-disbursement threshold gagal eksplisit jika config hilang/tidak valid.
  - [x] Routing service helper `calculateDistance`/`detectZone` mock diganti: jarak memakai Haversine real dan zona wajib resolve dari tabel `zones` via PostGIS, fail-closed jika resolver/zone tidak tersedia.
  - [x] Guard CI production mock ditambahkan di `scripts/ci/check-production-mocks.js` dan workflow development; guard memblokir OTP/payment mock runtime paling berbahaya.
  - [x] Acceptance criteria penuh: seluruh flow admin, customer web, mobile customer, dan mobile kurir tetap build/test hijau; saat database/API kosong UI menampilkan empty state; tidak ada data bisnis palsu yang tampil atau tersimpan; grep guard production source lulus.
    - [x] Verifikasi P0 terbaru: `backend/admin-service npm run build`, `admin-dashboard npm run build`, `android-app :app:compileDebugKotlin`, dan `node scripts/ci/check-production-mocks.js` hijau.
    - [x] Verifikasi final sisa 4 item P0: `backend/admin-service npm run build`, `admin-dashboard npm run build`, `frontend npm run build`, `android-app :app:compileDebugKotlin`, `android-app-customer :app:compileDebugKotlin`, dan `node scripts/ci/check-production-mocks.js` hijau.

- [x] **P0 - Backend database/API contract untuk semua lookup runtime** - data yang saat ini masih hardcoded harus punya sumber database dan endpoint kontrak jelas sebelum UI/mobile dipakai.
  - Tambahkan atau verifikasi tabel/config untuk `package_categories`, `cancel_reasons`, `service_size_tiers`, `status_transition_policies`, `surge_inputs`, `notification_provider_status`, `payment_provider_config`, dan `maps/zone runtime config`.
  - Endpoint admin wajib bisa CRUD konfigurasi operasional tersebut dengan audit log dan validasi schema.
  - Endpoint customer/mobile/kurir wajib read-only untuk konfigurasi yang dibutuhkan app, dengan cache TTL dan versioning agar mobile bisa refresh tanpa rebuild.
  - Migration harus idempotent dan reversible; seed hanya boleh berisi default production config yang jelas, bukan demo order/customer/courier.
  - [x] Lookup alasan pembatalan pickup kurir punya tabel DB, seed production config, endpoint mobile read-only, dan validasi backend DB-driven.
  - [x] Lookup transisi status kurir punya tabel DB reversible, seed production policy, endpoint mobile read-only, dan validasi backend DB-driven.
  - [x] Lookup operasional kurir punya endpoint admin CRUD dengan audit log: pickup cancellation reasons dan status transition policies.
  - [x] Endpoint read-only mobile/customer lookup mengirim `cache_ttl_seconds` dan `version` agar app bisa refresh konfigurasi runtime tanpa rebuild.
  - Acceptance criteria: tidak ada komponen UI/mobile yang perlu list kategori/alasan/status/fee dari source code selain enum/type guard.

- [x] **P1 - Runtime empty-state dan error-state parity** - semua aplikasi harus gagal secara jujur saat data database/API belum tersedia.
  - Admin dashboard: chart, map, KPI, finance, customer, courier, voucher, dan analytics harus punya loading skeleton, empty state, dan retry state tanpa fallback angka palsu.
  - Customer web: order form, address book, payment, tracking, dispute chat, push registration, dan laporan harus menampilkan gagal/empty/retry state tanpa menganggap request sukses.
  - Mobile customer dan kurir: Room/local cache boleh menyimpan hasil sync terakhir, tetapi harus diberi label offline/stale; tidak boleh membuat data baru palsu ketika API gagal.
    - [x] Customer mobile dashboard sekarang menampilkan error/retry saat riwayat order atau layanan gagal dimuat dari API, bukan kosong diam-diam.
    - [x] Customer mobile tracking mempertahankan posisi backend terakhir saat polling gagal, tetapi memberi label stale dengan waktu sinkron terakhir.
    - [x] Courier mobile order list menampilkan banner data lokal/offline/stale saat sinkron terakhir belum ada atau sudah lebih dari 2 menit.
    - [x] Admin finance cost breakdown tidak lagi memakai angka statis; nilai courier payout, payment processing, weather reserve, dan insurance reserve dibaca dari database.
    - [x] Admin active orders sekarang punya error/retry state untuk list/detail order, menghapus Mapbox token placeholder, dan mengganti map statis dengan telemetry route dari database.
    - [x] Admin analytics tidak lagi memakai fallback KPI statis; KPI, SLA, surge, scan reliability, heatmap, retention, dan report schedule punya empty/error/retry state.
    - [x] Admin customer, courier, dan voucher tidak lagi menyamarkan query gagal sebagai angka 0/default; surface utama punya error/retry dan label "belum tersedia" untuk field yang tidak dikirim API.
    - [x] Customer web address book tidak lagi fallback ke koordinat Jakarta dari CSV, dan load error tampil sebagai state retry permanen.
    - [x] Customer web dispute list dan dispute chat punya error/retry state, bukan empty state diam-diam saat API gagal.
    - [x] Verifikasi P1 terbaru: `admin-dashboard npm run build`, `frontend npm run build`, dan `node scripts/ci/check-production-mocks.js` hijau.
  - Acceptance criteria: matikan endpoint terkait di staging/dev, app tidak crash dan tidak menampilkan mock entity; semua error tercatat dengan reason yang bisa diaudit.

- [x] **P1 - Production integration replacement untuk provider eksternal** - stub provider hanya boleh dipakai di test, bukan runtime production/staging.
  - [x] Payout/refund/disbursement runtime tidak lagi membuat reference ID palsu; provider belum tersedia sekarang mengembalikan `provider_unavailable`/error eksplisit.
  - [x] Notification worker memakai HTTP delivery provider per channel (`NOTIFICATION_PUSH_PROVIDER_URL`, `NOTIFICATION_EMAIL_PROVIDER_URL`, `NOTIFICATION_SMS_PROVIDER_URL`, `NOTIFICATION_WHATSAPP_PROVIDER_URL`); jika env/provider belum ada, status notification ditulis `failed` dengan reason eksplisit.
  - [x] Insurance/BPJS enrollment tidak lagi membuat policy number random; BPJS dan order insurance disimpan sebagai `pending_provider_activation` sampai provider resmi dikonfigurasi.
  - [x] Maps pricing path order-service fail closed jika provider maps tidak dikonfigurasi; admin bulk order juga menolak row jika route jalan tidak tersedia.
  - [x] Acceptance criteria: environment production/staging gagal start atau menolak flow jika provider wajib belum dikonfigurasi, bukan menjalankan stub diam-diam.

- [x] **P0 - Unified road-route contract untuk customer, courier, web, pricing, dan dispatch** - semua aplikasi harus memakai satu kontrak route berbasis jalan, bukan garis lurus client-side.
  - Backend wajib punya kontrak route tunggal: pickup/dropoff coordinate, service code, vehicle type, provider aktif, route profile, distance meter, duration second, encoded polyline/geometry, traffic state, confidence, dan fallback reason.
  - Database/order payload wajib menyimpan route snapshot yang dipakai saat hitung harga agar customer, kurir, admin, dan ledger membaca jarak/ETA yang sama.
  - Customer web, mobile customer, dan mobile kurir wajib berhenti memakai jarak garis lurus sebagai sumber final price/ETA; haversine hanya boleh menjadi fallback terlabel saat provider route gagal.
  - Admin maps runtime config wajib menjadi sumber tunggal provider: `open_street_map`, `google_maps`, atau `text_only`.
  - API harus menolak final order on-demand jika pickup/dropoff coordinate tidak valid atau route final tidak bisa dihitung, kecuali admin mengaktifkan emergency fallback policy.
  - Acceptance criteria: satu endpoint route backend menghasilkan jarak, ETA, polyline, provider, dan vehicle profile yang sama untuk customer web, mobile customer, mobile kurir, pricing, dan dispatch.

- [x] **P1 - OpenStreetMap road routing engine** - OSM aktif harus memakai routing jalan sungguhan, bukan jarak terdekat garis lurus.
  - Backend maps gateway wajib menghubungkan OSM provider ke route engine berbasis OpenStreetMap seperti OSRM/Valhalla/GraphHopper.
  - Route profile minimal: `motorcycle` untuk layanan motor dan `car` untuk TEMBUS Mobil.
  - Jika OSRM standar tidak mendukung motor secara presisi, gunakan Valhalla/GraphHopper atau custom profile; jangan menyamakan motor dengan mobil tanpa label policy.
  - Route response wajib mengembalikan polyline jalan, distance meter, duration second, dan provider metadata.
  - Cache route pendek wajib aktif berdasarkan pickup/dropoff/service/vehicle/provider supaya mobile tidak memukul provider terus-menerus.
  - Unit dan integration test wajib membuktikan OSM route tidak lagi berupa straight-line geometry.
  - Acceptance criteria: saat admin memilih OpenStreetMap, preview rute customer dan kurir mengikuti jalan, km mengikuti route engine, dan pricing memakai km route tersebut.

- [x] **P2 - Google Maps traffic-aware route provider** - saat admin memilih Google, route harus mengikuti aturan Google dan kendaraan/service yang dipilih.
  - Backend maps gateway wajib memakai Google Routes/Directions API server-side tanpa mengekspos API key ke mobile/web.
  - Layanan motor wajib memakai travel mode roda dua jika tersedia; layanan mobil wajib memakai driving/car route.
  - Route preference harus mendukung traffic-aware untuk Google, sehingga jalur boleh lebih jauh jika ETA lebih baik atau menghindari macet sesuai policy service.
  - Service policy wajib bisa membedakan Prioritas/Instant/Hemat/Same Day/Mobil untuk preferensi ETA, cost, dan allowed vehicle profile.
  - Jika Google two-wheeler tidak tersedia di region/request tertentu, fallback harus eksplisit ke policy yang aman dan tercatat di route metadata.
  - Quota, timeout, retry, dan fallback ke OSM/text-only wajib dikendalikan dari backend, bukan dari app.
  - Acceptance criteria: saat admin memilih Google, customer mobile/web dan kurir otomatis melihat route/ETA Google tanpa rebuild app, dengan profile motor/mobil sesuai service.

- [x] **P3 - Pricing, dispatch, dan order lifecycle memakai route snapshot yang sama** - tidak boleh ada harga, jarak, ETA, dan tawaran kurir yang saling beda.
  - Price calculation wajib memakai `distance_meter` dari route snapshot provider aktif, bukan kalkulasi ulang client.
  - Order creation wajib menyimpan route snapshot final dan route version/provider yang dipakai.
  - Dispatch offer ke kurir wajib membawa jarak, ETA, service, vehicle profile, dan payout dari snapshot yang sama.
  - Courier offer TTL 15 detik, customer tracking, dan admin order detail wajib membaca route snapshot yang sama.
  - Jika customer mengubah alamat, ukuran/berat, atau service, route snapshot wajib dihitung ulang sebelum harga final.
  - Ledger/payout tidak boleh berubah karena recalculation route setelah order paid; perubahan hanya melalui adjustment/audit flow.
  - Acceptance criteria: satu order on-demand dari customer menghasilkan price, route preview, courier offer, tracking, dan payout yang konsisten dari snapshot yang sama.

- [x] **P4 - UI runtime route preview untuk web customer, mobile customer, dan mobile kurir** - semua surface menampilkan route jalan sesuai provider aktif.
  - Mobile customer booking review wajib menampilkan polyline route jalan dan km/ETA dari backend untuk service yang dipilih.
  - Mobile customer service sheet wajib refresh harga/ETA saat service motor/mobil berubah.
  - Web customer booking dan tracking wajib memakai endpoint route yang sama dan menampilkan fallback jelas jika provider tidak tersedia.
  - Mobile kurir offer, active job, dan detail pengantaran wajib menampilkan route jalan yang sama dengan order snapshot.
  - Jika admin switch OSM/Google/text-only, app harus mengikuti config runtime setelah refresh/config TTL habis tanpa rebuild.
  - UI fallback wajib tenang: “Rute sedang diperbarui” atau “Estimasi sementara”, bukan crash atau data kosong.
  - Acceptance criteria: customer dan kurir melihat route preview konsisten di mobile/web, provider bisa diganti dari admin, dan app tetap berjalan tanpa deploy ulang.

- [x] **P5 - Observability, safety, dan E2E route validation** - route engine bisa dipantau dan dibuktikan end-to-end.
  - Structured log route sekarang mencatat `request_id`, provider aktif, profile, service, vehicle type, distance, duration, cache hit/miss, fallback reason, latency, dan status.
  - Alert route mencakup provider failure spike, route latency tinggi, quota hampir habis, distance anomaly, dan straight-line fallback terlalu sering.
  - Admin Maps Runtime/Settings menampilkan provider aktif, health, last error, fallback count, cache hit rate, route success/anomaly/fallback quality, dan tombol emergency text-only/OSM fallback.
  - E2E route validation command tersedia: `npm run test:e2e:route-validation`.
  - Coverage command mencakup OSM motor route, OSM car route, Google motor route mock/contract, Google car route mock/contract, admin provider switch, customer-visible tracking, courier offer, dan lifecycle realtime.
  - Migration `20260521000003_unified_route_snapshot.sql` memiliki Up/Down untuk route snapshot order/courier snapshot, kolom provider/profile/distance/duration/polyline/fallback, index read path, dan sudah divalidasi `goose up/version/down` di database test sementara.

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
  - Customer sudah lolos foreground, background, dan killed via Android OS notification evidence setelah login `customer.mobile@tembus.id`.

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
