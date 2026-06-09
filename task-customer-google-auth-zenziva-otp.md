# Task: Customer Google Login + Zenziva OTP Infrastructure

Tanggal: 2026-06-09
Area: Customer Web, Android Customer App, Auth Service, API Gateway, Database, OTP Provider Infrastructure
Status: Proposed / belum dikerjakan
Priority: P0 security and auth foundation
Owner: Engineering

## Ringkasan

Bangun login dan registrasi customer dengan Google untuk customer web dan Android customer app, dengan satu identitas customer yang sama di seluruh surface. OTP memakai Zenziva sebagai infrastruktur provider: WhatsApp OTP sebagai jalur utama dan SMS sebagai fallback jika WhatsApp gagal, tidak terdaftar, timeout, atau provider mengembalikan status tidak terkirim.

Scope ini khusus customer. Admin dan kurir tidak masuk dalam scope Google login ini. Courier app boleh tetap memakai auth kurir yang sudah ada.

Final state yang diinginkan:

- Customer yang daftar lewat web dengan Google bisa login di Android customer app tanpa membuat akun duplikat.
- Customer yang daftar lewat Android dengan Google bisa login di customer web dengan akun yang sama.
- Device baru tetap membutuhkan step-up OTP sesuai policy trusted device.
- OTP dikirim via Zenziva WhatsApp, fallback SMS jika dibutuhkan.
- Tidak ada OTP plaintext di database, log, analytics, crash report, atau response API.
- Tidak ada customer-facing copy yang menyebut detail provider internal seperti "Zenziva error" atau "Google token invalid raw".

## Keputusan Produk dan Security

- Google login membuktikan kepemilikan email, bukan kepemilikan nomor HP.
- OTP WA/SMS membuktikan kontrol nomor HP dan digunakan untuk registration completion, trusted device baru, dan high-risk login.
- Untuk device yang sudah trusted, customer tidak perlu OTP setiap login agar UX tidak berat.
- Untuk device baru, OTP WA/SMS lebih aman daripada email OTP karena email sudah menjadi channel utama Google login.
- Email OTP hanya boleh menjadi recovery fallback jika nomor HP belum tersedia atau nomor tidak bisa diverifikasi, dan harus diberi risk flag.
- WhatsApp OTP tidak boleh memakai unofficial gateway, QR session, atau scraping. Gunakan provider resmi melalui Zenziva.
- Backend harus fail closed: jika OTP wajib tetapi provider gagal total, jangan bypass OTP.
- Provider name, raw error, message id, dan credential status tidak ditampilkan ke customer.

## Current State Repo

Hasil audit awal di repo:

- Backend auth-service sudah punya endpoint dasar:
  - `POST /api/v1/auth/otp/send`
  - `POST /api/v1/auth/otp/verify`
- Feature flag customer OTP sudah ada:
  - `customer_auth_otp_required`
- Trusted device table sudah ada:
  - `auth_trusted_devices`
- Android customer app sudah punya API contract OTP:
  - `TEMBUSApiService.sendOtp`
  - `TEMBUSApiService.verifyOtp`
- Customer web login/register sudah memakai OTP endpoint.
- Android customer login screen sudah punya Google button, tetapi masih placeholder dan belum fungsional.
- OTP repository saat ini masih perlu dikeraskan agar OTP tidak disimpan plaintext.

## Target Flow

### Flow A - Customer Baru Daftar Web dengan Google

1. Customer klik `Masuk dengan Google` atau `Daftar dengan Google`.
2. Customer web memulai OAuth/OIDC flow dengan PKCE, `state`, dan `nonce`.
3. Backend menerima ID token atau authorization code dari web.
4. Backend memverifikasi token Google:
   - issuer valid,
   - audience sesuai `GOOGLE_CUSTOMER_WEB_CLIENT_ID`,
   - token belum expired,
   - nonce cocok,
   - email terverifikasi,
   - subject stabil.
5. Jika belum ada identity Google:
   - backend membuat auth transaction,
   - meminta nomor HP jika belum tersedia,
   - mengirim OTP WhatsApp via Zenziva.
