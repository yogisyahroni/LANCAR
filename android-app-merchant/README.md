# TEMBUS — Android App Merchant

Aplikasi Android untuk merchant/mitra TEMBUS (FOOD-BIKE-028/036/049).

<!-- ci-trigger: test Telegram notify (android-apps.yml) 2026-08-14 -->

## Fitur
- Login (endpoint auth generic)
- Onboarding 4 halaman
- Tab Pesanan: accept/reject, toggle buka toko
- Tab Menu: CRUD menu
- Struk: QR + print A6 (PrintManager native)
- Pendaftaran + status verifikasi

## Build
```bash
./gradlew assembleDebug          # debug APK
./gradlew assembleRelease -PversionCode=<n>   # release (butuh env signing)
```

## CI/CD
Pipeline `android-apps.yml` (Mobile Apps CI/CD) — matrix bersama courier & customer.
Merchant tidak pakai Firebase/TomTom → `needs_firebase=false`, `needs_maps=false`.

Release signing **optional**: set secrets `MERCHANT_RELEASE_KEYSTORE_BASE64`,
`MERCHANT_RELEASE_KEYSTORE_PASSWORD`, `MERCHANT_RELEASE_KEY_ALIAS`,
`MERCHANT_RELEASE_KEY_PASSWORD` → build signed release APK + AAB otomatis.
Tanpa secrets → warning + debug APK tetap di-upload.

## BASE_URL
- Debug: `https://api.bawain.my.id/api/v1/` (BuildConfig, bisa override via `DEBUG_BASE_URL` / `MOBILE_API_BASE_URL`)
- Release: wajib dari `MOBILE_API_BASE_URL` (validasi HTTPS di gradle)
