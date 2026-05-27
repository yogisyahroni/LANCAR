# Tata Cara Deploy TEMBUS

Dokumen ini dipakai sebagai checklist deploy aplikasi TEMBUS untuk environment staging atau production.

## 1. Siapkan Environment

Salin template environment:

```bash
cp .env.example .env
```

Isi minimal konfigurasi berikut:

```env
DATABASE_URL=
REDIS_URL=
JWT_SECRET=
JWT_REFRESH_SECRET=
CORS_ALLOWED_ORIGINS=
MIDTRANS_SERVER_KEY=
MIDTRANS_CLIENT_KEY=
MIDTRANS_ENV=production
MIDTRANS_FINISH_URL=https://domain-webapp-kamu.com/orders
```

Untuk sandbox Midtrans, gunakan:

```env
MIDTRANS_ENV=sandbox
MIDTRANS_FINISH_URL=http://localhost:3000/orders
```

## 2. Deploy Service

Jalankan service dengan Docker Compose:

```bash
docker compose up -d --build
```

Atau lewat script WSL:

```bash
./deploy_wsl.sh
```

Pastikan container utama berjalan:

```bash
docker ps
```

## 3. Konfigurasi Midtrans

Di dashboard Midtrans, masuk ke menu konfigurasi notifikasi pembayaran lalu set **Payment Notification URL** ke URL deploy API Gateway:

```text
https://domain-api-kamu.com/api/v1/payments/midtrans/notification
```

Contoh:

```text
https://api.tembus.id/api/v1/payments/midtrans/notification
```

Catatan:

- URL ini harus mengarah ke API Gateway, bukan langsung ke frontend.
- Endpoint gateway akan meneruskan notifikasi ke admin-service.
- Pastikan domain API sudah memakai HTTPS agar notifikasi Midtrans diterima stabil.
- Untuk local development dengan tunnel, gunakan URL tunnel yang mengarah ke gateway, misalnya:

```text
https://nama-tunnel.ngrok-free.app/api/v1/payments/midtrans/notification
```

## 4. Smoke Test Setelah Deploy

Lakukan pengecekan cepat:

```bash
curl https://domain-api-kamu.com/health
```

Lalu test flow customer:

1. Login customer webapp.
2. Buat single order.
3. Pastikan Midtrans Snap terbuka.
4. Selesaikan pembayaran sandbox/production.
5. Pastikan status order berubah dari `pending_payment` ke `pending`.

Untuk bulk order:

1. Download template Excel dari halaman Bulk Order.
2. Upload file valid.
3. Review data.
4. Bayar dengan Midtrans Snap.
5. Pastikan semua order batch masuk ke riwayat order.