6. Jika WhatsApp gagal atau tidak delivered sesuai policy, backend fallback ke SMS.
7. Customer memasukkan OTP.
8. Backend memverifikasi OTP, membuat customer account aktif, menghubungkan Google identity, membuat session, dan menandai device/browser sebagai trusted.
9. Customer diarahkan ke dashboard.

### Flow B - Customer yang Sudah Daftar Web Login di Android

1. Customer klik `Masuk dengan Google` di Android customer app.
2. Android memakai Credential Manager / Sign in with Google untuk mengambil ID token.
3. Android mengirim ID token, `device_id`, dan device info ke backend.
4. Backend memverifikasi token dengan audience Android customer.
5. Backend mencari `customer_auth_identities` berdasarkan provider `google` dan Google subject.
6. Jika user ditemukan dan device sudah trusted:
   - backend menerbitkan access token dan refresh token.
7. Jika device belum trusted:
   - backend mengembalikan status `requires_step_up_otp`,
   - mengirim OTP WA/SMS ke nomor verified milik customer,
   - setelah OTP benar, backend menerbitkan session dan menambahkan trusted device.

### Flow C - Existing Password Customer Link Google

1. Customer yang sudah punya akun email/password login seperti biasa.
2. Customer memilih `Hubungkan Google` di profil atau saat mencoba login Google.
3. Jika email Google sama dengan email akun existing:
   - backend tetap wajib meminta OTP WA/SMS sebelum link,
   - jangan hanya mengandalkan email match.
4. Backend membuat row identity provider `google`.
5. Login berikutnya bisa memakai Google atau password.

### Flow D - Nomor HP Belum Verified

1. Google login berhasil, tetapi customer belum punya nomor HP verified.
2. Backend mengembalikan status `requires_phone`.
3. UI meminta nomor HP dalam format E.164 atau format lokal yang dinormalisasi ke `+62`.
4. Backend mengirim OTP WA/SMS.
5. Account baru aktif setelah OTP phone benar.

### Flow E - Provider OTP Bermasalah

1. Jika Zenziva WhatsApp timeout, request denied, atau status failed:
   - backend mencoba SMS fallback sesuai policy.
2. Jika WA dan SMS gagal:
   - backend mengembalikan pesan aman: `Kode belum dapat dikirim. Coba lagi beberapa saat.`
3. Backend mencatat alert internal, bukan membocorkan detail provider ke customer.

## API Contract Baru

### `POST /api/v1/auth/customer/google/start`

Dipakai web untuk membuat auth transaction yang aman.

Request:

```json
{
  "platform": "web",
  "device_id": "browser-device-id",
  "redirect_uri": "https://app.bawain.my.id/auth/google/callback"
}
```

Response:

```json
{
  "transaction_id": "uuid",
  "state": "opaque-state",
  "nonce": "opaque-nonce",
  "authorization_url": "https://accounts.google.com/..."
}
```

Security:

- `state` dan `nonce` hanya disimpan dalam bentuk hash.
- Transaction expired maksimal 10 menit.
- Rate limit per IP, device, dan identifier.

### `POST /api/v1/auth/customer/google/complete`

Dipakai web dan Android untuk menyelesaikan Google login.

Request:

```json
{
  "platform": "web|android_customer",
  "transaction_id": "uuid-optional-for-web",
  "id_token": "google-id-token",
  "nonce": "opaque-nonce-optional",
  "device_id": "device-id",
  "device_info": {
    "model": "Pixel 6",
    "os": "Android 15",
    "app_version": "1.0.70"
  }
}
```

Response success:

```json
{
  "status": "authenticated",
  "access_token": "jwt",
  "refresh_token": "opaque-refresh-token",
  "user": {
    "id": "uuid",
    "email": "customer@example.com",
    "phone_number": "+6281234567890",
    "full_name": "Tembus Customer"
  },
  "trusted_device": true
}
```

Response step-up:

```json
{
  "status": "requires_step_up_otp",
  "transaction_id": "uuid",
  "masked_recipient": "+62******7890",
  "preferred_channel": "whatsapp",
  "fallback_channel": "sms",
  "expires_in_seconds": 300
}
```

