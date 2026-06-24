# Implementasi AI Data Lake (RabbitMQ + Cloudflare R2)

Sesuai dengan persetujuan untuk menggunakan **Trik A (Object Storage + Parquet via RabbitMQ)**, dokumen ini akan memandu Anda dari sisi konfigurasi infrastruktur (Cloudflare R2) hingga arsitektur *backend* yang perlu kita ubah.

## User Review Required

> [!IMPORTANT]
> Mohon baca bagian **Tutorial Setup Cloudflare R2** di bawah ini. Anda harus melakukan langkah-langkah tersebut secara mandiri di dasbor Cloudflare Anda, lalu memberikan *Credential* (Access Key & Secret Key) ke dalam file `.env` kita.

## Open Questions

> [!WARNING]
>
> 1. Apakah Anda ingin *worker* penyimpanan (dari RabbitMQ ke R2) dibuatkan sebagai aplikasi terpisah (*Microservice* baru: misal `datalake-worker`) atau digabung saja ke dalam `order-service`? (Saran: Sebaiknya dipisah agar jika *worker* R2 ini error/lambat, API utama Kurir tidak terpengaruh).
> 2. Berapa rentang waktu (*interval*) Anda ingin mengemas datanya? (Saran: 1 Jam sekali agar file `.parquet` tidak terlalu kecil, tapi tidak terlalu besar untuk dikelola).

---

## Tutorial Setup Cloudflare R2 (Manual oleh Anda)

Cloudflare R2 menyediakan 10 GB penyimpanan gratis per bulan tanpa biaya egress (bebas biaya tarik data). Ikuti langkah ini di browser Anda:

1. **Buat Akun/Login Cloudflare:** Masuk ke [dash.cloudflare.com](https://dash.cloudflare.com).
2. **Pilih Menu R2:** Di menu sebelah kiri, cari dan klik **R2**. (Jika baru pertama kali, Anda akan diminta memasukkan kartu kredit untuk verifikasi, tapi tidak akan dipotong selama di bawah 10 GB).
3. **Buat Bucket Baru:**
   - Klik tombol **Create Bucket**.
   - Beri nama, misalnya: `lancar-ai-datalake`.
   - Biarkan lokasi otomatis (Auto) atau pilih APAC (Asia Pacific) agar lebih dekat ke Indonesia.
   - Klik **Create Bucket**.
4. **Buat Access Key (Token):**
   - Kembali ke halaman utama R2, lihat di menu sebelah kanan atas, klik **Manage R2 API Tokens**.
   - Klik **Create API token**.
   - Beri nama: `lancar-worker-token`.
   - Permissions: Pilih **Object Read & Write**.
   - Klik **Create API Token**.
5. **Simpan Kredensial:** Anda akan mendapatkan 3 data penting. **Simpan data ini baik-baik!**
   - Access Key ID
   - Secret Access Key
   - S3 API URL (contoh: `https://<account_id>.r2.cloudflarestorage.com`)

---

## Proposed Changes (Rencana Arsitektur Kode)

Setelah Anda mendapatkan Kredensial R2 di atas, saya akan mengeksekusi pembuatan kode berikut:

### 1. Perubahan Konfigurasi (.env & Docker)

Menambahkan variabel lingkungan baru untuk RabbitMQ dan S3/R2 Client.

#### [MODIFY] `docker-compose.yml`

- Menambahkan *worker container* baru bernama `tembus-datalake-worker` jika Anda setuju dipisah.

#### [MODIFY] `.env.example`

Menambahkan variabel:

```env
# R2 Datalake Configuration
R2_ACCESS_KEY_ID=your_access_key
R2_SECRET_ACCESS_KEY=your_secret_key
R2_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com
R2_BUCKET_NAME=lancar-ai-datalake
```

### 2. Modifikasi Tracking Service (Publisher)

Saat ini `TrackingServiceImpl.UpdateLocation` menyimpan data langsung ke PostgreSQL. Kita akan *bypass/copy* data ini agar juga dikirim ke RabbitMQ.

#### [MODIFY] `backend/order-service/internal/service/tracking_service.go`

- **Logic:** Setelah merespons `OK` ke kurir, kirim JSON *payload* berisi `(CourierID, OrderID, Latitude, Longitude, Timestamp)` ke antrean RabbitMQ bernama `queue.ai.datalake.gps`.

### 3. Pembuatan Worker Baru (Consumer & Uploader)

Kita akan membuat komponen *worker* yang "memakan" pesan dari RabbitMQ, menampungnya di memori selama 1 jam, mengubahnya ke format Parquet, lalu mengunggahnya ke R2.

#### [NEW] `backend/datalake-worker/main.go`

- Inisialisasi koneksi RabbitMQ dan R2 (menggunakan pustaka AWS S3 SDK untuk Golang, karena R2 kompatibel dengan S3).

#### [NEW] `backend/datalake-worker/internal/consumer/gps_consumer.go`

- Berlangganan (*subscribe*) ke antrean `queue.ai.datalake.gps`.
- Melakukan *buffering* (mengumpulkan pesan).

#### [NEW] `backend/datalake-worker/internal/uploader/r2_uploader.go`

- Secara periodik (misal setiap 1 jam atau setiap ada 10.000 data terkumpul), mengonversi kumpulan JSON tersebut menjadi format *Parquet* (bisa menggunakan pustaka `github.com/xitongsys/parquet-go`).
- Mengunggah file tersebut ke *bucket* R2 dengan format nama: `raw/gps/year=2026/month=06/day=24/gps_1400_1500.parquet`.

---

## Verification Plan

### Automated Tests

- Membuat *Unit Test* untuk memastikan konversi JSON ke Parquet berjalan sempurna.
- Membuat *Mock Test* untuk memastikan fungsi *Publisher* ke RabbitMQ tidak memblokir (*blocking*) performa API pelacakan GPS kurir.

### Manual Verification

1. Menyalakan `docker-compose up -d`.
2. Melakukan *hit* ke endpoint `UpdateLocation` sebagai simulasi kurir berjalan.
3. Memastikan bahwa dalam interval tertentu, muncul pesan log `"Successfully uploaded gps_*.parquet to R2"`.
4. Anda akan masuk ke dasbor Cloudflare R2 dan memastikan file `.parquet` tersebut berhasil terbuat di dalam *Bucket*.
