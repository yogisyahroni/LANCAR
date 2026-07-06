# TASK: TomTom Maps Platform Migration

Tanggal: 2026-06-04
Area: Admin Maps Runtime, Backend Maps Gateway, Customer Web, Android Customer, Android Courier
Status: P0-P5 code migration selesai secara lokal; staging/production tetap wajib memakai key TomTom terpisah dan key demo wajib dirotasi sebelum production.

## Prinsip Keamanan

- Key TomTom yang pernah terlihat di chat/log/screenshot hanya boleh dianggap demo/staging.
- Production wajib memakai key baru yang dipisah per surface: server, web, Android courier, dan Android customer.
- Server key hanya dipakai backend untuk routing/search/reverse geocode dan tidak pernah dikirim ke client.
- Web/mobile key hanya untuk SDK surface masing-masing.
- Firebase `google-services.json` tetap dipertahankan karena itu bukan Google Maps.
- Google Play Services Location boleh tetap dipakai untuk lokasi device selama tidak membawa Google Maps SDK/runtime.

## Final Provider Contract

- Primary provider: `tomtom_maps`.
- Emergency fallback: `openstreetmap`.
- Safe degraded mode: `disabled` / text-only.
- Public runtime config mengekspos `tomtom_maps`, bukan `google_maps`.
- Credential env aktif:
  - `TOMTOM_SERVER_API_KEY`
  - `TOMTOM_WEB_API_KEY`
  - `TOMTOM_ANDROID_COURIER_API_KEY`
  - `TOMTOM_ANDROID_CUSTOMER_API_KEY`

## Completed Work

- [x] DB migration mengunci runtime provider ke `tomtom_maps` dan menonaktifkan credential provider lama.
- [x] Backend admin-service memakai TomTom Routing API untuk ETA/polyline/traffic-aware route.
- [x] Backend admin-service memakai TomTom Search API untuk geocode/reverse geocode via backend proxy.
- [x] KRITIS-1: AWB Idempotency
    - [x] Check `order.AWB` inside `HandleWebhook` before triggering `CreateAWB`.
- [x] KRITIS-2: Tariff Type Mismatch
    - [x] Rename `TariffAmount` to `TariffGross` (int64) in `domain.TariffServiceOption`.
    - [x] Update JNE & J&T adapters in `integration-gateway` to cast API string values to `int64`.
    - [x] Update `integration_gateway_client.go` in `order-service` to correctly read the success payload and parse the gross tariff value.
- [x] KRITIS-3: Webhook Race Condition
    - [x] Implement `AtomicMarkPaid` inside `PaymentLinkRepository` using `UPDATE ... RETURNING`.
    - [x] Refactor `HandleWebhook` to use atomic operation instead of separate read & update statements.
- [x] KRITIS-4: Resiliency/Circuit Breaker for Logistics
    - [x] Add `CircuitBreaker` reference in JNE & J&T Providers.
    - [x] Wrap external API requests (`httpClient.Do`) with Circuit Breaker `Allow()`, `RecordSuccess()`, and `RecordFailure()`.
- [x] OSM/haversine fallback tetap aktif untuk timeout, quota, failure, dan circuit breaker.
- [x] Credential validation TomTom server key tidak log/return plaintext key.
- [x] Production readiness memakai TomTom key inventory, restrictions, expected APIs, quota, dan rotation metadata.
- [x] Admin web runtime diganti menjadi `TomTomMapsRuntime`.
- [x] Customer web booking tetap tanpa visual map default.
- [x] Customer web tracking/detail memakai runtime provider TomTom/fallback.
- [x] Android customer memakai TomTom map tile runtime dan BuildConfig TomTom key.
- [x] Android courier memakai TomTom map runtime, TomTom Navigation SDK dependency, dan fallback external navigation URI.
- [x] Android Google Maps SDK dependency/manifest metadata dihapus.
- [x] CI mobile/staging guard memblokir Google Maps SDK/runtime residue tanpa memblokir Firebase.
- [x] Docker build lokal berhasil untuk `admin-service`, `order-service`, `admin-dashboard`, dan `frontend`.

## Verification

- [x] `backend/admin-service`: `npm test -- --testTimeout=60000`
- [x] `backend/admin-service`: `npm run build`
- [x] `admin-dashboard`: production build
- [x] `frontend`: production build
- [x] `android-app`: `.\gradlew.bat :app:assembleDebug`
- [x] `android-app`: `.\gradlew.bat :app:testDebugUnitTest`
- [x] `android-app-customer`: `.\gradlew.bat :app:assembleDebug`
- [x] `android-app-customer`: `.\gradlew.bat :app:testDebugUnitTest`
- [x] Migration up/version/down dengan PostGIS ephemeral.
- [x] Active source scan bersih dari Google Maps SDK/runtime residue.

## Remaining Operator Tasks

- [ ] Isi GitHub Secrets/staging host dengan key TomTom terpisah per surface.
- [ ] Rotasi key demo sebelum production.
- [ ] Validasi Maps Runtime di admin staging setelah deploy.
- [ ] Device QA: courier idle map, offer route preview, navigation to pickup/dropoff, customer tracking.
- [ ] Pantau alert `tomtom_quota_near_limit`, `tomtom_request_denied`, `tomtom_routing_failure`, dan `maps_provider_failure_high`.