Response requires phone:

```json
{
  "status": "requires_phone",
  "transaction_id": "uuid",
  "email": "customer@example.com",
  "full_name": "Tembus Customer"
}
```

### `POST /api/v1/auth/customer/otp/send`

Request:

```json
{
  "transaction_id": "uuid",
  "purpose": "registration_phone|new_device|link_google|password_reset",
  "phone_number": "+6281234567890",
  "preferred_channel": "whatsapp"
}
```

Response:

```json
{
  "status": "sent",
  "challenge_id": "uuid",
  "channel": "whatsapp",
  "masked_recipient": "+62******7890",
  "expires_in_seconds": 300,
  "resend_after_seconds": 60
}
```

### `POST /api/v1/auth/customer/otp/verify`

Request:

```json
{
  "transaction_id": "uuid",
  "challenge_id": "uuid",
  "otp_code": "123456",
  "device_id": "device-id"
}
```

Response:

```json
{
  "status": "authenticated",
  "access_token": "jwt",
  "refresh_token": "opaque-refresh-token",
  "trusted_device": true
}
```

### `POST /api/v1/auth/customer/google/link`

Dipakai customer yang sudah login untuk menghubungkan Google identity.

Request:

```json
{
  "id_token": "google-id-token",
  "device_id": "device-id"
}
```

Response:

```json
{
  "status": "requires_step_up_otp",
  "transaction_id": "uuid",
  "masked_recipient": "+62******7890"
}
```

### `POST /api/v1/auth/providers/zenziva/webhook`

Dipakai untuk menerima delivery status.

Security:

- Validasi signature webhook.
- Reject payload tanpa timestamp valid.
- Idempotent berdasarkan provider message id.
- Jangan log payload mentah jika mengandung nomor HP.

## Database dan Migration

### `customer_auth_identities`

Menyimpan login provider eksternal.

Kolom:

- `id UUID PRIMARY KEY`
- `user_id UUID NOT NULL`
- `provider TEXT NOT NULL`
- `provider_subject TEXT NOT NULL`
- `provider_email TEXT`
- `email_verified BOOLEAN NOT NULL DEFAULT false`
- `linked_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- `last_used_at TIMESTAMPTZ`
- `revoked_at TIMESTAMPTZ`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`

Index:

- Unique partial index `(provider, provider_subject)` where `revoked_at IS NULL`.
- Index `(user_id, provider)`.

Catatan:

- `provider_subject` jangan pernah ditulis ke log.
- Jika perlu privacy lebih kuat, simpan `provider_subject_hash` untuk lookup dan simpan raw subject terenkripsi.

### `customer_auth_transactions`

Menyimpan transaksi auth sementara.

Kolom:

- `id UUID PRIMARY KEY`
- `type TEXT NOT NULL`
- `status TEXT NOT NULL`
- `provider TEXT`
- `user_id UUID`
- `identifier_hash TEXT`
- `state_hash TEXT`
- `nonce_hash TEXT`
- `device_id_hash TEXT`
- `platform TEXT NOT NULL`
- `expires_at TIMESTAMPTZ NOT NULL`
- `consumed_at TIMESTAMPTZ`
- `metadata JSONB NOT NULL DEFAULT '{}'::jsonb`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`

Index:

- `(status, expires_at)`
- `(identifier_hash, created_at)`
- `(device_id_hash, created_at)`

### `customer_otp_challenges`

Sumber kebenaran OTP baru. Jangan lanjutkan model OTP plaintext.

Kolom:

- `id UUID PRIMARY KEY`
- `transaction_id UUID NOT NULL`
- `user_id UUID`
- `purpose TEXT NOT NULL`
- `identifier_hash TEXT NOT NULL`
- `recipient_mask TEXT NOT NULL`
- `channel TEXT NOT NULL`
- `provider TEXT NOT NULL`
- `code_hash TEXT NOT NULL`
- `attempts INT NOT NULL DEFAULT 0`
- `max_attempts INT NOT NULL DEFAULT 5`
- `expires_at TIMESTAMPTZ NOT NULL`
- `used_at TIMESTAMPTZ`
- `locked_until TIMESTAMPTZ`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`

