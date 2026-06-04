# TASK: Google Maps Demo API Key Enablement Plan

Tanggal: 2026-06-03
Area: Admin Maps Runtime, Backend Maps Gateway, Mobile Customer, Mobile Courier
Status: P0 code wiring selesai untuk mobile/customer web/admin; Google native tile dan staging route masih blocked oleh billing/key restriction/staging env deploy
Tujuan: membuat Google Maps demo berjalan untuk staging/demo tanpa melanggar standar keamanan API key, dan menyiapkan jalur production-grade setelah demo.

## Prinsip Keamanan dan Standar Industri

- API key demo dianggap sudah exposed karena terlihat di UI/screenshot/chat. Key ini hanya boleh dipakai untuk demo terbatas, bukan production.
- Jangan commit API key ke Git, APK source, markdown task, log, issue, atau screenshot publik.
- Jangan memakai satu API key untuk semua platform. Google merekomendasikan key terpisah per app/platform agar restriction, quota, audit, dan rotasi bisa dikontrol.
- Native Android Maps SDK membutuhkan API key Android yang terpasang di APK dan dibatasi dengan package name + SHA-1 certificate fingerprint.
- Server-side route/geocode/ETA wajib memakai key server-side yang tidak dikirim ke mobile/web.
- Web/admin wajib memakai key web/referrer-restricted jika memakai Maps JavaScript API langsung.
- Provider runtime dari admin boleh switch Google/OpenStreetMap/text-only tanpa rebuild app, tetapi perubahan native Android API key tetap membutuhkan build APK baru.
- Untuk backend, target jangka panjang adalah secret/config runtime terenkripsi yang bisa divalidasi dan diaktifkan tanpa restart service. Env startup tetap boleh dipakai untuk bootstrap/fallback.

Referensi:

- Google Maps Platform security guidance: https://developers.google.com/maps/api-security-best-practices
- Maps SDK for Android setup/API key: https://developers.google.com/maps/documentation/android-sdk/get-api-key
- Google Cloud Secret Manager best practices: https://docs.cloud.google.com/secret-manager/docs/best-practices
- Google Cloud Secret rotation recommendations: https://docs.cloud.google.com/secret-manager/docs/rotation-recommendations

## Keputusan Arsitektur

### Yang diterima

- Gunakan API key demo hanya untuk membuktikan flow staging/demo.
- Untuk demo Android, key harus di-authorize ke package dan SHA-1 debug/release yang dipakai APK.
- Untuk demo backend route/geocode, pakai key server-side terpisah atau key demo sementara dengan quota ketat dan API restrictions yang sesuai.
- Admin boleh menyediakan form "Maps Credential Test" untuk menguji key sebelum aktif.
- Backend boleh membaca key aktif dari encrypted runtime config agar tidak perlu restart saat key server diganti.

### Yang ditolak

- Menaruh API key server di mobile app.
- Mengirim API key Google dari admin/backend ke mobile app untuk dipakai native GoogleMap runtime.
- Memakai satu unrestricted key untuk Android, web, dan server secara production.
- Menganggap demo key aman hanya karena disebut demo.
- Mengaktifkan Google provider saat test key gagal, karena itu akan menghasilkan blank map/fallback yang membingungkan.

## P0 - Demo Google Maps Bisa Jalan Aman

### [x] MAPS-DEMO-001: Inventaris package, SHA-1, dan surface yang memakai Google Maps

Target:

- Catat package mobile courier: `com.tembus.courier`.
- Catat package mobile customer: `com.tembus.customer`.
- Ambil SHA-1 debug dari `./gradlew signingReport` untuk courier dan customer.
- Ambil SHA-1 release/staging signing key jika APK staging memakai signing berbeda.
- Catat surface yang butuh native Google Maps: courier home/detail, customer booking/tracking.
- Catat surface yang memakai server route/geocode: pricing, route preview, ETA, dispatch, tracking.

Acceptance criteria:

- Dokumen internal berisi package + SHA-1 debug/release untuk kedua app.
- Tidak ada API key yang ditulis di dokumen.
- Logcat blank map bisa dipetakan ke package/SHA-1 yang harus di-authorize.

Verification:

- `cd android-app && .\gradlew.bat :app:signingReport`
- `cd android-app-customer && .\gradlew.bat :app:signingReport`
- `adb logcat` tidak lagi menampilkan `Google Maps Android API Authorization failure` setelah key benar.

Status 2026-06-03:

- Selesai untuk debug/local evidence.
- Evidence dicatat di `docs/google-maps-demo-readiness.md`.
- Debug SHA-1 courier/customer: `8C:D0:8A:46:B2:A1:8C:DC:9A:E1:67:2D:A8:C6:A8:22:F6:25:46:33`.
- Release/staging signing belum tersedia di Gradle lokal (`release Config: null`), sehingga SHA-1 release wajib diambil dari signing key staging/release yang benar.

### [ ] MAPS-DEMO-002: Konfigurasi API key demo Android untuk courier/customer

Target:

- Aktifkan Maps SDK for Android di Google Cloud project demo.
- Restrict key Android ke Android apps.
- Tambahkan package + SHA-1 untuk:
  - `com.tembus.courier`
  - `com.tembus.customer`
- API restrictions minimal: Maps SDK for Android.
- Jika key demo Google-hosted tidak bisa diedit/restrict sesuai standar, buat key staging baru di project yang sama dan jangan pakai demo-hosted key untuk app.

Acceptance criteria:

- GoogleMap native render tile, marker, dan attribution tanpa blank beige map.
- Key Android tidak bisa dipakai dari server/web.
- Billing/quota demo dikunci sesuai kebutuhan demo.

Verification:

- Install APK debug/staging yang sudah membawa key Android valid.
- Buka courier map dan customer tracking.
- Logcat bersih dari `Authorization failure`.
- Admin runtime scope `courier_mobile` dan `customer_mobile` tetap `google_maps`.

Status 2026-06-03:

- Belum selesai.
- Current courier screen masih blank/neutral tile dengan Google attribution.
- `gcloud services api-keys lookup` gagal `PERMISSION_DENIED` karena akun aktif tidak memiliki permission `apikeys.keys.lookup`.
- Google Cloud owner perlu authorize package/SHA-1 Android atau memberi IAM permission yang diperlukan.

Status 2026-06-04:

- API `maps-android-backend.googleapis.com`, `routes.googleapis.com`, dan `geocoding-backend.googleapis.com` berhasil di-enable di project gcloud aktif.
- Courier debug APK clean install, login seed staging, dan home map berhasil divalidasi di emulator.
- Native GoogleMap masih tidak render tile jalan setelah lebih dari 30 detik; tidak ada crash dan tidak ada `Authorization failure` di logcat.
- Direct Geocoding masih `REQUEST_DENIED` karena billing Google Cloud belum aktif.
- Karena acceptance criteria menuntut Google tile render, item ini tetap belum selesai sampai billing/key restriction Android benar-benar sehat.

### [ ] MAPS-DEMO-003: Konfigurasi server-side Google key untuk route/geocode/ETA

Target:

- Jangan gunakan Android-restricted key untuk backend.
- Buat/pakai key server-side terpisah untuk staging/demo.
- Enable API yang benar sesuai backend:
  - Routes API jika memakai endpoint Routes.
  - Directions API jika legacy fallback masih aktif.
  - Geocoding API untuk address search/reverse geocode.
- Restrict key dengan IP address backend/NAT staging jika memungkinkan.
- API restrictions hanya untuk API server-side yang dipakai.
- Set quota harian demo dan alert billing/quota.

Acceptance criteria:

- Endpoint route tidak lagi return `REQUEST_DENIED`.
- Route response punya provider Google, distance/duration valid, dan polyline jika provider mendukung.
- Key server tidak pernah dikirim ke mobile/web.

Verification:

- `GET /api/v1/maps/route?scope=courier_mobile&from_lat=...&from_lng=...&to_lat=...&to_lng=...&vehicle_type=motorcycle`
- Expected: `requested_provider=google_maps`, `active_provider=google_maps`, `provider=google_maps` atau nama provider Google resmi, `has_polyline=true`, tanpa `fallback_reason=REQUEST_DENIED`.
- Admin Maps Runtime tidak lagi menampilkan issue Google authorization.

Status 2026-06-03:

- Belum selesai untuk staging public API.
- Direct Google Routes API test dengan demo key berhasil untuk `TWO_WHEELER` dan `DRIVE`, termasuk encoded polyline.
- Direct Geocoding API gagal `REQUEST_DENIED` karena billing belum aktif.
- Direct legacy Directions API gagal `REQUEST_DENIED` karena legacy API belum enabled.
- Staging public route endpoint masih `provider=google_maps_fallback_haversine`, `fallback_reason=REQUEST_DENIED`, `has_polyline=false`.
- Admin-service local tests untuk `mapsProviderConfig.test.ts` dan `npm run build` berhasil, jadi blocker kemungkinan berada di Google Cloud/staging env/deploy, bukan local source path Routes API.

Status 2026-06-04:

- Staging public route endpoint masih `provider=google_maps_fallback_haversine`, `fallback_reason=REQUEST_DENIED`, `has_polyline=false`.
- Direct Geocoding tetap menolak request karena billing belum aktif.
- P0 backend belum bisa ditandai selesai sampai staging memakai server-side key yang valid, billing aktif, dan route endpoint mengembalikan polyline Google tanpa fallback.

### [ ] MAPS-DEMO-004: Build demo APK sekali dengan Android key valid

Target:

- Karena native Google Maps SDK membaca key dari manifest APK, courier/customer perlu build ulang sekali setelah key Android valid tersedia.
- Key tetap disuplai via env/CI secret/local `.env`, bukan source code.
- Pastikan APK yang dites memakai signing certificate yang sama dengan SHA-1 di Google Cloud.

Acceptance criteria:

- Courier APK dan Customer APK render Google Maps.
- Blank map hilang.
- Tidak ada hardcoded key di source.

Verification:

- `cd android-app && .\gradlew.bat :app:assembleDebug`
- `cd android-app-customer && .\gradlew.bat :app:assembleDebug`
- Install ke emulator/device.
- Visual QA courier/customer map.
- `rg -n "AIza" android-app android-app-customer backend admin-dashboard frontend` tidak menemukan key mentah.

Status 2026-06-03:

- Partial.
- Courier debug APK build sukses.
- Customer debug APK build sukses.
- Generated manifest courier/customer sudah berisi Google Maps metadata dari env.
- Customer APK install sukses.
- Courier APK update gagal karena package yang sudah terpasang memakai signature berbeda: `INSTALL_FAILED_UPDATE_INCOMPATIBLE`.
- Source scan menemukan hanya fixture palsu di `backend/admin-service/src/security/logRedaction.test.ts`; tidak ada key nyata di source/docs.

Status 2026-06-04:

- Courier debug clean install berhasil setelah uninstall package lama yang signed berbeda.
- Login staging memakai akun seed on-demand berhasil tanpa OTP.
- Build serial `.\gradlew.bat :app:assembleDebug --no-daemon` berhasil.
- Unit test serial `.\gradlew.bat :app:testDebugUnitTest --no-daemon` berhasil.
- Customer build serial `.\gradlew.bat :app:assembleDebug --no-daemon` berhasil.
- Customer unit test serial `.\gradlew.bat :app:testDebugUnitTest --no-daemon` berhasil.
- Gradle mobile debug sekarang membaca key spesifik app terlebih dahulu, lalu fallback ke `GOOGLE_MAPS_ANDROID_API_KEY` / `GOOGLE_MAPS_API_KEY` untuk kompatibilitas demo. Release build wajib memakai key spesifik courier/customer.
- Warning Gradle deprecation tidak berbahaya untuk P0, tetapi perlu masuk maintenance sebelum migrasi Gradle 9.
- Build paralel sempat gagal `StreamCorruptedException: unexpected EOF in middle of data block` saat dua Gradle task berjalan bersamaan; retry serial sukses, jadi ini bukan regression kode.

### [x] MAPS-DEMO-005: Mobile map tidak boleh blank saat Google native belum siap

Target:

- Jika runtime provider memilih Google Maps tetapi native GoogleMap tidak pernah `onMapLoaded`, app harus degrade gracefully.
- Fallback visual memakai OpenStreetMap renderer yang sudah ada, bukan layar beige blank.
- Fix renderer OSM agar tile memenuhi layar pada density Android normal.

Acceptance criteria:

- Courier home tidak lagi blank saat Google native gagal load.
- UI tetap menampilkan map, marker, status duty, dan bottom sheet idle.
- Tidak ada crash dan tidak ada secret/key di log.

Verification:

- `cd android-app && .\gradlew.bat :app:assembleDebug --no-daemon`
- `cd android-app && .\gradlew.bat :app:testDebugUnitTest --no-daemon`
- Install APK debug ke emulator, login seed courier, tunggu Google timeout.
- Screenshot evidence: `android-app/build/google-maps-p0-qa/courier-debug-fallback-watchdog-fixed.png`.

Status 2026-06-04:

- Selesai.
- `RuntimeMapRenderer` sekarang memakai watchdog `onMapLoaded` untuk Google Maps dan fallback ke OpenStreetMap jika Google tidak siap.
- Kalkulasi tile OSM diperbaiki dari campuran pixel/dp sehingga map penuh layar.

### [x] MAPS-DEMO-006: Customer web dan admin memakai Google Maps runtime saat provider Google aktif

Target:

- `/api/v1/maps/config` mengirim metadata Google browser runtime tanpa mengirim server key.
- Customer web address mini-map render Google Maps JavaScript API saat `active_provider=google_maps` dan browser key tersedia.
- Admin LiveMap, Zone viewer, dan Demand Density memakai Google Maps JavaScript API saat runtime Google siap.
- OpenStreetMap hanya fallback saat browser key/billing/referrer belum siap atau saat fitur edit zona memakai editor Leaflet lama.

Acceptance criteria:

- Customer web tidak lagi menampilkan copy "Google Maps server-side" sebagai pengganti map visual.
- Admin dashboard tidak tetap hardcoded OSM untuk surface utama saat provider Google siap.
- Browser key berasal dari env public-restricted (`GOOGLE_MAPS_BROWSER_API_KEY`), bukan `GOOGLE_MAPS_API_KEY` server.
- Tidak ada API key mentah di source, docs, atau task.

