# On-Demand External Keys Setup

Dokumen ini memastikan infra on-demand sudah siap dan deployment berikutnya hanya perlu mengisi secret/API key.

## Required Env

Set env ini di staging dan production:

- `GOOGLE_MAPS_API_KEY`: Google Maps key utama.
- `GOOGLE_DIRECTIONS_API_KEY`: opsional. Jika kosong, backend memakai `GOOGLE_MAPS_API_KEY`.
- `FIREBASE_SERVICE_ACCOUNT`: JSON service account Firebase Admin SDK dalam format satu baris.
- `FIREBASE_PROJECT_ID`: metadata project Firebase.

Jangan commit value asli ke Git. Simpan di GitHub Actions secrets, server env, atau secret manager.

## Google Maps / Directions

1. Buka Google Cloud Console untuk project LANCAR.
2. Aktifkan Directions API.
3. Aktifkan billing dan quota alert.
4. Buat API key khusus backend staging/production.
5. Restrict key untuk API yang diperlukan, minimal Directions API.
6. Isi `GOOGLE_MAPS_API_KEY` atau `GOOGLE_DIRECTIONS_API_KEY`.

Backend on-demand tracking akan mengirim:

- `eta`
- `eta_minutes`
- `route_polyline`
- `route_provider`

Jika key belum ada atau provider down, backend tetap memakai fallback ETA haversine agar customer tracking tidak mati.

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