Index:

- `(transaction_id, expires_at)`
- `(identifier_hash, created_at)`
- `(provider, channel, created_at)`

### `customer_otp_deliveries`

Audit pengiriman OTP.

Kolom:

- `id UUID PRIMARY KEY`
- `challenge_id UUID NOT NULL`
- `provider TEXT NOT NULL`
- `channel TEXT NOT NULL`
- `provider_message_id TEXT`
- `status TEXT NOT NULL`
- `error_code TEXT`
- `sent_at TIMESTAMPTZ`
- `delivered_at TIMESTAMPTZ`
- `failed_at TIMESTAMPTZ`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`

Index:

- Unique partial index `(provider, provider_message_id)` where `provider_message_id IS NOT NULL`.
- `(challenge_id, created_at)`.

## Zenziva Infrastructure

### Provider Interface

Buat interface provider-neutral:

```go
type OTPProvider interface {
    SendOTP(ctx context.Context, request OTPSendRequest) (OTPSendResult, error)
    CheckDeliveryStatus(ctx context.Context, providerMessageID string) (OTPDeliveryStatus, error)
    VerifyWebhookSignature(payload []byte, signature string, timestamp string) error
}
```

Request harus membawa:

- recipient phone normalized,
- channel `whatsapp|sms`,
- purpose,
- template id,
- idempotency key,
- correlation id.

Result harus membawa:

- provider message id,
- accepted/sent status,
- retryable flag,
- normalized error code,
- latency.

### Environment Variables

Tambahkan ke `.env.example`, `.env.production.example`, staging host, dan secret manager:

```env
OTP_PROVIDER=zenziva
OTP_DELIVERY_MODE=dry_run
OTP_DEFAULT_CHANNEL=whatsapp
OTP_FALLBACK_CHANNEL=sms
OTP_TTL_SECONDS=300
OTP_RESEND_COOLDOWN_SECONDS=60
OTP_MAX_ATTEMPTS=5
OTP_DAILY_BUDGET_IDR=0

ZENZIVA_BASE_URL=
ZENZIVA_API_KEY=
ZENZIVA_USER_KEY=
ZENZIVA_WHATSAPP_SENDER=
ZENZIVA_SMS_SENDER_ID=
ZENZIVA_WEBHOOK_SECRET=
ZENZIVA_CONNECT_TIMEOUT_MS=3000
ZENZIVA_REQUEST_TIMEOUT_MS=7000
```

Catatan:

- Nama credential final harus disesuaikan dengan dokumentasi/dashboard Zenziva yang dipakai.
- Secret tidak boleh committed.
- `.env` lokal boleh dipakai untuk dev di mesin ini, tetapi jangan masuk Git.
- Staging harus memakai secret host atau GitHub Actions secret, bukan hardcoded source.

### Fallback Rules

- Coba WhatsApp OTP lebih dulu.
- Fallback SMS hanya jika:
  - WhatsApp provider timeout,
  - provider mengembalikan non-deliverable,
  - nomor tidak terdaftar WhatsApp,
  - circuit breaker WhatsApp terbuka.
- Jangan fallback SMS jika:
  - nomor invalid,
  - user sedang rate-limited,
  - challenge expired,
  - request terdeteksi abuse.

## Google Setup Steps

### Google Cloud Console

1. Buat atau pilih project Google Cloud untuk TEMBUS customer.
2. Aktifkan OAuth consent screen.
3. Isi app name, support email, authorized domains, privacy policy, dan terms URL.
4. Buat OAuth Client untuk customer web:
   - application type: Web application,
   - authorized JavaScript origins: `https://app.bawain.my.id`,
   - authorized redirect URI: `https://app.bawain.my.id/auth/google/callback`.
5. Buat OAuth Client untuk Android customer:
   - package name: `com.tembus.customer`,
   - SHA-1 dan SHA-256 untuk debug, staging, dan release signing key.
