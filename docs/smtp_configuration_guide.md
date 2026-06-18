# Konfigurasi Sistem Pengiriman Email (SMTP) untuk OTP

Dokumen ini menjelaskan langkah-langkah yang diperlukan untuk mengonfigurasi layanan pengiriman email (SMTP) pada Backend (Auth Service). Layanan ini digunakan untuk mengirimkan kode OTP (One Time Password) kepada Mitra Kurir saat mereka menggunakan fitur **Lupa Password**.

---

## 1. Variabel Lingkungan (Environment Variables)

Backend memerlukan variabel *environment* berikut untuk dapat terhubung ke server SMTP Anda. Secara *default*, jika variabel ini **tidak diatur** (kosong), sistem akan otomatis masuk ke **Mode Mock** (Pesan OTP hanya akan dicetak ke *console/log terminal* tanpa benar-benar mengirim email).

Tambahkan konfigurasi berikut ke dalam file `.env` di lingkungan produksi (Production) atau Staging Anda:

```env
# Konfigurasi SMTP
SMTP_HOST="smtp.namaprovider.com"
SMTP_PORT="587"
SMTP_USERNAME="email_atau_username_smtp_anda"
SMTP_PASSWORD="password_atau_api_key_smtp_anda"

# Alamat Email Pengirim (Akan muncul sebagai "From" di email penerima)
SMTP_FROM_EMAIL="noreply@tembus.com"
```

---

## 2. Contoh Konfigurasi Provider SMTP Populer

Berikut adalah beberapa contoh konfigurasi jika Anda menggunakan layanan SMTP eksternal yang umum digunakan di industri:

### A. Gmail (Google Workspace / Personal)
Jika Anda menggunakan Gmail, Anda tidak boleh menggunakan password akun biasa. Anda **wajib** membuat *App Password* (Sandi Aplikasi).
* **SMTP_HOST**: `smtp.gmail.com`
* **SMTP_PORT**: `587`
* **SMTP_USERNAME**: `email.anda@gmail.com`
* **SMTP_PASSWORD**: `kode_app_password_16_karakter`

### B. AWS SES (Amazon Simple Email Service)
Pastikan domain atau email pengirim sudah diverifikasi di konsol AWS.
* **SMTP_HOST**: `email-smtp.ap-southeast-1.amazonaws.com` *(Sesuaikan dengan Region AWS Anda)*
* **SMTP_PORT**: `587`
* **SMTP_USERNAME**: `AKIAIOSFODNN7EXAMPLE` *(Gunakan kredensial SMTP AWS SES, bukan IAM biasa)*
* **SMTP_PASSWORD**: `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY`

### C. SendGrid (Twilio)
Anda memerlukan API Key dari konsol SendGrid.
* **SMTP_HOST**: `smtp.sendgrid.net`
* **SMTP_PORT**: `587`
* **SMTP_USERNAME**: `apikey` *(Gunakan kata "apikey" secara harfiah)*
* **SMTP_PASSWORD**: `SG.xxxxxx...` *(Masukkan API Key SendGrid Anda di sini)*

---

## 3. Cara Menguji Konfigurasi

1. Pastikan Anda telah mengisi file `.env` (atau Secrets Manager di *deployment server* Anda) dengan kredensial yang valid.
2. *Restart* layanan `auth-service` agar variabel environment yang baru dapat terbaca.
3. Buka aplikasi Kurir TEMBUS.
4. Pergi ke halaman **Lupa Password**.
5. Masukkan email kurir yang valid (yang terdaftar di database).
6. Tekan tombol **"Kirim OTP"**.
7. Periksa kotak masuk (Inbox/Spam) email penerima. Anda seharusnya menerima email berjudul *"Kode Reset Password Kurir TEMBUS"*.

---

## 4. Mode Mock (Development)

Selama tahap *development* atau pengujian internal, Anda bisa mengosongkan semua variabel `SMTP_*`. Aplikasi akan tetap berjalan dan OTP dapat dilihat langsung dari log *backend* (Auth Service).

Contoh log *Mock Email*:
```text
==================================================
MOCK EMAIL SENDER
To: kurir@example.com
Subject: Kode Reset Password Kurir TEMBUS
Body: Kode OTP Anda adalah: 123456. Berlaku selama 5 menit.
==================================================
```
