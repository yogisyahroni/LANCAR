# Environment Variables — Customer Google Auth + Zenziva OTP

Tambahkan variable berikut ke file `.env` (local) dan secrets management (production).

## Google OAuth 2.0

```env
# Client ID untuk Customer Web app (dari Google Cloud Console)
GOOGLE_CUSTOMER_WEB_CLIENT_ID=xxxxx.apps.googleusercontent.com

# Client ID untuk Android Customer app (dari Google Cloud Console)
GOOGLE_CUSTOMER_ANDROID_CLIENT_ID=xxxxx.apps.googleusercontent.com
```

## OTP Hashing Security

```env
# Pepper untuk HMAC-SHA256 hashing OTP codes
# WAJIB di production: minimal 32 karakter, harus acak/kuat
# Generate contoh: openssl rand -hex 32
OTP_HASH_PEPPER=ganti-dengan-string-acak-minimal-32-karakter-ini-sangat-penting
```

## OTP Provider Selection

```env
# "zenziva" = live Zenziva API
# Kosong atau apapun selain "zenziva" = dry-run (log ke stdout, tidak ada HTTP call)
OTP_PROVIDER=zenziva
```

## Zenziva API Credentials

```env
# URL base API Zenziva (cek dokumentasi Zenziva untuk endpoint terbaru)
ZENZIVA_BASE_URL=https://console.zenziva.net

# API Key dan User Key dari dashboard Zenziva
ZENZIVA_API_KEY=your-zenziva-api-key
ZENZIVA_USER_KEY=your-zenziva-user-key

# Nomor pengirim WhatsApp yang telah disetujui oleh Zenziva (WABA number)
ZENZIVA_WHATSAPP_SENDER=628xxxxxxxxxx

# Sender ID untuk SMS (opsional, tergantung paket Zenziva)
ZENZIVA_SMS_SENDER_ID=LANCAR

# Secret untuk validasi HMAC signature webhook dari Zenziva
# WAJIB di production
ZENZIVA_WEBHOOK_SECRET=ganti-dengan-secret-webhook-zenziva-yang-kuat

# Timeout HTTP ke Zenziva (ms). Default: connect=3000, request=7000
ZENZIVA_CONNECT_TIMEOUT_MS=3000
ZENZIVA_REQUEST_TIMEOUT_MS=7000
```

## OTP Behavior Configuration

```env
# TTL OTP dalam detik (default: 300 = 5 menit)
OTP_TTL_SECONDS=300

# Cooldown sebelum kirim ulang OTP (default: 60 detik)
OTP_RESEND_COOLDOWN_SECONDS=60

# Maksimum percobaan verify OTP (default: 5)
OTP_MAX_ATTEMPTS=5

# Channel default jika tidak ada preferensi ("whatsapp" atau "sms")
OTP_DEFAULT_CHANNEL=whatsapp
```

## Feature Flags (di Database)

Feature flags dikontrol melalui tabel `feature_flags` di database, bukan environment variables.
Default semua `false` (off). Aktifkan via SQL setelah deploy:

```sql
-- Aktifkan Google login untuk customer
UPDATE feature_flags SET is_enabled = true WHERE key = 'customer_google_login_enabled';

-- Aktifkan registrasi via Google (hati-hati: ini memungkinkan akun baru dibuat)
UPDATE feature_flags SET is_enabled = true WHERE key = 'customer_google_registration_enabled';

-- Aktifkan OTP provider live (pastikan ZENZIVA_* env vars sudah diset sebelumnya)
UPDATE feature_flags SET is_enabled = true WHERE key = 'otp_provider_live';
```

## New Endpoints

| Method | Path | Auth | Deskripsi |
|--------|------|------|-----------|
| POST | `/api/v1/auth/customer/google/start` | Public | Mulai OAuth flow, dapatkan state+nonce |
| POST | `/api/v1/auth/customer/google/complete` | Public | Submit ID token Google, dapatkan tokens atau instruksi |
| POST | `/api/v1/auth/customer/google/link` | JWT Required | Link akun Google ke akun customer yang sudah login |
| POST | `/api/v1/auth/customer/otp/send` | Public | Kirim OTP ke nomor HP customer |
| POST | `/api/v1/auth/customer/otp/verify` | Public | Verifikasi kode OTP |
| POST | `/api/v1/auth/providers/zenziva/webhook` | Public (HMAC signed) | Terima delivery status dari Zenziva |