6. Simpan client id ke secret/env:

```env
GOOGLE_CUSTOMER_WEB_CLIENT_ID=
GOOGLE_CUSTOMER_WEB_CLIENT_SECRET=
GOOGLE_CUSTOMER_ANDROID_CLIENT_ID=
GOOGLE_CUSTOMER_ALLOWED_DOMAINS=app.bawain.my.id
```

7. Backend wajib validasi ID token, bukan hanya decode payload.
8. Android wajib memakai Credential Manager / Google Identity, bukan WebView OAuth.
9. Tambahkan feature flag:

```env
CUSTOMER_GOOGLE_LOGIN_ENABLED=false
CUSTOMER_GOOGLE_REGISTRATION_ENABLED=false
CUSTOMER_GOOGLE_LINKING_ENABLED=false
CUSTOMER_NEW_DEVICE_OTP_REQUIRED=true
```

## Zenziva Setup Steps

1. Buat akun Zenziva dan aktifkan produk WhatsApp OTP dan SMS OTP.
2. Daftarkan sender WhatsApp resmi dan template OTP.
3. Tunggu template WhatsApp approved.
4. Siapkan SMS sender id jika tersedia.
5. Konfigurasi webhook delivery status ke:
   - `https://api.bawain.my.id/api/v1/auth/providers/zenziva/webhook`
6. Simpan credential ke:
   - local `.env`,
   - staging host env,
   - GitHub Actions secret jika pipeline butuh test live/smoke.
7. Mulai dengan `OTP_DELIVERY_MODE=dry_run`.
8. Jalankan integration test dengan mock Zenziva.
9. Ubah staging ke live untuk nomor internal saja.
10. Uji WA success, WA gagal lalu SMS fallback, resend cooldown, expired OTP, dan max attempts.
11. Set budget guard sebelum dibuka ke user real.

## Backend Tasks

### P0 - Auth Contract dan Security Foundation

- [ ] Buat migration reversible untuk `customer_auth_identities`.
- [ ] Buat migration reversible untuk `customer_auth_transactions`.
- [ ] Buat migration reversible untuk `customer_otp_challenges`.
- [ ] Buat migration reversible untuk `customer_otp_deliveries`.
- [ ] Tambahkan index sesuai query lookup dan audit.
- [ ] Tambahkan repository untuk external identity lookup/link/revoke.
- [ ] Tambahkan repository auth transaction dengan expiry dan consume-once.
- [ ] Tambahkan OTP challenge repository dengan hash verification.
- [ ] Migrasikan OTP customer agar tidak memakai code plaintext dari `otp_logs`.
- [ ] Implement OTP hash menggunakan HMAC-SHA256 atau Argon2id dengan pepper dari env.
- [ ] Tambahkan env `OTP_HASH_PEPPER`; release build/backend production wajib gagal jika kosong.
- [ ] Implement Google token verifier dengan JWKS cache dan strict audience.
- [ ] Implement endpoint `google/start`.
- [ ] Implement endpoint `google/complete`.
- [ ] Implement endpoint `customer/otp/send`.
- [ ] Implement endpoint `customer/otp/verify`.
- [ ] Implement endpoint `google/link`.
- [ ] Tambahkan rate limit per IP, device id, phone hash, email hash, dan transaction id.
- [ ] Tambahkan anti-enumeration response untuk email/phone tidak ditemukan.
- [ ] Tambahkan audit log untuk Google login, Google link, OTP send, OTP verify, OTP fallback, trusted device creation, dan revoke.
- [ ] Pastikan refresh token rotation tetap berlaku setelah Google login.
- [ ] Pastikan session customer web dan mobile memakai user id yang sama.

### P1 - Zenziva Provider Adapter

