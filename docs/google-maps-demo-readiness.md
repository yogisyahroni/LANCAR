# Google Maps Demo Readiness

Tanggal: 2026-06-03
Area: Mobile Courier, Mobile Customer, Backend Maps Gateway, Admin Maps Runtime

Dokumen ini mencatat evidence teknis untuk membuat Google Maps demo berjalan aman. Jangan menulis API key mentah di dokumen ini.

## Android Native Maps SDK

Google Maps SDK for Android membaca API key dari manifest APK melalui metadata `com.google.android.geo.API_KEY`. Karena itu, key Android harus di-authorize di Google Cloud untuk package name dan SHA-1 certificate fingerprint yang dipakai APK.

### Courier App

- Package name: `com.tembus.courier`
- Debug keystore: `C:\Users\yogis\.android\debug.keystore`
- Debug alias: `AndroidDebugKey`
- Debug SHA-1: `8C:D0:8A:46:B2:A1:8C:DC:9A:E1:67:2D:A8:C6:A8:22:F6:25:46:33`
- Debug SHA-256: `A4:AA:79:F2:7D:52:2A:E7:8E:93:73:75:EE:F2:75:89:21:B3:42:6B:55:D4:59:A8:BE:EB:AE:2D:7D:17:F5:E6`
- Release signing: belum dikonfigurasi di Gradle lokal (`release Config: null`)

### Customer App

- Package name: `com.tembus.customer`
- Debug keystore: `C:\Users\yogis\.android\debug.keystore`
- Debug alias: `AndroidDebugKey`
- Debug SHA-1: `8C:D0:8A:46:B2:A1:8C:DC:9A:E1:67:2D:A8:C6:A8:22:F6:25:46:33`
- Debug SHA-256: `A4:AA:79:F2:7D:52:2A:E7:8E:93:73:75:EE:F2:75:89:21:B3:42:6B:55:D4:59:A8:BE:EB:AE:2D:7D:17:F5:E6`
- Release signing: belum dikonfigurasi di Gradle lokal (`release Config: null`)

## Google Cloud Configuration Required For Demo

Untuk key Android demo, Google Cloud harus berisi Android application restrictions berikut:

- `8C:D0:8A:46:B2:A1:8C:DC:9A:E1:67:2D:A8:C6:A8:22:F6:25:46:33;com.tembus.courier`
- `8C:D0:8A:46:B2:A1:8C:DC:9A:E1:67:2D:A8:C6:A8:22:F6:25:46:33;com.tembus.customer`

API restriction minimal:

- Maps SDK for Android

Untuk APK staging/release, tambahkan SHA-1 dari signing key staging/release yang benar. Jangan memakai SHA-1 debug untuk build release.

## Server-Side Maps Gateway

Backend route/geocode/ETA tidak boleh memakai Android-restricted key. Gunakan server-side key terpisah dengan restriction:

- Application restriction: backend server IP/NAT egress jika tersedia.
- API restrictions:
  - Routes API jika backend memakai Google Routes.
  - Directions API jika legacy fallback masih aktif.
  - Geocoding API untuk address search/reverse geocode.

Server key harus berada di env/secret store/backend encrypted runtime credential store, bukan di mobile APK.

## Verification Snapshot - 2026-06-03

### Local Env and Source Scan

- Local `.env` has `GOOGLE_MAPS_API_KEY` with expected Google key length.
- Built courier/customer debug manifests contain `com.google.android.geo.API_KEY`.
- Source scan for Google key pattern found only a fake test fixture in `backend/admin-service/src/security/logRedaction.test.ts`.
- No real Google key was added to this document or committed source.

### Direct Google API Test With Local Demo Key

Result summary without exposing the key:

- Routes API `TWO_WHEELER`: success, route returned with encoded polyline.
- Routes API `DRIVE`: success, route returned with encoded polyline.
- Geocoding API: `REQUEST_DENIED`, billing must be enabled on the Google Cloud project.
- Legacy Directions API: `REQUEST_DENIED`, legacy API is not enabled for the project.