Verification:

- `cd backend/admin-service && npm run build`
- `cd backend/admin-service && npm test -- src/services/mapsProviderConfig.test.ts`
- `cd frontend && NEXT_PUBLIC_API_URL=https://api.bawain.my.id/api/v1 NEXT_PUBLIC_WS_URL=https://api.bawain.my.id NEXT_PUBLIC_SOCKET_URL=https://api.bawain.my.id npm run build`
- `cd admin-dashboard && VITE_API_URL=https://api.bawain.my.id/api/v1 VITE_WS_URL=https://api.bawain.my.id VITE_SOCKET_URL=https://api.bawain.my.id npm run build`
- `rg -n "AIza[0-9A-Za-z_-]{20,}" .env.example .env.production.example android-app android-app-customer frontend admin-dashboard backend docs task.md -S`

Status 2026-06-04:

- Selesai di source code.
- Local `.env` sudah memiliki alias server/browser dari demo key tanpa mencetak secret ke log. Untuk release mobile, key Android harus dipisah menjadi `GOOGLE_MAPS_ANDROID_COURIER_API_KEY` dan `GOOGLE_MAPS_ANDROID_CUSTOMER_API_KEY`.
- Staging masih perlu deploy env baru dan rebuild service/web container agar response `/maps/config` membawa `google_maps.browser_api_key`.
- Production tetap wajib memisahkan key Android, browser, dan server dengan restriction masing-masing.

## P1 - Runtime Credential Admin Tanpa Restart Backend

Status 2026-06-04:

- Selesai di source code.
- Admin sekarang punya flow secure credential untuk server-side Google Maps key: test, simpan terenkripsi, activate, deactivate, dan rollback ke previous valid.
- Backend maps provider membaca active runtime credential dengan cache TTL pendek dan invalidasi saat activate/deactivate, jadi ganti server key tidak butuh rebuild image atau restart backend.
- Secret tidak dikirim balik ke admin setelah disimpan; UI hanya menampilkan masked key, status validasi, alias, dan fingerprint pendek.
- Production/staging wajib mengisi `MAPS_CREDENTIAL_ENCRYPTION_KEY` sebelum deploy. Tanpa env ini, production admin-service sengaja gagal start agar credential tidak tersimpan dengan encryption key fallback.

Verification 2026-06-04:

- `npm test -- src/services/mapsRuntimeCredentials.test.ts src/services/mapsProviderConfig.test.ts src/security/logRedaction.test.ts` -> 34 passed.
- `npm run build` di `backend/admin-service` -> passed.
- `VITE_API_URL=https://admin.bawain.my.id/api/v1 VITE_SOCKET_URL=https://admin.bawain.my.id npm run build` di `admin-dashboard` -> passed.
- `rg "AIza[0-9A-Za-z_-]{20,}"` di repo -> no matches.

### [x] MAPS-RUNTIME-001: Tambahkan encrypted maps credential store

Target:

- Tambahkan tabel/config untuk menyimpan key server-side Google secara terenkripsi.
- Jangan simpan plaintext di database.
- Gunakan envelope encryption/KMS/Secret Manager jika tersedia.
- Simpan metadata non-secret: provider, scope, key alias, enabled APIs, restriction type, created_by, created_at, last_validated_at, last_validation_status, last_error_code.

Acceptance criteria:

- Admin tidak pernah menerima kembali plaintext key setelah disimpan.
- Audit log mencatat create/update/activate/deactivate tanpa membocorkan key.
- Role admin dibatasi: hanya super admin/ops security yang bisa mengubah credential.

Verification:

- Migration up/down.
- Unit test encryption/decryption.
- API response admin mem-mask key.

### [x] MAPS-RUNTIME-002: Buat flow "Test Key Before Activate"

Target:

- Admin input key server-side.
- Backend menjalankan test sebelum activation:
  - Geocode sample Jakarta.
  - Route sample pickup ke dropoff.
  - Optional reverse geocode.
  - Validasi status Google: OK vs REQUEST_DENIED / OVER_QUERY_LIMIT / billing disabled.
- Key baru hanya bisa aktif jika semua test wajib lolos.
- Jika gagal, simpan status gagal tanpa mengaktifkan provider.

Acceptance criteria:

- Tidak ada switch ke Google provider jika credential gagal.
- Error admin jelas: API disabled, billing, restriction, quota, atau request denied.
- Test tidak menulis key ke log.

Verification:

- Test dengan key valid.
- Test dengan key invalid.
- Test dengan key Android-restricted dipakai sebagai server key harus gagal.
- Test dengan quota exceeded harus gagal dan tidak activate.

### [x] MAPS-RUNTIME-003: Buat dynamic server key resolver tanpa restart

Target:

- Backend maps gateway membaca active credential dari secure runtime store dengan cache TTL pendek.
- Cache bisa di-invalidate saat admin activate/deactivate key.
- Env key tetap boleh jadi bootstrap fallback, tetapi bukan satu-satunya sumber.
- Jika runtime key gagal, fallback mengikuti maps runtime policy: OSM atau text-only, bukan crash.

Acceptance criteria:

- Ganti key server dari admin langsung memengaruhi route/geocode setelah cache invalidated.
- Tidak perlu rebuild Docker image.
- Tidak perlu restart backend.
- Rollback ke previous valid key tersedia.

Verification:

- Activate key A, route sukses.
- Activate key B, route memakai key B tanpa restart.
- Disable key B, route kembali ke key A/OSM sesuai policy.
- Observability mencatat key alias, bukan key value.

## P2 - Production-Grade Google Maps Key Model

Status 2026-06-04:

- Selesai di source code.
- Admin Maps Runtime sekarang memiliki endpoint/UI Production Key Model untuk inventory key Android courier, Android customer, web browser, dan server tanpa mengekspos value secret.
- Release build Android courier/customer sekarang wajib memakai key spesifik app. Generic `GOOGLE_MAPS_ANDROID_API_KEY` hanya boleh menjadi fallback debug.
- Production admin-service menolak env `GOOGLE_MAPS_ANDROID_API_KEY` generic agar key lama tidak terbawa ke runtime production.
- Runbook rotasi, revocation, quota, dan incident response tersedia di `docs/google-maps-production-key-runbook.md`.

Verification 2026-06-04:

- `npm test -- src/services/mapsProductionReadiness.test.ts src/services/mapsRuntimeCredentials.test.ts src/services/mapsProviderConfig.test.ts src/security/logRedaction.test.ts` -> 38 passed.
- `npm run build` di `backend/admin-service` -> passed.
- `VITE_API_URL=https://admin.bawain.my.id/api/v1 VITE_SOCKET_URL=https://admin.bawain.my.id npm run build` di `admin-dashboard` -> passed.
- `.\gradlew.bat :app:assembleDebug --no-daemon` di `android-app` -> passed.
- `.\gradlew.bat :app:assembleDebug --no-daemon` di `android-app-customer` -> passed.

### [x] MAPS-PROD-001: Pisahkan key per platform dan environment

Target:

- `tembus-staging-android-courier-maps-key`
- `tembus-staging-android-customer-maps-key`
- `tembus-staging-server-maps-key`
- `tembus-staging-web-maps-key`
- Duplikat pattern untuk production.

Acceptance criteria:

- Tidak ada key lintas platform.
- Production dan staging tidak berbagi key.
- Setiap key punya application restrictions dan API restrictions.
- Key lama demo dinonaktifkan setelah demo selesai.

Verification:

- Google Cloud credential inventory.
- Admin readiness endpoint menampilkan status configured tanpa value secret.

### [x] MAPS-PROD-002: Quota, monitoring, alert, dan incident response

Target:

- Tambah quota harian dan per-minute untuk demo/staging.
- Alert untuk:
  - Authorization failure.
  - Request denied.
  - Quota near limit.
  - Provider fallback high.
  - Straight-line fallback high.
  - Route latency high.
- Runbook: jika Google gagal, switch admin ke OSM/text-only dan catat incident.

Acceptance criteria:

- Operator tahu apakah masalahnya key, quota, billing, API disabled, atau provider outage.
- Emergency fallback tidak membutuhkan deploy.
- Tidak ada biaya liar dari unrestricted key.

Verification:

- Simulasi key invalid.
- Simulasi quota exceeded jika memungkinkan di staging.
- Pastikan admin alert berubah sesuai error.

### [x] MAPS-PROD-003: Key rotation dan revocation policy

Target:

- Demo key direvoke setelah demo selesai.
- Production key punya jadwal rotasi.
- Server key bisa rotate via admin/secret manager tanpa downtime.
- Android key rotation direncanakan lewat app release karena key APK tidak terganti sampai user update app.

Acceptance criteria:

- Ada runbook rotasi server key.
- Ada runbook rotasi Android key.
- Ada grace period untuk old key sampai app update tersebar.
- Ada audit trail siapa yang rotate/activate/deactivate.

Verification:

- Dry-run rotation di staging.
- Rollback key berhasil.
- Key lama disabled setelah traffic pindah.

## P3 - UX dan Fallback Saat Maps Bermasalah

### [x] MAPS-UX-001: Blank Google Map tidak boleh dibiarkan tanpa penjelasan

Target:

- App mendeteksi maps provider aktif tetapi tile/render gagal sejauh yang bisa dideteksi.
- Jika GoogleMap blank karena authorization failure tidak bisa dideteksi langsung dari SDK, minimal backend/admin health menurunkan provider ke OSM/text-only atau app menampilkan fallback bila route/provider health critical.

Acceptance criteria:

- Kurir/customer tidak melihat layar beige kosong tanpa konteks operasional.
- Ada copy tenang: `Peta sedang dipulihkan. Alamat dan navigasi tetap tersedia.`
- Tombol fallback `Buka Maps` atau alamat tetap tersedia.

Verification:

- Key invalid di staging.
- App tetap usable untuk order/navigasi text fallback.

Status 2026-06-04:

- Backend `/api/v1/maps/config` sekarang degrade Google ke OpenStreetMap/Text Only saat provider health critical.
- Courier/customer `RuntimeMapRenderer` menampilkan copy `Peta sedang dipulihkan. Alamat dan navigasi tetap tersedia.` saat Google blank/timeout atau runtime fallback.
- Fallback map menyediakan tombol `Buka Maps` berbasis geo URI koordinat, tanpa membuka atau menyimpan API key.
- Courier debug build `.\gradlew.bat :app:assembleDebug --no-daemon` berhasil.
- Customer debug build `.\gradlew.bat :app:assembleDebug --no-daemon` berhasil.

### [x] MAPS-UX-002: Admin Maps Runtime menampilkan readiness yang actionable

Target:

- Admin tidak hanya menampilkan `Critical`, tetapi memberi langkah:
  - Android key unauthorized.
  - Server route key denied.
  - API belum enabled.
  - Billing/quota bermasalah.
  - SHA/package mismatch.
- Jangan tampilkan key value.

Acceptance criteria:

- Operator bisa tahu masalah dan tindakan berikutnya dari dashboard.
- Status per scope: customer mobile, courier mobile, web, server route.

Verification:

- Inject error test.
- Screenshot admin status.

Status 2026-06-04:

- Admin Maps Runtime menampilkan tindakan pada key inventory issue, last provider issue, dan active alert.
- Readiness backend menambahkan diagnosis actionable untuk `REQUEST_DENIED`, API belum enabled, billing, quota, SHA/package mismatch, dan circuit breaker.
- Unit test maps P3 berhasil: `npm test -- src/services/mapsProviderConfig.test.ts src/services/mapsProductionReadiness.test.ts src/services/mapsRuntimeCredentials.test.ts src/security/logRedaction.test.ts`.
- Backend build `npm run build` berhasil.
- Admin dashboard build dengan env staging berhasil.

## Urutan Eksekusi Demo

1. Ambil SHA-1 debug courier/customer.
2. Restrict/authorize Android demo key untuk package + SHA-1.
3. Enable Maps SDK for Android.
4. Siapkan server key terpisah untuk route/geocode.
5. Test route endpoint sampai tidak `REQUEST_DENIED`.
6. Build/install APK demo sekali dengan Android key valid.
7. Switch admin scope ke Google Maps.
8. QA courier/customer map render.
9. QA route/ETA/polyline.
10. Catat demo key sebagai temporary dan jadwalkan revoke/replace.

## Definition of Done

- Courier map Google render tanpa blank.
- Customer map Google render tanpa blank.
- Route endpoint Google tidak `REQUEST_DENIED`.
- Server key tidak berada di mobile APK.
- Android key tidak bisa dipakai server/web.
- Admin bisa melihat provider health dan fallback reason.
- Tidak ada key mentah di Git/source/task docs.
- Demo key punya quota/restriction dan rencana revoke.
- Production plan memakai key terpisah per platform/environment.

## Catatan Risiko

- Jika tetap memakai satu demo key untuk Android + backend + web, itu hanya boleh untuk demo lokal sangat singkat dengan quota ketat, lalu segera revoke. Itu bukan standar industri dan tidak boleh dipromosikan ke staging bersama apalagi production.
- Jika Google-hosted demo key tidak mengizinkan restriction package/SHA-1, maka key tersebut tidak cocok untuk validasi mobile enterprise. Buat staging key resmi yang restricted.
- Jika app yang terinstall masih APK lama tanpa key/restriction benar, admin runtime sudah Google tetapi map tetap blank. Ini expected karena native SDK membutuhkan key valid di APK.
- Jika backend masih hanya membaca `process.env`, perubahan key server butuh restart service. Runtime credential store P1 diperlukan agar benar-benar bisa tanpa restart.

---

# TASK: Perbaikan Flow Mobile Apps Kurir

Tanggal audit: 2026-06-02
Area: `android-app` / TEMBUS Courier App
Status awal: cukup baik untuk MVP/staging, tetapi belum cukup rapi untuk standar enterprise field operations.

## Ringkasan Penilaian

Flow kurir saat ini sudah punya pondasi operasional yang kuat:

- Login, session, online/offline duty, FCM, sync order, update app, dan lokasi sudah tersedia.
- On-demand courier sudah punya flow utama: tawaran order, terima order, navigasi pickup, scan/foto pickup, antar, POD, selesai.
- Ada support operasional: chat, telepon, SOS, cancel pickup, pending sync, dan offline Room cache.
- Ada verifikasi pickup ganda lewat scan dan foto.

Kekurangan utama:

- Flow on-demand jauh lebih matang daripada flow regular.
- Detail order masih terasa sebagai kumpulan tombol, bukan step-by-step guided workflow.
- State navigasi dan verifikasi pickup masih terlalu banyak disimpan sebagai local UI state.
- Permission, update dialog, dan modal tawaran order perlu dibuat lebih kontekstual.
- Exception flow lapangan belum cukup lengkap: penerima tidak ada, alamat salah, paket rusak, jadwal ulang, return-to-hub, gagal antar.
- UI enterprise polish masih perlu dirapikan: CTA utama, visual hierarchy, empty/error/offline state, copywriting, dan konsistensi design system.

## Prinsip Implementasi

- Jangan mengubah fitur inti yang sudah berjalan tanpa kebutuhan kontrak yang jelas.
- Setiap order status harus punya satu "Next Best Action" utama.
- Kurir tidak boleh dipaksa memilih status teknis jika sistem bisa memandu tahap berikutnya.
- Semua progress penting harus survive app restart, process death, dan mode offline.
- UI harus jujur: jika data belum tersedia, tampilkan empty/error/stale state, bukan fallback palsu.
- Backend tetap menjadi sumber kebenaran untuk status transition, radius validasi, proof requirement, cancel reason, payout, dan route.

## P0 - Flow Operasional Utama

### [x] KURIR-FLOW-001: Definisikan state machine kurir end-to-end

Masalah:
Status order saat ini sudah ada, tetapi UI belum sepenuhnya menjadikan status sebagai state machine yang memandu aksi kurir.

Target:
Buat matriks state machine untuk regular dan on-demand courier.

State minimal:

- `pending_offer`
- `assigned`
- `going_to_pickup`
- `arrived_at_pickup`
- `pickup_scan_required`
- `pickup_photo_required`
- `pickup_verified`
- `in_transit`
- `arrived_at_dropoff`
- `delivery_pod_required`
- `delivered`
- `failed`
- `cancel_requested`
- `cancelled`
- `return_to_hub`

Output yang harus dibuat:

- Dokumentasi state machine di `docs/courier-flow-state-machine.md`.
- Mapping status backend ke stage UI.
- Mapping stage UI ke CTA utama.
- Mapping exception flow per stage.

Affected area:

- `android-app/app/src/main/java/com/tembus/courier/ui/screens/MainScreen.kt`
- `android-app/app/src/main/java/com/tembus/courier/ui/screens/order/OrderDetailScreen.kt`
- `android-app/app/src/main/java/com/tembus/courier/ui/screens/order/OrderViewModel.kt`
- Backend status transition policy jika kontrak belum cukup.

Acceptance criteria:

- Setiap status order punya satu stage UI yang jelas.
- Setiap stage punya maksimal satu primary CTA.
- Secondary action hanya untuk support: chat, telepon, navigasi, SOS, cancel/report issue.
- Tidak ada status teknis yang dipilih manual oleh kurir jika bisa digantikan dengan CTA berbasis tahap.

Verification:

- Unit test mapper status ke courier stage.
- Manual QA untuk flow on-demand dan regular.
- `android-app ./gradlew :app:assembleDebug`.

### [x] KURIR-FLOW-002: Buat "Next Best Action" pada detail order

Masalah:
Detail order masih menampilkan banyak aksi bersamaan. Ini membuat kurir harus memutuskan sendiri langkah yang benar.

Target:
Order detail harus menampilkan satu CTA utama berdasarkan stage saat ini.

Contoh CTA:

- `Terima Order`
- `Mulai Navigasi Pickup`
- `Saya Sudah di Pickup`
- `Scan Paket`
- `Foto Barang`
- `Mulai Antar`
- `Saya Sudah di Tujuan`
- `Upload Bukti Terima`
- `Selesaikan Pengiriman`

Affected area:

- `OrderDetailScreen.kt`
- `MainScreen.kt`
- `OrderViewModel.kt`

Acceptance criteria:

- CTA utama selalu terlihat di area bawah layar.
- CTA utama berubah otomatis setelah tahap selesai.
- Tombol lain tidak bersaing secara visual dengan CTA utama.
- Status dialog manual hanya tersedia untuk admin/debug atau fallback yang benar-benar diperlukan.

Verification:

- Screenshot QA untuk setiap stage.
- Test mapping CTA.
- Manual test back navigation dari scan, POD, chat, dan cancel dialog.

### [x] KURIR-FLOW-003: Samakan kualitas regular flow dengan on-demand flow

Masalah:
On-demand sudah punya guided pickup/delivery flow. Regular masih lebih generik dan terasa manual.

Target:
Regular courier juga memakai stepper dan CTA berbasis tahap.

Minimum flow regular:

1. Order diterima.
2. Navigasi ke pickup/gudang/customer.
3. Scan paket.
4. Foto pickup jika policy mewajibkan.
5. Mulai antar.
6. Navigasi ke penerima.
7. Upload POD.
8. Selesai.

Affected area:

- `OrderDetailScreen.kt`
- `OrderScreen.kt`
- `OrderViewModel.kt`
- Status transition policy backend.

Acceptance criteria:

- Regular courier tidak lagi hanya melihat "Perbarui Status Pesanan" sebagai aksi utama.
- Regular dan on-demand memakai bahasa UI yang konsisten.
- Proof requirement tetap mengikuti policy backend.

Verification:

- Manual QA regular order dari assigned sampai delivered.
- Test status transition policy regular.

## P0 - Persistence, Offline, dan Sync Safety

### [x] KURIR-FLOW-004: Persist progress verifikasi pickup secara kuat

Masalah:
Saat ini ada progress pickup scan dan pickup photo yang sebagian ditahan di UI local state. Jika app restart di tengah proses, pengalaman bisa desync.

Target:
Progress scan/foto pickup harus tersimpan di Room dan tersinkron ke backend.

Data minimal:

- `pickupScanVerified`
- `pickupPhotoVerified`
- `pickupScanSyncedAt`
- `pickupPhotoSyncedAt`
- `pickupScanLocation`
- `pickupPhotoLocation`
- `pickupEvidenceUpdatedAt`

Affected area:

- `MainScreen.kt`
- `OrderRepository.kt`
- `OrderDao.kt`
- `Order.kt`
- `OrderDatabase.kt`
- Backend scan/POD endpoint jika field belum tersedia.

Acceptance criteria:

- Setelah scan berhasil lalu app ditutup, order detail tetap menampilkan scan selesai.
- Setelah foto pickup berhasil lalu app ditutup, order detail tetap menampilkan foto selesai.
- Jika salah satu proof belum sync, UI menampilkan label pending sync.
- Tidak ada progress penting yang hanya hidup di memory Compose.

Verification:

- Test restart app setelah scan pickup.
- Test airplane mode saat foto pickup.
- Test pending sync lalu online kembali.
- Room migration test jika schema berubah.

