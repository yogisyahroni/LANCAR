# On-Demand External Keys Setup

Dokumen ini memastikan infra on-demand siap dan deployment berikutnya hanya perlu mengisi secret/API key. Jangan commit value asli ke Git, issue, screenshot, log, atau markdown.

## Required Env

Set env ini di staging dan production:

- `TOMTOM_SERVER_API_KEY`: key backend untuk Routing API, Search API, geocode, dan reverse geocode. Key ini tidak boleh dikirim ke web/mobile.
- `TOMTOM_WEB_API_KEY`: key Web SDK yang dibatasi HTTP referrer untuk admin web, customer web, dan tracking web.
- `TOMTOM_ANDROID_COURIER_API_KEY`: key Android Maps/Navigation SDK khusus package courier.
- `TOMTOM_ANDROID_CUSTOMER_API_KEY`: key Android Maps SDK khusus package customer.
- `TOMTOM_ROUTING_API_URL`: opsional untuk test/staging mock. Default `https://api.tomtom.com/routing/1`.
- `TOMTOM_ROUTING_ALLOWED_HOSTS`: allowlist host routing. Default hanya `api.tomtom.com`, localhost, dan host Docker lokal.
- `TOMTOM_SEARCH_API_URL`: opsional untuk test/staging mock. Default `https://api.tomtom.com/search/2`.
- `TOMTOM_SEARCH_ALLOWED_HOSTS`: allowlist host search. Default hanya `api.tomtom.com`, localhost, dan host Docker lokal.
- `TOMTOM_ROUTING_TIMEOUT_MS`: timeout route provider. Default 2800 ms.
- `TOMTOM_CREDENTIAL_TEST_TIMEOUT_MS`: timeout validasi credential. Default 4500 ms.
- `FIREBASE_SERVICE_ACCOUNT`: JSON service account Firebase Admin SDK dalam format satu baris.
- `FIREBASE_PROJECT_ID`: metadata project Firebase.

## TomTom Maps Platform

1. Buat key terpisah untuk server, web, Android courier, dan Android customer.
2. Restrict key sesuai surface: server/IP untuk backend, HTTP referrer untuk web, package + certificate fingerprint untuk Android.
3. Aktifkan Routing, Search, reverse geocode, Maps SDK Web, Maps SDK Android, dan Navigation SDK Android sesuai kebutuhan surface.
4. Isi credential server lewat Admin > Maps Runtime agar bisa divalidasi dan diaktifkan tanpa restart service.
5. Isi key web/mobile melalui secret manager atau CI/CD encrypted secrets.
6. Rotasi key demo/staging sebelum production jika pernah terlihat di chat, log, screenshot, atau local terminal.

Backend on-demand tracking akan mengirim:

- `eta`
- `eta_minutes`
- `distance_meters`
- `duration_seconds`
- `route_polyline`
- `route_provider`
- `route_profile`
- `vehicle_type`
- `traffic_aware`
- `fallback_reason`

Jika TomTom key belum ada, quota habis, provider timeout, atau circuit breaker terbuka, backend tetap memakai OpenStreetMap/haversine fallback terlabel agar customer tracking tidak mati. Fallback garis lurus bukan sumber pricing final kecuali emergency policy diaktifkan.

## Firebase / FCM

1. Buka Firebase Console untuk project staging/production.
2. Pastikan Android app courier dan customer memakai project yang sama dengan backend staging.
3. Download `google-services.json` untuk masing-masing app bila package name berbeda.
4. Buat service account Firebase Admin SDK.
5. Simpan JSON service account sebagai secret `FIREBASE_SERVICE_ACCOUNT`.
6. Isi `FIREBASE_PROJECT_ID`.

Backend tidak mengekspos isi service account di endpoint readiness.

## Readiness Check

Setelah service jalan, cek:

```bash
curl http://localhost:3001/api/v1/system/on-demand-readiness
```

Response aman untuk dibaca operator karena hanya berisi status:

- `ready`
- `waiting_for_secret`
- `needs_device_validation`

Status ideal sebelum test device:

```json
{
  "overall_status": "ready_for_staging_validation"
}
```
