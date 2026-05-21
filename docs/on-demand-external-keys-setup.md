# On-Demand External Keys Setup

Dokumen ini memastikan infra on-demand sudah siap dan deployment berikutnya hanya perlu mengisi secret/API key.

## Required Env

Set env ini di staging dan production:

- `GOOGLE_MAPS_API_KEY`: Google Maps key utama.
- `GOOGLE_ROUTES_API_KEY`: key backend untuk Google Routes API. Jika kosong, backend memakai `GOOGLE_MAPS_API_KEY`.
- `GOOGLE_DIRECTIONS_API_KEY`: opsional untuk fallback legacy Directions API.
- `GOOGLE_ROUTES_API_URL`: opsional untuk test/staging mock. Default `https://routes.googleapis.com/directions/v2:computeRoutes`.
- `GOOGLE_ROUTES_ALLOWED_HOSTS`: allowlist host endpoint Routes API. Default hanya `routes.googleapis.com`, localhost, dan host Docker lokal.
- `GOOGLE_ROUTES_TIMEOUT_MS`: timeout route provider. Default 2800 ms.
- `GOOGLE_DIRECTIONS_LEGACY_FALLBACK_DISABLED`: set `true` jika staging ingin mematikan fallback Directions legacy.
- `FIREBASE_SERVICE_ACCOUNT`: JSON service account Firebase Admin SDK dalam format satu baris.
- `FIREBASE_PROJECT_ID`: metadata project Firebase.

Jangan commit value asli ke Git. Simpan di GitHub Actions secrets, server env, atau secret manager.

## Google Maps Routes / Directions

1. Buka Google Cloud Console untuk project LANCAR.
2. Aktifkan Routes API.
3. Aktifkan billing dan quota alert.
4. Buat API key khusus backend staging/production.
5. Restrict key untuk API yang diperlukan, minimal Routes API. Aktifkan Directions API hanya jika fallback legacy masih dipakai.
6. Isi `GOOGLE_ROUTES_API_KEY` atau `GOOGLE_MAPS_API_KEY`.
7. Untuk layanan motor, backend memakai travel mode `TWO_WHEELER` saat provider aktif Google. Jika mode ini tidak tersedia pada region/request tertentu, backend retry ke `DRIVE` dan mencatat `fallback_reason`.
8. Untuk LANCAR Mobil, backend memakai travel mode `DRIVE`.
9. Prioritas dan Instant memakai preference traffic-aware optimal; layanan lain memakai traffic-aware standar.

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

Jika key belum ada atau provider down, backend tetap memakai fallback ETA haversine terlabel agar customer tracking tidak mati. Fallback ini bukan sumber pricing final kecuali emergency policy diaktifkan.

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

## Device Validation

Setelah readiness sudah `ready_for_staging_validation`, jalankan checklist:

- `docs/on-demand-fcm-staging-checklist.md`

Validasi wajib:

- customer login dan register FCM token.
- courier login dan register FCM token.
- order on-demand dibuat customer.
- offer masuk ke courier foreground/background/killed app.
- customer tracking update dari offer accepted sampai POD.
