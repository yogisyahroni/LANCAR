# TEMBUS Merchant (android-app-merchant)

Aplikasi Android merchant untuk **Food Delivery** Tembus (FOOD-BIKE-028/036/049).
Dibangun dengan Jetpack Compose + Material 3, mengikuti struktur
`android-app-customer/` dengan package `com.tembus.merchant`.

## Fitur

| Fitur | Task | Status |
|---|---|---|
| Login email/password (auth-service generic) | FOOD-BIKE-028 | ✅ |
| Onboarding cara pakai (sekali setelah login) | FOOD-BIKE-028 | ✅ |
| Tab Pesanan: list order + filter status + accept/reject | FOOD-BIKE-017/021 | ✅ |
| Tab Menu: CRUD + toggle ketersediaan | FOOD-BIKE-018 | ✅ |
| Toggle Buka/Tutup toko | FOOD-BIKE-017 | ✅ |
| Struk pembelian + QR handover token | FOOD-BIKE-034/035 | ✅ |
| Cetak struk (PrintManager native, A6) | FOOD-BIKE-036 | ✅ |
| Pendaftaran merchant + status verifikasi | FOOD-BIKE-045/046/049 | ✅ |
| Profil + logout | — | ✅ |

## Backend yang dipakai

- **Auth**: `POST /api/v1/auth/customer/login/start` (auth-service, generic semua role)
- **Merchant**: `backend/merchant-service` (port 8085, di-proxy API Gateway `/api/v1/merchant`)
  - `GET/POST /merchant/profile` · `/register` · `/toggle-open`
  - `GET/POST /merchant/menu` · `PATCH/DELETE /merchant/menu/{id}` · `/menu/{id}/availability`
  - `GET /merchant/orders` · `POST /merchant/orders/{id}/accept` · `/reject`
  - `GET /merchant/orders/{id}/struk` (QR handover token)

Auth: Bearer token → API Gateway verifikasi JWT → set header `X-User-ID` untuk merchant-service.

## Build

```bash
export ANDROID_HOME=/c/NVPACK/android-sdk-windows   # atau SDK lu
./gradlew :app:assembleDebug
```

BASE_URL debug default `https://api.bawain.my.id/api/v1/` (bisa override via
`DEBUG_BASE_URL` di `.env` root LANCAR). Release butuh `BASE_URL` HTTPS + keystore.

## Struktur

```
app/src/main/java/com/tembus/merchant/
├── TEMBUSApplication.kt      # AppContainer (manual DI, tanpa Hilt)
├── MainActivity.kt
├── config/AppConfig.kt
├── data/
│   ├── api/                  # TEMBUSApiService, ApiClient, AuthInterceptor
│   ├── model/                # AuthModels, MerchantModels (Gson)
│   ├── onboarding/           # DataStore flag onboarding
│   ├── repository/           # AuthRepository, MerchantRepository
│   └── session/              # AuthSessionManager (EncryptedSharedPreferences)
└── ui/
    ├── MainScreen.kt         # bottom nav: Pesanan/Menu/Profil
    ├── navigation/AppNavHost.kt
    ├── screens/
    │   ├── auth/             # Login
    │   ├── onboarding/       # Onboarding 4 halaman
    │   ├── home/             # Orders list + accept/reject + toggle open
    │   ├── menu/             # CRUD menu
    │   ├── struk/            # Struk + QR + print
    │   ├── profile/          # Profil + verifikasi + logout
    │   └── registration/     # Daftar merchant
    └── theme/                # Brand Tembus (M3 light/dark)
```