Implication:

- The demo key can prove route polyline through Google Routes API.
- Backend and admin status must avoid legacy Directions dependency for this demo unless the legacy API is deliberately enabled.
- Geocoding requires billing/API readiness before address search can be declared complete.

### Staging Public API Test

`https://api.bawain.my.id/api/v1/maps/config?scope=courier_mobile`

- `requested_provider=google_maps`
- `active_provider=google_maps`

`https://api.bawain.my.id/api/v1/maps/config?scope=customer_mobile`

- `requested_provider=google_maps`
- `active_provider=google_maps`

`https://api.bawain.my.id/api/v1/maps/route?...vehicle_type=motorcycle`

- `provider=google_maps_fallback_haversine`
- `fallback_reason=REQUEST_DENIED`
- `has_polyline=false`

Implication:

- Runtime provider switch is active.
- Staging backend route is still not using a successful Google Routes result, or its deployed env/key/container differs from local readiness.
- This is a blocking demo issue because ETA/polyline falls back to low-confidence straight-line calculation.

### Emulator Visual QA

Courier app current installed package:

- Package: `com.tembus.courier`
- Version: `1.0.0`
- Current emulator map screen uses Google renderer but shows blank/neutral tiles with Google attribution.
- Current installed package signature differs from the locally built debug APK, so `adb install -r` fails with `INSTALL_FAILED_UPDATE_INCOMPATIBLE`.

Locally built debug APK:

- Courier build: success.
- Customer build: success.
- Customer install: success.
- Courier install: blocked by existing package signature mismatch unless old courier app is uninstalled or the same signing key is used.

Implication:

- Blank map is still a P0 blocker.
- For non-destructive QA, use the same signing key as the installed app.
- For clean emulator QA, uninstall `com.tembus.courier` first, then install the current debug APK. This removes app data/session.

### Google Cloud Access

`gcloud` is installed and authenticated, but API key lookup failed:

- `PERMISSION_DENIED`
- Missing permission: `apikeys.keys.lookup`

Implication:

- Local automation cannot verify or update API key restrictions through Google Cloud CLI.
- Google Cloud console/API key owner must authorize Android app restrictions and server key restrictions manually, or grant the needed IAM permission.

## Verification Commands

```powershell
cd android-app
.\gradlew.bat :app:signingReport --no-daemon
.\gradlew.bat :app:assembleDebug --no-daemon

cd ..\android-app-customer
.\gradlew.bat :app:signingReport --no-daemon
.\gradlew.bat :app:assembleDebug --no-daemon
```

Security scan:

```powershell
rg -n "AIza[0-9A-Za-z_-]{20,}" android-app android-app-customer backend admin-dashboard frontend docs task.md TASKS.md -S
```

Expected:

- Tidak ada API key nyata di source/docs.
- Test fixture palsu untuk log redaction masih boleh ada jika tidak bisa dipakai sebagai credential.

## Known Demo Risk

Jika Google-hosted demo key tidak bisa direstrict ke package/SHA-1 dan API restriction yang benar, key tersebut tidak layak untuk staging enterprise. Buat key staging resmi, restrict sesuai platform, lalu revoke demo key setelah pembuktian selesai.

## Verification Snapshot - 2026-06-04

### Google Cloud API Enablement

Project gcloud aktif berhasil di-enable untuk:

- `maps-android-backend.googleapis.com`
- `routes.googleapis.com`
- `geocoding-backend.googleapis.com`

Namun direct Geocoding API masih mengembalikan:

- `REQUEST_DENIED`
- Billing Google Cloud project belum aktif.

Implikasi:

- Enable API saja belum cukup. Google Maps Platform tetap membutuhkan billing project yang aktif untuk Geocoding dan native map tile.
- P0 Google native belum bisa dinyatakan selesai sampai billing aktif dan Android key restriction benar untuk package + SHA-1 yang dipakai APK.

### Staging Backend Route

Staging route endpoint setelah API enable masih mengembalikan:

- `active_provider=google_maps`
- `provider=google_maps_fallback_haversine`
- `fallback_reason=REQUEST_DENIED`
- `has_polyline=false`
- `confidence=low`

Implikasi:

- Runtime switch admin sudah terbaca mobile/backend.
- Staging backend belum memakai server-side Google credential yang valid, atau credential/env/deploy staging belum sinkron.
- Ini blocker P0 untuk route/ETA karena hasil masih straight-line fallback.

### Courier Emulator QA

Clean install courier debug:

- Existing signed package lama di-uninstall karena `adb install -r` gagal signature mismatch.
- Debug APK install sukses.
- Login seed courier staging sukses tanpa OTP.
- Home map terbuka dan tidak crash.

Evidence:

- Blank Google native sebelum fallback: `android-app/build/google-maps-p0-qa/courier-debug-post-enable-dialog-dismissed.png`
- Fallback OSM setelah watchdog fix: `android-app/build/google-maps-p0-qa/courier-debug-fallback-watchdog-fixed.png`

Logcat summary:

- `FATAL EXCEPTION`: 0
- `Authorization failure`: 0
- `REQUEST_DENIED`: 0 di app logcat setelah login

Implikasi:

- Native GoogleMap view berhasil dibuat, tetapi tile jalan Google tidak render pada emulator dengan key/billing saat ini.
- Mobile sekarang tidak lagi menampilkan kanvas blank: jika Google native tidak `onMapLoaded`, renderer fallback ke OpenStreetMap.

### Local Build/Test

Courier app:

- `.\gradlew.bat :app:assembleDebug --no-daemon`: passed.
- `.\gradlew.bat :app:testDebugUnitTest --no-daemon`: passed.

Customer app:

- `.\gradlew.bat :app:assembleDebug --no-daemon`: passed.
- `.\gradlew.bat :app:testDebugUnitTest --no-daemon`: passed.

Backend/admin-service:

- `npm run build`: passed.
- `npm test -- src/services/mapsProviderConfig.test.ts`: passed.

Customer web:

- `NEXT_PUBLIC_API_URL=https://api.bawain.my.id/api/v1 NEXT_PUBLIC_WS_URL=https://api.bawain.my.id NEXT_PUBLIC_SOCKET_URL=https://api.bawain.my.id npm run build`: passed.

Admin dashboard:

- `VITE_API_URL=https://api.bawain.my.id/api/v1 VITE_WS_URL=https://api.bawain.my.id VITE_SOCKET_URL=https://api.bawain.my.id npm run build`: passed.

Maps runtime source status:

- `/api/v1/maps/config` now supports a `google_maps` browser runtime block for web/admin.
- Customer web mini-map renders Google Maps JavaScript API when `active_provider=google_maps` and `GOOGLE_MAPS_BROWSER_API_KEY` is deployed.
- Admin LiveMap, Zone viewer, and Demand Density use Google Maps JavaScript API when browser runtime is ready.
- Mobile courier and customer build scripts now prefer `GOOGLE_MAPS_ANDROID_API_KEY` and fallback to the legacy `GOOGLE_MAPS_API_KEY`.
- Customer mobile now has the same Google `onMapLoaded` watchdog and OSM fallback behavior as courier mobile.

Env status:

- Local `.env` contains demo aliases for `GOOGLE_ROUTES_API_KEY`, `GOOGLE_MAPS_BROWSER_API_KEY`, and `GOOGLE_MAPS_ANDROID_API_KEY` without printing the key in logs.
- Staging/VPS must receive the same env split through secrets before browser/admin Google maps can render after deploy.
- Production must not reuse the demo key across Android, browser, and server. Use separate restricted keys.

Catatan:

- Gradle deprecation warning tidak berbahaya untuk P0, tetapi perlu dibereskan sebelum Gradle 9.
- Satu build paralel sempat gagal `StreamCorruptedException: unexpected EOF in middle of data block`; retry serial passed. Ini diperlakukan sebagai Gradle/KSP cache contention, bukan regression kode.
