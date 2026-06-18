# LANCAR — Production Security & Ops Checklist

Dokumen ini berisi panduan dan checklist kesiapan *production* untuk sistem TEMBUS (LANCAR) berdasarkan hasil audit keamanan dan sistem. 

**STATUS: WAJIB DISELESAIKAN SEBELUM LAUNCH**

## 1. Blocker Keamanan (SECURITY)
Ini adalah celah yang bisa berakibat fatal jika tidak ditutup sebelum production:

- [ ] **Ganti Semua Default Secrets di Environment:**
  Saat ini di file `docker-compose.yml`, nilai fallback masih menggunakan placeholder. Anda **WAJIB** membuat file `.env` (atau menggunakan fitur Secret Manager di hosting Anda) yang meng-override nilai berikut dengan string acak (minimal 32 karakter):
  - `JWT_SECRET` (Ganti dari `"changeme_in_production_min32chars"`)
  - `RABBITMQ_DEFAULT_PASS` (Ganti dari `"changeme_rabbitmq_in_production"`)
  - `POSTGRES_PASSWORD` (Ganti ke password yang lebih kuat)
  *(Sistem `order-service` akan otomatis menolak untuk menyala jika mendeteksi kata "changeme" di production).*

- [ ] **Midtrans Environment:**
  - Pastikan `MIDTRANS_ENV` diubah dari `sandbox` menjadi `production`.
  - Ganti `MIDTRANS_SERVER_KEY` dan `MIDTRANS_CLIENT_KEY` menggunakan key *production* dari dashboard Midtrans Anda.

- [ ] **TomTom API Key (Maps):**
  - Pastikan API Key Maps menggunakan *Production Key*.
  - **Sangat Penting:** Lakukan *restriction* (pembatasan) di dashboard TomTom berdasarkan domain website dan *SHA-1 fingerprint* aplikasi Android Anda untuk mencegah pencurian kuota API.

- [ ] **Android Certificate Pinning & Release Mode:**
  - Pastikan Anda men-generate *SHA-256 hash* dari SSL certificate domain production Anda dan memasukkannya ke konfigurasi Network di Android (`NetworkModule.kt`).
  - Pastikan build aplikasi Android dilakukan dalam mode `Release` (`BuildConfig.DEBUG = false`) agar *certificate pinning* dan enkripsi penyimpanan aktif.

## 2. Infrastruktur & DevOps (OPS)
- [ ] **SSL / HTTPS Proxy:**
  - Saat ini arsitektur mengekspos port secara langsung. Setup **Reverse Proxy** (seperti Nginx, Traefik, atau Cloudflare) untuk me-manage SSL/TLS Certificate (HTTPS) dan me-routing traffic port 443 ke API Gateway / Web Frontend.

- [ ] **Database Backup Strategy:**
  - Buat *automated backup* (cronjob) untuk menjalankan `pg_dump` PostgreSQL setiap hari.
  - Simpan hasil backup di luar server database (misal: AWS S3).

## 3. Bisnis & Compliance
- [ ] **Syarat & Ketentuan (T&C) dan Privacy Policy:**
  - Wajib ada dan bisa diakses di web publik sebelum aplikasi Android disubmit ke Google Play Store / App Store.

- [ ] **Zenziva Quota (OTP):**
  - Pastikan saldo/kuota OTP WhatsApp dan SMS Zenziva Anda mencukupi untuk menampung pendaftar baru saat peluncuran.