- [ ] Buat provider interface `OTPProvider`.
- [ ] Buat `DryRunOTPProvider` untuk local/dev/test.
- [ ] Buat `ZenzivaOTPProvider`.
- [ ] Tambahkan HTTP client dengan timeout, retry terbatas, circuit breaker, dan idempotency key.
- [ ] Implement WhatsApp OTP send.
- [ ] Implement SMS OTP send.
- [ ] Implement fallback WhatsApp ke SMS.
- [ ] Implement webhook delivery status.
- [ ] Implement signature validation webhook.
- [ ] Tambahkan log redaction untuk phone number, OTP, provider payload, dan provider message id jika sensitif.
- [ ] Tambahkan metric dan alert provider.

### P2 - Trusted Device dan Risk Policy

- [ ] Normalisasi device id dan simpan hash device id.
- [ ] Tambahkan expiry trusted device, rekomendasi awal 90 hari.
- [ ] Tambahkan revoke trusted device per user.
- [ ] Tambahkan revoke all trusted devices dari profil/security.
- [ ] Tambahkan risk engine minimal:
  - new device,
  - suspicious IP velocity,
  - many OTP attempts,
  - provider delivery anomalies.
- [ ] Jika risk tinggi, wajib step-up OTP meskipun Google login valid.

## Customer Web Tasks

### P0 - Login/Register UI dan API Wiring

- [ ] Aktifkan tombol `Masuk dengan Google` di login page.
- [ ] Tambahkan tombol `Daftar dengan Google` di register page.
- [ ] Implement callback route `/auth/google/callback`.
- [ ] Simpan `state` dan `nonce` secara aman selama transaksi.
- [ ] Tangani status backend:
  - `authenticated`,
  - `requires_phone`,
  - `requires_step_up_otp`,
  - `requires_link_confirmation`,
  - `blocked`.
- [ ] Tambahkan form nomor HP jika backend meminta `requires_phone`.
- [ ] Tambahkan OTP input dengan resend cooldown.
- [ ] Copy UI harus user-friendly:
  - "Kami mengirim kode ke WhatsApp kamu."
  - "Jika WhatsApp tidak tersedia, kode akan dikirim lewat SMS."
- [ ] Jangan tampilkan provider/debug error.
- [ ] Setelah auth sukses, redirect ke dashboard atau intended URL.

### P1 - Account Linking dan Device Management

- [ ] Tambahkan section `Login & Keamanan` di profil customer web.
- [ ] Tambahkan status Google linked/unlinked.
- [ ] Tambahkan CTA `Hubungkan Google`.
- [ ] Tambahkan list trusted devices.
- [ ] Tambahkan `Keluar dari perangkat ini`.
- [ ] Tambahkan `Cabut semua perangkat` dengan OTP confirmation.

## Android Customer App Tasks

### P0 - Google Login Fungsional

- [ ] Tambahkan dependency Credential Manager dan Google ID.
- [ ] Tambahkan `GOOGLE_CUSTOMER_ANDROID_CLIENT_ID` ke BuildConfig.
- [ ] Pastikan client id tidak hardcoded di Kotlin.
- [ ] Ganti placeholder Google button di `LoginScreen` menjadi flow nyata.
- [ ] Tambahkan API model untuk Google complete response.
- [ ] Tambahkan method `AuthRepository.loginWithGoogle`.
- [ ] Tambahkan state `GoogleLoading`, `RequiresPhone`, `RequiresOtp`, dan `Authenticated`.
- [ ] Reuse OTP screen untuk step-up login dan registration completion.
- [ ] Simpan token di secure storage yang sudah dipakai app.
- [ ] Pastikan user web dan mobile resolve ke user id yang sama.

### P1 - Device Trust dan Recovery UX

- [ ] Kirim device id dan device info pada login Google.
- [ ] Tampilkan copy device baru jika OTP required.
- [ ] Resend OTP dengan cooldown.
- [ ] Jika WA gagal dan SMS fallback dipakai, tampilkan copy aman tanpa menyebut error provider.
- [ ] Jika user cancel Google picker, jangan tampilkan error merah.
- [ ] Jika Google Play Services/Credential Manager tidak tersedia, tampilkan fallback email/password.

## API Gateway Tasks