### [x] KURIR-FLOW-005: Perjelas policy upload proof type

Masalah:
Pickup proof dan delivery POD harus punya tipe yang jelas agar backend tidak salah membaca bukti pickup sebagai bukti delivery.

Target:
Semua upload evidence memakai proof type eksplisit.

Proof type minimal:

- `pickup_scan`
- `pickup_photo`
- `delivery_pod_photo`
- `delivery_signature`
- `cancel_pickup_photo`
- `failed_delivery_photo`

Affected area:

- `ProofOfDeliveryScreen.kt`
- `ProofOfDeliveryViewModel.kt`
- `OrderRepository.kt`
- API upload proof endpoint.

Acceptance criteria:

- UI tidak memakai istilah POD untuk foto pickup.
- Backend menerima proof type eksplisit.
- Sync offline tidak mengirim pickup proof sebagai delivery proof.
- Riwayat order bisa membedakan bukti pickup, bukti antar, dan bukti pembatalan.

Verification:

- Unit test payload proof type.
- Manual test upload pickup photo dan delivery POD.

### [x] KURIR-FLOW-006: Hardening pending sync dan stale state

Masalah:
App sudah punya pending sync, tetapi flow kurir perlu sinyal yang lebih jelas ketika aksi sudah tersimpan lokal tapi belum diterima backend.

Target:
Tambahkan status visual untuk aksi pending sync di order detail.

State visual:

- `Tersimpan di perangkat`
- `Menunggu sinkronisasi`
- `Tersinkron`
- `Gagal sinkron, coba lagi`

Affected area:

- `OrderDetailScreen.kt`
- `OrderScreen.kt`
- `OrderViewModel.kt`
- `OrderRepository.kt`

Acceptance criteria:

- Kurir tahu apakah proof/status sudah aman tersimpan lokal.
- Retry sync tersedia untuk item gagal.
- Tidak ada aksi yang terlihat sukses penuh sebelum backend mengonfirmasi, kecuali diberi label pending sync.

Verification:

- Manual test offline scan, offline POD, lalu reconnect.
- Unit test sync state mapper.

## Verifikasi P0

- [x] `android-app ./gradlew :app:compileDebugKotlin :app:testDebugUnitTest --rerun-tasks --no-daemon`
- [x] `android-app ./gradlew :app:assembleDebug --no-daemon`
- [x] `backend/admin-service npm run build`

Catatan hasil:

- State machine kurir tersedia di `docs/courier-flow-state-machine.md`.
- Mapper fungsional tersedia di `CourierFlowResolver` dan sudah punya unit test.
- Detail order regular dan on-demand memakai primary CTA berbasis stage.
- Foto pickup dan bukti terima memakai proof type eksplisit.
- Pending scan/proof/status tampil sebagai sync notice di detail order.
- Backend menerima proof type eksplisit tanpa memutus alias lama `pickup` dan `delivery`.

## P1 - Permission, Update, dan Entry Flow

### [x] KURIR-FLOW-007: Buat permission request lebih kontekstual

Masalah:
Permission notification/location diminta terlalu awal bisa terasa agresif untuk kurir baru.

Target:
Permission diminta sesuai konteks.

Rekomendasi:

- Notification permission: setelah login, dengan alasan singkat bahwa order masuk dikirim lewat notifikasi.
- Foreground location: saat kurir menekan Online atau Mulai Navigasi.
- Background location: saat kurir mengaktifkan Online pertama kali dan sudah paham manfaatnya.
- Camera permission: saat masuk scan/foto proof.

Affected area:

- `MainActivity.kt`
- `MainScreen.kt`
- `ScanScreen.kt`
- `ProofOfDeliveryScreen.kt`

Acceptance criteria:

- Login tidak langsung terasa dibanjiri permission.
- Jika permission ditolak, app memberi next step yang jelas.
- Tombol Online menjelaskan kenapa lokasi dibutuhkan.

Verification:

- Fresh install QA.
- Permission denied QA.
- Permission granted after denied QA.

### [x] KURIR-FLOW-008: Rapikan update dialog agar tidak mengganggu login

Masalah:
Update dialog muncul di atas flow login dan bisa terasa mengganggu, terutama jika user belum siap masuk.

Target:
Atur prioritas update dialog.

Policy:

- Forced update: boleh muncul sebelum login.
- Optional update: tampil setelah login atau setelah home render.
- Jika update gagal karena permission/install issue, tampilkan solusi yang jelas.

Affected area:

- `MainActivity.kt`
- Update dialog/component.

Acceptance criteria:

- Forced update tidak bisa dilewati jika minimum version tidak terpenuhi.
- Optional update tidak memblokir login.
- Error update memakai Bahasa Indonesia yang rapi, bukan exception mentah Android.

Verification:

- QA forced update.
- QA optional update.
- QA update permission missing/regression.

## P1 - Offer, Assignment, dan Active Job

### [x] KURIR-FLOW-009: Ganti single offer dialog menjadi offer queue/list

Masalah:
On-demand offer saat ini cenderung mengambil tawaran pertama. Jika ada lebih dari satu tawaran, flow kurang scalable.

Target:
Buat daftar tawaran aktif dengan prioritas dan countdown.

Informasi minimal:

- Pickup area.
- Dropoff area.
- Estimasi jarak.
- Estimasi durasi.
- Payout.
- Service type.
- Deadline accept.
- Risiko: COD, fragile, heavy item.

Affected area:

- `MainScreen.kt`
- `OrderScreen.kt`
- `OrderViewModel.kt`
- Backend offer payload jika belum lengkap.

Acceptance criteria:

- Kurir bisa melihat lebih dari satu offer.
- Offer utama tetap bisa dipromosikan sebagai card paling atas.
- Offer expired hilang otomatis atau berubah status.
- Accept/reject punya feedback loading dan error.

Verification:

- QA multiple active offers.
- QA offer expired.
- QA accept one offer lalu offer lain refresh.

### [x] KURIR-FLOW-010: Batasi active job sesuai kapasitas courier

Masalah:
Flow harus jelas apakah kurir boleh memegang satu atau beberapa order aktif.

Target:
Kapasitas active job harus eksplisit dari backend policy.

Policy contoh:

- Motor on-demand: maksimal 1 active delivery.
- Kargo: bisa multi-drop jika backend mengizinkan.
- Regular route: bisa batch manifest.

Affected area:

- `MainScreen.kt`
- `OrderViewModel.kt`
- Capability profile backend.

Acceptance criteria:

- Jika kurir masih punya active job, offer baru mengikuti policy.
- Jika tidak boleh multi-job, app tidak menampilkan CTA accept offer baru.
- UI menjelaskan alasan offer tidak bisa diambil.

Verification:

- QA active job + incoming offer.
- Unit test capability policy mapper.

## P1 - Location, Navigation, dan Geofence

### [x] KURIR-FLOW-011: Jadikan location gate sebagai rule yang jelas

Masalah:
UI sudah menampilkan jarak ke titik pickup/tujuan, tetapi aksi proof perlu lebih eksplisit apakah diblokir atau hanya diberi peringatan.

Target:
Proof action mengikuti policy radius dari backend.