- [ ] Tambahkan route allowlist untuk endpoint customer Google auth.
- [ ] Tambahkan route allowlist untuk endpoint OTP customer baru.
- [ ] Pastikan auth middleware tidak mewajibkan JWT untuk pre-auth endpoints.
- [ ] Tambahkan security headers dan request body limit.
- [ ] Tambahkan correlation id untuk tracing.
- [ ] Pastikan API gateway tidak log token/OTP/body sensitif.

## Admin and Observability Tasks

- [ ] Tambahkan status provider OTP di admin system health.
- [ ] Tambahkan dashboard kecil untuk OTP delivery:
  - sent,
  - delivered,
  - failed,
  - fallback rate,
  - estimated cost.
- [ ] Tambahkan audit view untuk Google link/unlink dan trusted device.
- [ ] Tambahkan feature flag UI:
  - Google customer login,
  - Google customer registration,
  - require OTP for new device,
  - OTP provider live/dry run.
- [ ] Tambahkan budget guard OTP per hari dan per bulan.

## Security Requirements

- [ ] OTP tidak boleh disimpan plaintext.
- [ ] OTP tidak boleh muncul di log, telemetry, crash report, notification payload, atau response API.
- [ ] Token Google harus diverifikasi server-side.
- [ ] Jangan percaya email claim tanpa `email_verified=true`.
- [ ] Jangan link akun hanya berdasarkan email tanpa OTP step-up.
- [ ] `state` dan `nonce` wajib one-time use dan expired.
- [ ] Semua pre-auth endpoints wajib rate-limited.
- [ ] OTP verify wajib membatasi attempt dan lock challenge setelah gagal berulang.
- [ ] Response invalid OTP tidak boleh membedakan "nomor salah", "kode salah", atau "akun tidak ada".
- [ ] Semua input phone/email harus dinormalisasi dan divalidasi.
- [ ] Semua DB write multi-step harus transaction.
- [ ] Trusted device id harus di-hash.
- [ ] PII harus direduksi atau di-mask di audit.
- [ ] Secrets hanya lewat env/secret manager.
- [ ] Production harus gagal start jika feature live aktif tetapi secret provider kosong.

## Metrics and Alerts

Metrics:

- `auth_google_login_total`
- `auth_google_registration_total`
- `auth_google_link_total`
- `auth_google_failure_total`
- `auth_new_device_step_up_total`
- `otp_send_total`
- `otp_verify_total`
- `otp_fallback_total`
- `otp_delivery_latency_ms`
- `otp_provider_error_total`
- `otp_cost_estimate_idr_total`

Alerts:

- OTP send failure rate tinggi.
- OTP fallback SMS rate tinggi.
- OTP verify failure spike.
- OTP provider circuit breaker open.
- OTP cost near daily/monthly budget.
- Google token validation failures spike.
- Suspicious device creation spike.

## Test Plan

### Backend

- [ ] Migration up/down hijau.
- [ ] Unit test Google token verifier:
  - valid token,
  - wrong audience,
  - expired token,
  - invalid nonce,
  - email not verified.
- [ ] Unit test auth transaction:
  - one-time consume,
  - expired transaction,
  - replay blocked.
- [ ] Unit test OTP challenge:
  - hash verify success,
  - wrong code,
  - expired code,
  - max attempts lock,
  - used code cannot be reused.
- [ ] Unit test Zenziva dry-run provider.
- [ ] Unit test Zenziva live adapter with mocked HTTP.
- [ ] Unit test WA to SMS fallback.
- [ ] Integration test web Google register to phone OTP.
- [ ] Integration test mobile Google login existing web user.
- [ ] Integration test trusted device bypass.
- [ ] Integration test new device requires OTP.

Commands:

```powershell
cd backend/auth-service
go test ./...
```

### Customer Web

- [ ] Build customer web.
- [ ] Playwright: Google login mocked, authenticated.
- [ ] Playwright: Google login requires phone.
- [ ] Playwright: OTP send and verify.
- [ ] Playwright: WA fail then SMS fallback.
- [ ] Playwright: existing customer link Google.
- [ ] Playwright: no provider/debug copy appears.

Commands:

```powershell
cd frontend
npm run build
```

### Android Customer

- [ ] Debug build hijau.
- [ ] Unit test auth view model Google states.
- [ ] Emulator QA Google login success.
- [ ] Emulator QA new device OTP.
- [ ] Emulator QA existing web account login with same user id.
- [ ] Emulator QA Google picker cancel.
- [ ] Emulator QA fallback email/password if Google unavailable.

Commands:

```powershell
cd android-app-customer
.\gradlew.bat :app:assembleDebug
.\gradlew.bat :app:testDebugUnitTest
```

### Security

- [ ] Secret scan tidak menemukan Google client secret, Zenziva key, OTP, token.
- [ ] Log scan tidak menemukan OTP plaintext.
- [ ] DB check tidak menemukan OTP plaintext baru.
- [ ] Rate limit test untuk OTP send dan verify.
- [ ] Replay test untuk transaction, nonce, dan OTP.
- [ ] No user enumeration test.

## Acceptance Criteria

- [ ] Customer web bisa daftar dengan Google, verifikasi nomor HP via OTP, lalu masuk dashboard.
- [ ] Android customer bisa login dengan Google memakai akun yang sama dari web.
- [ ] Customer yang sudah punya password account bisa link Google setelah OTP step-up.
- [ ] Device baru memicu OTP WA/SMS sesuai policy.
- [ ] Trusted device tidak meminta OTP setiap login normal.
- [ ] OTP WA primary dan SMS fallback berjalan di staging.
- [ ] OTP dry-run tersedia untuk local/dev/test.
- [ ] OTP plaintext tidak tersimpan dan tidak muncul di log.
- [ ] Semua endpoint pre-auth rate-limited.
- [ ] Customer UI tidak menampilkan detail provider internal.
- [ ] Backend, frontend, dan Android customer build/test hijau.

## Open Questions

- Apakah template WhatsApp OTP Zenziva sudah approved?
- Apakah nomor HP canonical memakai format E.164 `+62...` di semua surface?
- Apakah email OTP boleh menjadi fallback recovery production jika nomor HP hilang?
- Berapa budget OTP harian/bulanan untuk staging dan production?
- Berapa masa berlaku trusted device? Rekomendasi awal: 90 hari.
- Apakah customer boleh melihat dan revoke semua trusted device dari profil? Rekomendasi: ya.

## Recommended Execution Order

### P0 - Backend Auth Foundation

- [ ] Migration identity, transaction, OTP challenge, OTP delivery.
- [ ] OTP hashing and no-plaintext migration path.
- [ ] Google verifier.
- [ ] Google complete endpoint.
- [ ] Customer OTP send/verify endpoint.
- [ ] Dry-run OTP provider.
- [ ] Rate limit and audit.
- [ ] Backend tests.

### P1 - Zenziva Live Infrastructure

- [ ] Zenziva adapter.
- [ ] WhatsApp OTP send.
- [ ] SMS fallback.
- [ ] Webhook.
- [ ] Metrics and alert.
- [ ] Staging smoke with internal numbers.

### P2 - Customer Web

- [ ] Web Google login/register.
- [ ] Callback route.
- [ ] Phone capture.
- [ ] OTP screen.
- [ ] Account linking.
- [ ] Web tests.

### P3 - Android Customer

- [ ] Credential Manager dependency.
- [ ] Google button real flow.
- [ ] AuthRepository Google login.
- [ ] OTP step-up integration.
- [ ] Secure token persistence.
- [ ] Android tests and emulator QA.

### P4 - Admin, Observability, and Release

- [ ] Feature flag UI.
- [ ] Provider health and cost panel.
- [ ] Trusted device admin/user view.
- [ ] Staging rollout.
- [ ] Production readiness checklist.

## Referensi Implementasi

- Google Identity backend validation: https://developers.google.com/identity/sign-in/web/backend-auth
- Android Credential Manager Sign in with Google: https://developer.android.com/identity/sign-in/credential-manager-siwg-implementation
- OWASP Authentication Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- OWASP Forgot Password Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html
- Zenziva dashboard/docs: gunakan dokumentasi resmi dari akun Zenziva yang dipakai project.