Policy:

- Jika di luar radius: tombol scan/foto tetap bisa nonaktif atau perlu override reason.
- Jika akurasi GPS buruk: minta ulang lokasi.
- Jika koordinat order tidak tersedia: tampilkan fallback flow dengan reason wajib.

Affected area:

- `OrderDetailScreen.kt`
- `ScanScreen.kt`
- `ProofOfDeliveryScreen.kt`
- Backend verification endpoint.

Acceptance criteria:

- Radius tidak hardcoded di UI jika backend sudah punya policy.
- Kurir mendapat pesan jelas saat belum di titik pickup/tujuan.
- Override di luar radius harus mencatat alasan, lokasi, akurasi, dan timestamp.

Verification:

- QA inside radius.
- QA outside radius.
- QA GPS accuracy buruk.
- QA coordinate missing.

### [x] KURIR-FLOW-012: Perbaiki navigasi dan route state

Masalah:
Navigasi harus konsisten antara pickup dan dropoff, serta jelas apakah route berasal dari backend atau fallback.

Target:
Order detail menampilkan route status yang dapat dipercaya.

State minimal:

- `Route tersedia`
- `Mengambil route`
- `Route belum tersedia`
- `Mode fallback text-only`
- `Provider maps bermasalah`

Affected area:

- `OrderDetailScreen.kt`
- `OrderViewModel.kt`
- Route preview API.

Acceptance criteria:

- Kurir tahu apakah peta/route valid.
- Jika peta gagal, tetap ada instruksi alamat dan tombol buka maps eksternal.
- Tidak ada garis lurus yang terlihat seperti route resmi.

Verification:

- QA route available.
- QA route provider unavailable.
- QA maps config text-only.

## P1 - Exception Flow Lapangan

### [x] KURIR-FLOW-013: Tambahkan flow penerima tidak ada

Masalah:
Kurir butuh flow resmi saat penerima tidak ada di lokasi.

Target:
Tambahkan exception "Penerima tidak ada".

Data wajib:

- Foto lokasi/paket.
- Catatan kurir.
- Lokasi GPS.
- Waktu kejadian.
- Opsi hubungi customer.
- Opsi jadwal ulang atau return.

Affected area:

- `OrderDetailScreen.kt`
- `ProofOfDeliveryScreen.kt` atau screen exception baru.
- Backend failed delivery endpoint/policy.

Acceptance criteria:

- Kurir tidak perlu memakai status generic failed tanpa bukti.
- Customer/admin mendapat alasan yang audit-friendly.
- Flow bisa lanjut ke reschedule atau return-to-hub sesuai policy.

Verification:

- Manual QA failed delivery.
- Backend payload validation.

### [x] KURIR-FLOW-014: Tambahkan flow alamat salah/tidak ditemukan

Masalah:
Alamat salah adalah kasus umum lapangan dan perlu flow yang berbeda dari penerima tidak ada.

Target:
Tambahkan exception "Alamat tidak ditemukan".

Data wajib:

- Lokasi aktual kurir.
- Foto sekitar lokasi.
- Catatan kurir.
- Upaya kontak customer.
- Rekomendasi: koreksi alamat, reschedule, atau return.

Acceptance criteria:

- Alamat salah tidak dicatat sebagai kegagalan kurir.
- Admin bisa melihat bukti dan lokasi aktual.

Verification:

- Manual QA address issue.

### [x] KURIR-FLOW-015: Tambahkan flow paket rusak/bermasalah

Masalah:
Paket rusak, bocor, tidak sesuai, atau label tidak terbaca perlu flow resmi.

Target:
Tambahkan exception "Paket bermasalah".

Data wajib:

- Foto paket.
- Jenis masalah.
- Catatan.
- Lokasi.
- Waktu.

Acceptance criteria:

- Kurir bisa melaporkan sebelum pickup, saat pickup, atau saat antar.
- Status order tidak langsung selesai/gagal tanpa policy.

Verification:

- Manual QA damaged package report.

### [x] KURIR-FLOW-016: Tambahkan return-to-hub / return-to-sender

Masalah:
Setelah gagal antar, app perlu instruksi lanjutan yang jelas.

Target:
Tambahkan flow return.

State minimal:

- `return_required`
- `return_in_transit`
- `returned_to_hub`
- `returned_to_sender`

Acceptance criteria:

- Setelah failed delivery, kurir tahu harus return ke mana.
- Ada scan/foto saat barang diterima hub/sender.
- Ledger/status tidak menganggap order delivered.

Verification:

- Manual QA failed delivery to return.

## Verifikasi P1

Status: selesai.

Implementasi utama:

- Permission lokasi dipindah ke konteks On Duty, notification setelah login, dan background location lewat dialog terpisah.
- Optional update hanya tampil setelah login/home; forced update tetap bisa muncul sebelum login.
- Offer on-demand menjadi queue/list dengan countdown, promoted offer, auto-expire reject, dan active-job capacity guard dari capability/service policy.
- Route state menampilkan loading, fallback, unavailable, text-only/provider issue, dan menegaskan garis fallback bukan rute resmi.
- Location gate menampilkan rule radius 150m dan akurasi 100m; percobaan invalid tetap diaudit backend proof endpoint.
- Exception lapangan dikirim end-to-end sebagai safety event dengan catatan, lokasi, akurasi, timestamp server, dan foto bukti private upload.
- Backend safety event di-hardening dengan whitelist event type, severity validation, message sanitization, ownership check, dan migration constraint event P1.

Verification:

- `android-app`: `./gradlew :app:compileDebugKotlin --no-daemon` sukses.
- `android-app`: `./gradlew :app:testDebugUnitTest --no-daemon` sukses.
- `android-app`: `./gradlew :app:assembleDebug --no-daemon` sukses.
- `backend/admin-service`: `npm run build` sukses.

## P2 - UI/UX Enterprise Polish

### [x] KURIR-FLOW-017: Rapikan visual hierarchy detail order

Masalah:
Detail order masih padat dan beberapa elemen visual belum konsisten dengan design guideline enterprise.

Target:
Detail order menjadi lebih mudah dipindai saat kurir sedang di lapangan.

Prioritas tampilan:

1. Current stage.
2. Next destination.
3. Primary CTA.
4. Distance/ETA/route status.
5. Proof/checklist.
6. Customer/contact/support.
7. Detail tambahan.

Acceptance criteria:

- Dalam 3 detik kurir paham harus melakukan apa.
- CTA utama tidak tenggelam oleh tombol sekunder.
- Warna mengikuti TEMBUS green/orange design system.
- Hindari border hitam tebal dan visual yang terlalu ramai.

Verification:

- Screenshot review untuk 5 stage utama.
- Accessibility contrast check.

### [x] KURIR-FLOW-018: Perbaiki microcopy agar lebih enterprise

Masalah:
Beberapa label/copy masih terdengar teknis atau terlalu generic.

Target:
Gunakan Bahasa Indonesia operasional yang jelas dan profesional.

Contoh penggantian:

- `Update Status` -> `Perbarui Tahap Pengiriman` atau hilangkan jika diganti CTA.
- `POD` -> `Bukti Terima` untuk user-facing copy.
- `Dropoff` -> `Tujuan` atau `Lokasi Penerima`.
- `Scan barcode` -> `Scan Kode Paket`.
- `Foto barang pickup` -> `Foto Barang Saat Pickup`.

Acceptance criteria:

- Tidak ada istilah internal yang muncul ke kurir.
- Copy konsisten antara on-demand dan regular.
- Error message tidak menampilkan exception mentah.

Verification:

- `rg -n "POD|Dropoff|Update Status|Exception|Error:" android-app/app/src/main/java/com/tembus/courier`

### [x] KURIR-FLOW-019: Tambahkan skeleton dan empty/error state yang konsisten

Masalah:
Enterprise app harus memberi feedback saat data sedang sync, kosong, stale, atau gagal.

Target:
Setiap screen utama punya state:

- Loading skeleton.
- Empty state.
- Error state dengan retry.
- Offline/stale state.

Affected screen:

- Beranda.
- Order.
- Detail order.
- Dompet.
- Profil.
- Offer list.
- Chat.

Acceptance criteria:

- Tidak ada blank screen tanpa konteks.
- Retry tersedia pada fetch penting.
- Offline cache diberi label waktu sync terakhir.

Verification:

- Matikan API staging/dev lalu QA app.
- Aktifkan airplane mode lalu buka app.

### [x] KURIR-FLOW-020: Perkuat accessibility untuk penggunaan lapangan

Masalah:
Kurir memakai app saat bergerak, kondisi cahaya berubah, dan butuh target sentuh besar.

Target:
Audit accessibility khusus mobile field usage.

Checklist:

- Touch target minimal 48dp.
- Font tidak terlalu kecil.
- Kontras WCAG AA.
- State tidak hanya dibedakan dengan warna.
- Content description untuk icon penting.
- Snackbar/toast tidak menjadi satu-satunya feedback untuk aksi kritis.

Acceptance criteria:

- Aksi utama mudah ditekan satu tangan.
- Informasi penting tetap terbaca di luar ruangan.
- Screen reader tidak membaca icon sebagai elemen kosong.

Verification:

- Accessibility scanner.
- Manual QA ukuran font besar.

## P2 - Architecture Cleanup

### [x] KURIR-FLOW-021: Pisahkan navigation state dari `MainScreen`

Masalah:
`MainScreen` memegang terlalu banyak boolean screen state seperti detail, scan, POD, chat, dan local verification state.

Target:
Gunakan model navigasi yang lebih stabil.

Opsional pendekatan:

- Compose Navigation dengan route typed.
- Single sealed class `CourierRoute`.
- Persist selected order id lewat `SavedStateHandle`.

Affected area:

- `MainScreen.kt`
- Screen detail/scan/POD/chat.

Acceptance criteria:

- Back stack lebih prediktif.
- Deep link dari notification membuka screen yang benar.
- Rotation/process death tidak menghilangkan konteks order.
- MainScreen lebih kecil dan mudah dites.

Verification:

- Manual QA notification deep link.
- Manual QA rotate/process recreate.
- Unit test route reducer jika memakai reducer.

### [x] KURIR-FLOW-022: Buat mapper/domain layer untuk courier stage

Masalah:
UI mencampur logika status order, role, proof requirement, dan CTA.

Target:
Buat mapper kecil:

- `CourierStageMapper`
- `CourierNextActionMapper`
- `CourierProofRequirementMapper`

Affected area:

- `ui/screens/order`
- `data/model`
- `domain` package baru jika sesuai struktur.

Acceptance criteria:

- Compose screen tidak berisi logika status kompleks.
- Mapper punya unit test.
- Policy backend tetap bisa mempengaruhi output mapper.

Verification:

- Unit test kombinasi role/status/proof policy.

## Verifikasi P2

Status: selesai.

Implementasi utama:

- Detail order regular dan on-demand dirapikan menjadi urutan stage, tujuan berikutnya, CTA utama, route/location state, checklist, lalu support/detail tambahan.
- Microcopy UI kurir dipoles ke Bahasa Indonesia operasional: `Bukti Terima`, `Tujuan`, `Scan Kode Paket`, `Foto Barang Saat Pickup`, dan `Koreksi Tahap`.
- Loading/empty/error state ditambah untuk order list, wallet ledger, chat, scan, proof, dan error sync utama.
- Aksi utama dan proof/scan dibuat lebih ramah penggunaan lapangan dengan target sentuh minimal 52-56dp dan feedback inline untuk error kritis.
- Navigation state detail/scan/proof/chat dipisahkan menjadi `CourierRouteState` + `CourierRouteReducer` dan disimpan lewat `rememberSaveable`.
- Mapper stage/next action/proof requirement tetap berada di domain layer dan ditambah test route reducer untuk deep link/back flow.

Verification:

- `android-app`: `./gradlew :app:compileDebugKotlin --no-daemon` sukses.
- `android-app`: `./gradlew :app:testDebugUnitTest --no-daemon` sukses.
- `android-app`: `./gradlew :app:assembleDebug --no-daemon` sukses.
- `backend/admin-service`: `npm run build` sukses.

## Urutan Eksekusi yang Disarankan

1. `KURIR-FLOW-001` - state machine.
2. `KURIR-FLOW-002` - Next Best Action di order detail.
3. `KURIR-FLOW-003` - parity regular flow.
4. `KURIR-FLOW-004` - persist pickup verification.
5. `KURIR-FLOW-005` - proof type eksplisit.
6. `KURIR-FLOW-011` - location gate policy.
7. `KURIR-FLOW-013` sampai `KURIR-FLOW-016` - exception flow lapangan.
8. `KURIR-FLOW-017` sampai `KURIR-FLOW-020` - UI/UX polish.
9. `KURIR-FLOW-021` sampai `KURIR-FLOW-022` - architecture cleanup.

## Definition of Done Global

- Flow regular dan on-demand sama-sama guided.
- Setiap stage punya satu CTA utama.
- Scan, pickup photo, delivery proof, cancel proof, dan failed proof memakai proof type eksplisit.
- Progress proof/status tetap muncul setelah app restart.
- Offline/pending sync terlihat jelas.
- Semua exception lapangan punya reason, proof, location, timestamp, dan audit trail.
- UI mengikuti design system TEMBUS: green primary, orange CTA, white surface, radius konsisten, whitespace cukup, dan copy profesional.
- Build/test minimal:
  - `cd android-app`
  - `./gradlew :app:assembleDebug`
  - `./gradlew :app:testDebugUnitTest`

## Catatan Diskusi Product

Keputusan yang perlu disepakati sebelum implementasi besar:

- Apakah regular courier boleh multi-order aktif atau selalu satu order?
- Apakah on-demand courier boleh menerima offer baru saat masih membawa paket?
- Radius validasi pickup/dropoff mengikuti policy berapa meter?
- Jika GPS buruk, apakah proof diblokir atau boleh override dengan alasan?
- Apakah pickup selalu wajib scan + foto, atau tergantung service/category?
- Apakah failed delivery langsung return, reschedule, atau menunggu keputusan admin?
- Istilah final user-facing: pakai `Bukti Terima` atau tetap `POD` di app kurir?
