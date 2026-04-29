# PRODUCT REQUIREMENTS DOCUMENT (PRD)
## Platform Logistik Hyperlocal Relay
### Versi 1.1 — April 2026 | Skala Industri

> **Changelog v1.1 (29 April 2026):** Penambahan Feature Flag Management untuk semua model pengiriman (P2P, 2-Kaki, 3-Kaki). Algoritma routing diperbarui. 3-Kaki dinonaktifkan default, dapat diaktifkan Super Admin setelah 3-Leg Activation Framework terpenuhi.

---

## DAFTAR ISI
1. Executive Summary
2. User Personas & Roles
3. Platform Overview — termasuk Feature Flag Architecture
4. Feature Requirements — Web Admin Dashboard
   - 4.8 Feature Flag Management (Super Admin) ← BARU v1.1
5. Feature Requirements — Mobile Customer App
6. Feature Requirements — Mobile Courier App
7. Fitur Utama: Identifikasi & Scanning Barang (Volumetric Weight)
8. Sistem Dynamic Pricing
9. Relay & SLA Engine — termasuk Flag-Aware Routing ← DIPERBARUI v1.1
10. Notifikasi & Real-time
11. Payment & QRIS
12. Security Requirements — termasuk Flag Access Control ← BARU v1.1
13. Non-Functional Requirements
14. API Contract Overview
15. Feature Flags — Definisi Lengkap & Matriks Akses ← BARU v1.1
16. Glossary

---

## 1. EXECUTIVE SUMMARY

### 1.1 Tujuan Produk
Membangun platform logistik hyperlocal berbasis teknologi hybrid relay (P2P, 2-Kaki, 3-Kaki) yang terdiri dari:
- **Web Admin Dashboard** — manajemen operasional, analytics, keuangan
- **Mobile Customer App** (Android + iOS) — pemesanan, tracking, pembayaran
- **Mobile Courier App** (Android + iOS) — penerimaan order, navigasi, handover, scan barang

### 1.2 Scope Fitur Utama
- Identifikasi dimensi paket via kamera (AR Volumetric Scanning) → kalkulasi berat volumetrik P×L×T/5000
- Pemilihan model pengiriman otomatis (P2P / 2-Kaki / 3-Kaki) berbasis jarak & zona
- Dynamic pricing real-time (waktu, cuaca, demand/supply)
- Relay handover system dengan QR scan + video evidence
- GPS tracking live setiap 10 detik
- QRIS payment dengan pemisahan dana otomatis
- Rating & Relay Score system
- Asuransi terintegrasi BPJS TK + asuransi mikro
- Dashboard analytics & laporan keuangan

### 1.3 Target Platform
| Platform | Tech Stack | Target Device |
|---|---|---|
| Web Admin | React.js + TypeScript | Desktop/Laptop Chrome/Firefox |
| Mobile Customer | Flutter (cross-platform) | Android 8.0+ / iOS 14+ |
| Mobile Courier | Flutter (cross-platform) | Android 8.0+ (prioritas) |
| Backend | Node.js / Go (microservices) | AWS / GCP |

---

## 2. USER PERSONAS & ROLES

### 2.1 Customer (Pengirim)
**Profil:** UMKM pemilik toko online, restoran/katering, individu pengirim barang  
**Kebutuhan:**
- Pesan pengiriman cepat dengan harga transparan
- Tracking real-time paket mereka
- Bukti pengiriman digital (foto + tanda tangan)
- Asuransi barang opsional

**Pain Point Saat Ini:**
- Tidak tahu biaya sebelum pesan
- Paket besar/berat dikenakan harga sembarangan
- Tidak ada visibilitas kurir mana yang memegang paket

### 2.2 Kurir (Mitra Pengiriman)
**Profil:** Driver ojek/motor freelance, kurir zona, kurir mitra terdaftar  
**Kebutuhan:**
- Terima order di zona saya sendiri
- Navigasi ke titik pickup dan delivery
- Scan QR untuk handover yang terdokumentasi
- Pantau penghasilan dan relay score

**Pain Point Saat Ini:**
- Harus bolak-balik lintas kota, buang BBM
- Tidak ada sistem handover yang jelas
- Tidak ada perlindungan asuransi

### 2.3 Admin Operasional
**Profil:** Tim internal perusahaan, ops manager, customer service  
**Kebutuhan:**
- Monitor semua order dan kurir real-time
- Resolve dispute/komplain
- Generate laporan keuangan dan performa

### 2.4 Super Admin / Founder
**Profil:** CEO, CTO, COO dan jajaran founder  
**Kebutuhan:**
- Akses penuh semua data
- Konfigurasi pricing, zona, SLA
- Financial overview dan proyeksi

---

## 3. PLATFORM OVERVIEW

### 3.1 Arsitektur Sistem (High Level)

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                              │
│  ┌──────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │ Web Dashboard │  │  Customer App    │  │   Courier App    │  │
│  │  (React.js)   │  │   (Flutter)      │  │   (Flutter)      │  │
│  └──────┬───────┘  └────────┬─────────┘  └────────┬─────────┘  │
└─────────┼────────────────────┼─────────────────────┼────────────┘
          │                    │                     │
          └──────────────┬─────┘                     │
                         │                           │
┌────────────────────────▼───────────────────────────▼────────────┐
│                    API GATEWAY                                    │
│           (Rate Limiting, Auth JWT, Load Balancer)               │
└───────┬──────────┬─────────┬──────────┬────────────┬────────────┘
        │          │         │          │            │
   ┌────▼──┐  ┌───▼───┐ ┌───▼───┐ ┌───▼────┐  ┌───▼────┐
   │ Auth  │  │ Order │ │Routing│ │Pricing │  │Tracking│
   │Service│  │Service│ │Service│ │Engine  │  │Service │
   └───────┘  └───────┘ └───────┘ └────────┘  └────────┘
        │          │         │          │            │
        └──────────┴────┬────┴──────────┴────────────┘
                        │
              ┌──────── ▼ ────────┐
              │   Message Queue   │
              │  (Redis/RabbitMQ) │
              └──────────┬────────┘
                         │
        ┌────────────────┼─────────────────┐
        ▼                ▼                 ▼
   ┌─────────┐     ┌──────────┐     ┌──────────┐
   │Postgres │     │  Redis   │     │  S3/MinIO│
   │+PostGIS │     │  Cache   │     │  (Files) │
   └─────────┘     └──────────┘     └──────────┘
```

### 3.2 Microservices Architecture

| Service | Fungsi | Tech |
|---|---|---|
| auth-service | Login, JWT, OAuth, role management | Node.js |
| order-service | CRUD order, state machine | Node.js |
| routing-service | Pemilihan model, zona matching, titik temu | Go |
| pricing-engine | Dynamic pricing, volumetric calc | Go |
| tracking-service | GPS ingestion, geofencing, ETA | Go |
| notification-service | Push, WhatsApp, SMS | Node.js |
| payment-service | QRIS, pemisahan dana, settlement | Node.js |
| scanning-service | ML volumetric detection, weight estimation | Python/FastAPI |
| insurance-service | BPJS integration, klaim | Node.js |
| analytics-service | Report, metrics, dashboard data | Node.js |
| media-service | Upload foto/video, S3 management | Node.js |

---

## 4. FEATURE REQUIREMENTS — WEB ADMIN DASHBOARD

### 4.1 Authentication & Authorization
**FR-WEB-001:** Login dengan email + password dengan JWT + refresh token  
**FR-WEB-002:** Role-based access control (RBAC):
- `super_admin` — akses penuh
- `ops_manager` — monitoring + dispute
- `finance` — laporan keuangan only
- `cs_agent` — order view + komunikasi
- `zone_manager` — manajemen zona tertentu

**FR-WEB-003:** Two-Factor Authentication (2FA) wajib untuk super_admin dan finance  
**FR-WEB-004:** Audit log semua aksi admin (siapa, kapan, apa yang diubah)  
**FR-WEB-005:** Session timeout 8 jam, force logout dari device lain

---

### 4.2 Live Operations Dashboard

**FR-WEB-010:** Real-time map view seluruh kurir aktif (update setiap 10 detik)  
**FR-WEB-011:** Warna marker kurir berdasarkan status:
- 🟢 Hijau = Online, available
- 🟡 Kuning = On-delivery (P2P)
- 🔵 Biru = On-relay (2-Kaki atau 3-Kaki)
- 🔴 Merah = Offline / suspended

**FR-WEB-012:** Panel order aktif dengan filter:
- Status: pending / assigned / picked_up / in_relay / delivered / failed
- Model: P2P / 2-Kaki / 3-Kaki
- Zona: Jakarta Timur / Barat / Pusat / Utara / Selatan

**FR-WEB-013:** Alert real-time untuk:
- Order SLA breach (>5 menit dari batas waktu)
- Kurir keluar geofence zona
- GPS spoofing terdeteksi
- Server error rate >1%

**FR-WEB-014:** Heatmap zona berdasarkan volume order per jam  
**FR-WEB-015:** Statistik live: order/jam, kurir aktif, rata-rata waktu delivery, SLA compliance rate

---

### 4.3 Order Management

**FR-WEB-020:** Tabel order dengan kolom: ID, customer, kurir (tiap leg), status, model, total harga, waktu, SLA status  
**FR-WEB-021:** Detail order mencakup:
- Informasi paket (dimensi dari scan, berat aktual vs volumetrik)
- Timeline event per leg (pickup, handover, delivery) dengan timestamp + GPS coordinate
- Foto/video dokumentasi tiap handover
- Trail kurir dengan koordinat GPS
- Riwayat komunikasi (notifikasi yang dikirim)

**FR-WEB-022:** Manual override order (admin bisa reassign kurir jika kurir gagal)  
**FR-WEB-023:** Fitur force-cancel dengan log alasan dan refund trigger  
**FR-WEB-024:** Bulk export order ke CSV/Excel (filter by date range, status, zona)  
**FR-WEB-025:** Complaint management:
- Customer buka dispute dari app
- CS assign ke agen
- Eskalasi ke ops_manager jika >2 jam belum resolved
- Status tracking dispute (open / investigating / resolved / escalated)

---

### 4.4 Courier Management

**FR-WEB-030:** Daftar kurir dengan kolom: nama, zona, relay score, status, order hari ini, total order, churn risk indicator  
**FR-WEB-031:** Profil detail kurir:
- Dokumen (foto KTP, SIM, STNK) + status verifikasi
- Kendaraan (jenis, plat, cc motor)
- Statistik (on-time rate, completion rate, relay score history)
- Riwayat order (termasuk yang gagal/dibatalkan)
- Status asuransi BPJS + asuransi mikro

**FR-WEB-032:** Verifikasi kurir baru (approve/reject dengan catatan)  
**FR-WEB-033:** Suspend/unsuspend kurir dengan alasan tertulis  
**FR-WEB-034:** Manajemen zona kurir (assign, pindah zona, multi-zona)  
**FR-WEB-035:** Laporan churn risk: kurir dengan aktivitas turun >50% dalam 7 hari  
**FR-WEB-036:** Retraining flag: kurir dengan relay score <3.5 otomatis masuk antrian retraining

---

### 4.5 Zone & Pricing Configuration

**FR-WEB-040:** Manajemen zona geospasial (gambar polygon zona via peta interaktif)  
**FR-WEB-041:** Titik temu (meeting point) management:
- Tambah/edit/hapus titik temu per pair zona
- Radius buffer per kondisi lalu lintas
- Titik temu cadangan (alternatif 1, 2)

**FR-WEB-042:** Konfigurasi harga dasar per model:
- P2P: harga per km bracket
- 2-Kaki: flat fee per leg
- 3-Kaki: flat fee per leg

**FR-WEB-043:** Konfigurasi dynamic pricing:
- Jam sibuk: range waktu + multiplier
- Cuaca: threshold intensitas hujan + multiplier
- Demand-supply: rasio kurir/order + multiplier
- Loyalty discount per tier

**FR-WEB-044:** Konfigurasi berat volumetrik:
- Formula: P×L×T ÷ divisor (default: 5000 untuk motor)
- Threshold minimal berat aktual vs volumetrik
- Biaya tambahan per bracket berat

**FR-WEB-045:** Preview simulasi harga sebelum save konfigurasi

---

### 4.6 Financial Dashboard

**FR-WEB-050:** Revenue overview: harian, mingguan, bulanan, tahunan  
**FR-WEB-051:** Breakdown pendapatan per model (P2P / 2-Kaki / 3-Kaki)  
**FR-WEB-052:** Breakdown biaya: kurir fee, teknologi, marketing, asuransi  
**FR-WEB-053:** Laporan laba bersih per periode dengan export PDF/Excel  
**FR-WEB-054:** Settlement management:
- Ringkasan payout kurir (pending, processed, completed)
- Trigger manual payout jika auto gagal
- Riwayat payout per kurir

**FR-WEB-055:** PPN tracking: total PPN yang harus disetorkan per masa pajak  
**FR-WEB-056:** Dana cuaca darurat: saldo reserve, pemakaian, top-up history  
**FR-WEB-057:** MDR cost tracking (biaya QRIS per bulan)  
**FR-WEB-058:** Unit economics dashboard: CAC, LTV, margin per order per model

---

### 4.7 Analytics & Reporting

**FR-WEB-060:** SLA compliance report: % on-time per zona, per kurir, per waktu  
**FR-WEB-061:** Relay efficiency: success rate handover, idle time antar-kurir  
**FR-WEB-062:** Customer analytics: retention rate, order frequency, churn prediction  
**FR-WEB-063:** Courier analytics: utilization rate, zone coverage, relay score distribution  
**FR-WEB-064:** Dynamic pricing analytics: berapa % order terkena surge, revenue impact  
**FR-WEB-065:** Volumetric scanning accuracy report: rata-rata selisih scan vs actual  
**FR-WEB-066:** Custom report builder: pilih metrik, dimensi, filter, export

---

### 4.8 System Configuration

**FR-WEB-070:** Feature flags (enable/disable fitur tanpa redeploy)  
**FR-WEB-071:** Konfigurasi SLA per model dan leg (dalam menit)  
**FR-WEB-072:** Konfigurasi penalti SLA (% fee yang dipotong)  
**FR-WEB-073:** Konfigurasi kompensasi idle time (Rp per 15 menit)  
**FR-WEB-074:** Manajemen promo/voucher:
- Buat kode promo (nominal/persentase, max usage, expiry)
- Monitor penggunaan voucher
- Restrict per zona / per customer tier

**FR-WEB-075:** Konfigurasi notifikasi template (push, WhatsApp, SMS)  
**FR-WEB-076:** Manajemen API keys eksternal (Google Maps, BMKG, Payment Gateway)

---

## 5. FEATURE REQUIREMENTS — MOBILE CUSTOMER APP

### 5.1 Onboarding & Authentication

**FR-CUST-001:** Registrasi via nomor HP (OTP WhatsApp atau SMS)  
**FR-CUST-002:** Login via nomor HP + OTP atau PIN 6 digit  
**FR-CUST-003:** Social login: Google, Apple  
**FR-CUST-004:** Profil: nama, foto, email (opsional), daftar alamat tersimpan  
**FR-CUST-005:** Verifikasi identitas KTP opsional (untuk limit asuransi lebih tinggi)

---

### 5.2 Pemesanan

**FR-CUST-010:** Input alamat pickup dan tujuan:
- Ketik manual dengan autocomplete Google Places
- Pin di peta interaktif
- Pilih dari alamat tersimpan
- Gunakan lokasi saat ini (GPS)

**FR-CUST-011:** Input detail paket:
- Nama barang / deskripsi
- Kategori (dokumen, elektronik, makanan, fashion, lainnya)
- Berat aktual (input manual dalam kg)
- **Fitur Scan Dimensi Barang** (lihat Seksi 7)

**FR-CUST-012:** Preview estimasi harga sebelum konfirmasi:
- Breakdown: biaya jarak + biaya berat/dimensi + dynamic pricing (jika aktif)
- Model yang dipilih sistem (P2P / 2-Kaki / 3-Kaki)
- Estimasi waktu tiba (ETA)
- Badge "SURGE PRICING" jika dynamic pricing aktif (wajib transparan)

**FR-CUST-013:** Pilihan asuransi barang:
- Toggle ON/OFF
- Nilai barang (input customer)
- Preview premi (0,2% dari nilai barang)

**FR-CUST-014:** Catatan khusus untuk kurir (maks 200 karakter)  
**FR-CUST-015:** Jadwal pengiriman:
- Segera (now)
- Jadwal (max 7 hari ke depan, per jam)

**FR-CUST-016:** Review & konfirmasi order (tampilkan semua detail + harga final)  
**FR-CUST-017:** Pembayaran via QRIS (lihat Seksi 11)

---

### 5.3 Tracking & Order Status

**FR-CUST-020:** Live tracking map order aktif:
- Lokasi kurir aktif real-time (update 10 detik)
- Rute estimasi dari kurir ke tujuan
- ETA countdown

**FR-CUST-021:** Timeline status order:
- ✅ Order diterima
- ✅ Kurir menuju pickup
- ✅ Barang diambil (+ foto pickup oleh kurir)
- ✅ Handover ke Kurir B (+ bukti QR scan) — jika relay
- ✅ Handover ke Kurir C (+ bukti QR scan) — jika 3-Kaki
- ✅ Kurir menuju tujuan
- ✅ Barang terkirim (+ foto delivery + e-POD)

**FR-CUST-022:** Notifikasi push setiap perubahan status  
**FR-CUST-023:** Estimasi waktu per stage (ETA per leg untuk relay)  
**FR-CUST-024:** Kontak kurir via in-app chat (tanpa expose nomor HP asli)  
**FR-CUST-025:** Panic/alert button jika paket terindikasi bermasalah

---

### 5.4 Post-Delivery

**FR-CUST-030:** Rating kurir (1-5 bintang + komentar teks) setelah delivered  
**FR-CUST-031:** Untuk relay, customer bisa rate tiap kurir secara terpisah  
**FR-CUST-032:** Laporan masalah / dispute:
- Pilih kategori: paket rusak, tidak terkirim, kurir tidak sopan, harga tidak sesuai, lainnya
- Upload foto bukti
- Status tracking dispute

**FR-CUST-033:** Riwayat order (detail lengkap, unduh bukti kirim PDF)  
**FR-CUST-034:** Reorder (ulangi order sebelumnya dengan sekali tap)

---

### 5.5 Wallet & Payment History

**FR-CUST-040:** Riwayat transaksi (filter by date, status)  
**FR-CUST-041:** Voucher & promo:
- Daftar voucher aktif
- Masukkan kode promo manual
- Voucher dari program referral

**FR-CUST-042:** Refund status tracking (jika ada pembatalan / SLA breach)  
**FR-CUST-043:** Loyalty tier (Bronze / Silver / Gold berdasarkan volume order)  
**FR-CUST-044:** Program referral: kode referral unik + tracking reward

---

### 5.6 Notifikasi & Komunikasi

**FR-CUST-050:** Push notification untuk semua event order  
**FR-CUST-051:** Notification center in-app (inbox)  
**FR-CUST-052:** In-app chat antar customer dan kurir (per order) — masked number  
**FR-CUST-053:** Notifikasi promo dan informasi layanan  
**FR-CUST-054:** Preferensi notifikasi (customer bisa pilih channel: push / WhatsApp)

---

## 6. FEATURE REQUIREMENTS — MOBILE COURIER APP

### 6.1 Onboarding & Verifikasi

**FR-COUR-001:** Registrasi:
- Nomor HP (OTP)
- Nama lengkap, foto profil
- Upload KTP (foto depan + belakang)
- Upload SIM (foto)
- Upload STNK kendaraan
- Foto selfie verifikasi liveness

**FR-COUR-002:** Pilih jenis kendaraan (motor bebek, matic, sport)  
**FR-COUR-003:** Pilih zona kerja utama (bisa pilih hingga 2 zona)  
**FR-COUR-004:** Status verifikasi (menunggu admin approve, estimasi 24 jam)  
**FR-COUR-005:** Training onboarding in-app (video + quiz singkat):
- Cara relay handover
- Cara scan QR
- Cara scan dimensi barang
- Aturan SLA dan penalti

**FR-COUR-006:** Acceptance rate minimum 70% (jika di bawah, ada warning)

---

### 6.2 Mode Online & Order Management

**FR-COUR-010:** Toggle online/offline dengan GPS permission check  
**FR-COUR-011:** Notifikasi order masuk:
- Detail order: jarak, fee, model (P2P/2-Kaki/3-Kaki), dimensi paket, ETA
- Timer accept 30 detik (auto-decline jika tidak direspons)
- Preview rute di peta

**FR-COUR-012:** Accept atau decline order (decline max 3 kali per jam sebelum warning)  
**FR-COUR-013:** Jika decline karena alasan valid (motor rusak, dll) kurir bisa pause status  
**FR-COUR-014:** Tampilkan order aktif dengan semua detail dan navigasi

---

### 6.3 Navigasi & Pickup

**FR-COUR-020:** Navigasi in-app ke lokasi pickup (Google Maps deep link atau in-app navigation)  
**FR-COUR-021:** Konfirmasi tiba di pickup dengan:
- GPS auto-check jika dalam radius 100m
- Foto kondisi barang saat pickup (wajib, minimal 1 foto)
- Scan dimensi barang jika belum dilakukan customer (lihat Seksi 7)
- Input berat aktual jika ada timbangan (opsional, konfirmasi berat sistem)
- Scan QR paket untuk mulai chain of custody

**FR-COUR-022:** Notifikasi ke customer bahwa kurir sudah ambil barang  
**FR-COUR-023:** Timer SLA mulai berjalan setelah pickup dikonfirmasi

---

### 6.4 Relay Handover (Khusus 2-Kaki & 3-Kaki)

**FR-COUR-030:** Sistem matching otomatis: kurir A dan kurir B diarahkan ke titik temu yang sama  
**FR-COUR-031:** Navigasi ke titik temu dengan ETA live  
**FR-COUR-032:** Halaman handover (kurir pengirim):
- Tampilkan QR code paket
- Kurir penerima scan QR tersebut
- Rekam video handover 3-5 detik (wajib)
- Konfirmasi serah terima

**FR-COUR-033:** Halaman handover (kurir penerima):
- Scan QR dari kurir pengirim
- Konfirmasi kondisi paket (pilih: OK / Rusak)
- Jika rusak: wajib foto + deskripsi (akan trigger dispute)
- Accept paket

**FR-COUR-034:** Alert jika titik temu macet: suggest titik alternatif otomatis  
**FR-COUR-035:** Kompensasi idle time: jika kurir menunggu >10 menit, muncul info kompensasi  
**FR-COUR-036:** Jika partner tidak datang >30 menit: opsi cancel relay dan cari kurir pengganti

---

### 6.5 Delivery & Konfirmasi

**FR-COUR-040:** Navigasi ke alamat tujuan  
**FR-COUR-041:** Konfirmasi delivery:
- Scan QR pada paket
- Foto barang di depan pintu / penerima memegang barang
- E-POD (Electronic Proof of Delivery): tanda tangan digital atau foto KTP penerima
- Input nama penerima

**FR-COUR-042:** Jika tidak ada di tempat:
- Pilihan: coba lagi 1x, titipkan tetangga, return to sender
- Foto kondisi lokasi (wajib)
- Notifikasi ke customer

**FR-COUR-043:** Order selesai → pendapatan tercatat + relay score diupdate

---

### 6.6 Earnings & Relay Score

**FR-COUR-050:** Dashboard penghasilan:
- Hari ini, minggu ini, bulan ini
- Breakdown per order (fee + bonus)
- Status payout (pending / completed)

**FR-COUR-051:** Relay Score display:
- Skor saat ini (1.0 – 5.0)
- Komponen skor (on-time, dokumentasi, rating partner, complaint)
- History skor 30 hari
- Badge tier (Reguler / Mitra / Elite)

**FR-COUR-052:** Leaderboard zona (ranking kurir di zona yang sama)  
**FR-COUR-053:** Notifikasi warning: relay score mendekati batas (<3.5 dan <3.0)  
**FR-COUR-054:** Program bonus loyalty:
- Aktif 20+ hari/bulan: bonus Rp50.000
- On-time rate >95%: priority order

**FR-COUR-055:** Riwayat order (semua order, status, fee, bukti)

---

### 6.7 Keamanan Kurir

**FR-COUR-060:** Root detection: jika device rooted, fitur terbatas (tidak bisa accept order)  
**FR-COUR-061:** GPS anti-spoofing: Kalman filter + velocity consistency check  
**FR-COUR-062:** Liveness detection saat login (mencegah akun dipinjamkan)  
**FR-COUR-063:** SOS button (panic button) untuk situasi darurat → alert ke admin + nomor darurat  
**FR-COUR-064:** Automatic pause jika tidak ada aktivitas GPS 15 menit saat online

---

## 7. FITUR UTAMA: IDENTIFIKASI & SCANNING BARANG (VOLUMETRIC WEIGHT)

### 7.1 Overview

Fitur AR Scanning memungkinkan pengguna (customer atau kurir) mengukur dimensi paket menggunakan kamera smartphone tanpa alat tambahan. Hasil digunakan untuk menghitung berat volumetrik yang menentukan harga.

**Formula Berat Volumetrik:**
```
Berat Volumetrik (kg) = (Panjang cm × Lebar cm × Tinggi cm) ÷ 5000
Berat Tagihan = MAX(Berat Aktual, Berat Volumetrik)
```

Divisor 5000 adalah standar industri untuk kendaraan motor roda dua.

---

### 7.2 Teknologi Scanning

**Option A: ARCore / ARKit (Depth Sensing)**
- Android ARCore (device ARCore-compatible)
- iOS ARKit + LiDAR (iPhone 12 Pro+)
- Akurasi: ±1-2 cm
- Kelebihan: paling akurat
- Kekurangan: tidak semua device support

**Option B: ML-based Single Camera (Computer Vision)**
- Gunakan model ML (MobileNet/EfficientDet) untuk estimasi dimensi dari 1-2 foto
- Referensi objek: minta pengguna letakkan benda referensi (kartu ATM/KTP) di samping paket
- Akurasi: ±3-5 cm
- Kelebihan: works di semua Android/iOS
- **REKOMENDASI: Gunakan ini sebagai primary, ARCore/ARKit sebagai enhancement**

**Option C: Manual Input Fallback**
- Pengguna input P×L×T manual
- Digunakan jika scan gagal
- Kurir bisa override saat pickup jika dimensi tidak sesuai

---

### 7.3 Flow Scanning — Customer App

**FR-SCAN-001:** Tombol "Scan Dimensi Paket" muncul di halaman input detail paket  
**FR-SCAN-002:** Instruksi onboarding scan (pertama kali gunakan fitur):
1. Letakkan paket di permukaan datar dengan cahaya cukup
2. Letakkan kartu (KTP/ATM) di samping paket sebagai referensi
3. Arahkan kamera, pastikan seluruh paket terlihat

**FR-SCAN-003:** Camera view dengan overlay:
- Grid helper untuk alignment
- Boundary detection (highlight tepi kotak)
- Progress indicator saat proses deteksi

**FR-SCAN-004:** Hasil scan ditampilkan:
- Estimasi dimensi: P=? cm × L=? cm × T=? cm
- Berat volumetrik: ? kg
- Tombol "Konfirmasi" atau "Scan Ulang" atau "Input Manual"

**FR-SCAN-005:** Validasi hasil scan:
- Jika dimensi <5cm di salah satu sisi → warning "dimensi terlalu kecil, pastikan objek tepat"
- Jika dimensi >100cm di salah satu sisi → warning "paket sangat besar, konfirmasi ulang"
- Batas maksimal yang bisa dikirim: 60×60×60 cm (konfigurasi admin)

**FR-SCAN-006:** Setelah dikonfirmasi, dimensi tersimpan ke order  
**FR-SCAN-007:** Sistem otomatis hitung biaya tambahan berdasarkan berat tagihan:

| Berat Tagihan | Biaya Tambahan |
|---|---|
| ≤5 kg | Rp0 (standar) |
| 5-10 kg | +Rp10.000 |
| 10-20 kg | +Rp20.000 |
| >20 kg | Tolak / hubungi CS |
| Dimensi >50×50×50 cm | +Rp15.000 |

---

### 7.4 Flow Scanning — Courier App

**FR-SCAN-010:** Kurir wajib scan dimensi saat pickup jika customer tidak melakukan scan  
**FR-SCAN-011:** Kurir juga bisa override dimensi jika hasil scan customer tidak sesuai:
- Kurir scan ulang + foto dokumentasi
- Selisih harga di-adjust otomatis (customer diberi tahu via notifikasi)
- Jika selisih besar (>Rp10.000), perlu persetujuan customer sebelum lanjut

**FR-SCAN-012:** Di halaman pickup, kurir lihat:
- Dimensi dari scan customer (jika ada)
- Tombol "Verifikasi Dimensi" atau "Scan Ulang"
- Field input berat aktual (jika punya timbangan)

**FR-SCAN-013:** Semua hasil scan (dimensi, foto paket, timestamp, GPS) tersimpan sebagai bukti

---

### 7.5 Backend: Scanning Service

**FR-SCAN-020:** API endpoint `POST /scan/analyze`:
- Input: base64 image(s), reference_object_type (card/custom), custom_reference_dimensions
- Output: { panjang, lebar, tinggi, confidence_score, volumetric_weight }

**FR-SCAN-021:** Confidence score system:
- Score ≥0.85: tampilkan hasil langsung
- Score 0.70-0.84: tampilkan hasil dengan warning "akurasi rendah, konfirmasi ulang"
- Score <0.70: minta scan ulang atau input manual

**FR-SCAN-022:** Simpan semua data scan ke database:
- Image scan (compressed, simpan di S3)
- Hasil dimensi
- Confidence score
- User yang scan (customer/courier)
- Timestamp + GPS

**FR-SCAN-023:** Training data pipeline: hasil scan yang di-override kurir dikumpulkan untuk retrain model  
**FR-SCAN-024:** Fallback jika scanning service down: tampilkan form input manual, log error

---

## 8. SISTEM DYNAMIC PRICING

### 8.1 Faktor Pricing

**FR-PRICE-001:** Harga dasar (base price) per model dikonfigurasi admin:
- P2P: bracket per km
- 2-Kaki: flat per leg
- 3-Kaki: flat per leg

**FR-PRICE-002:** Komponen biaya dimensi/berat (seperti tabel Seksi 7.3)

**FR-PRICE-003:** Faktor jam sibuk:
- Input: waktu lokal Jakarta
- Config: range jam + multiplier (e.g., 07:00-09:00 → ×1.20, 16:00-19:00 → ×1.20)
- Tampilkan badge "JAM SIBUK" di customer app

**FR-PRICE-004:** Faktor cuaca:
- Data source: BMKG API (primary) + Open-Meteo (backup)
- Polling per 15-30 menit per zona aktif
- Trigger: intensitas hujan ≥2 (hujan sedang) → +15%, ≥3 (hujan lebat) → +25%
- Jika hujan terjadi mid-delivery: harga tidak berubah, kurir dapat bonus dari dana cuaca

**FR-PRICE-005:** Faktor demand-supply:
- Hitung rasio: available_couriers / pending_orders per zona real-time
- Rasio <0.5 → +10-15%
- Rasio >2.0 → -5% (diskon untuk dorong demand)

**FR-PRICE-006:** Loyalty discount:
- Bronze: -0%
- Silver (>10 order/bulan): -5%
- Gold (>30 order/bulan): -10%

**FR-PRICE-007:** Formula final:
```
HARGA_FINAL = (HARGA_DASAR + BIAYA_BERAT_DIMENSI)
              × (1 + FAKTOR_JAM)
              × (1 + FAKTOR_CUACA)
              × (1 + FAKTOR_DEMAND)
              × (1 - LOYALTY_DISCOUNT)
              [Dibulatkan ke atas ke Rp500 terdekat]
```

**FR-PRICE-008:** Capped surge: total kenaikan dynamic pricing tidak boleh melebihi +40% dari harga dasar (regulasi anti predatory pricing Permenkomdigi No. 8/2025)

**FR-PRICE-009:** Harga yang sudah dikonfirmasi customer tidak bisa berubah (price lock setelah pembayaran)

---

## 9. RELAY & SLA ENGINE

### 9.1 Model Selection Algorithm

**FR-RELAY-001:** Sistem otomatis pilih model berdasarkan:
```
IF jarak < 15 km → P2P
IF jarak 15-25 km AND zona_tujuan adjacent → 2-Kaki
IF jarak 15-25 km AND zona_tujuan tidak adjacent → 3-Kaki
IF jarak > 25 km → 3-Kaki
```

**FR-RELAY-002:** Adjacency zone matrix dikonfigurasi admin (mana zona yang bersebelahan)  
**FR-RELAY-003:** Customer bisa request upgrade model (misal minta P2P walau jarak 20km) dengan harga lebih tinggi

---

### 9.2 Matching & Dispatch Engine

**FR-RELAY-010:** Dispatch order ke kurir yang memenuhi kriteria:
- Zona kurir sesuai dengan leg
- Status available (tidak sedang delivery)
- Relay score ≥3.5 (untuk relay order)
- Jarak kurir ke pickup ≤3 km

**FR-RELAY-011:** Prioritas matching berdasarkan:
1. Relay Score tertinggi
2. Jarak terdekat ke pickup
3. Acceptance rate tertinggi

**FR-RELAY-012:** Jika tidak ada kurir tersedia dalam 5 menit → expand radius cari ke zona adjacent  
**FR-RELAY-013:** Jika masih tidak ada dalam 10 menit → notifikasi customer dengan opsi: tunggu / cancel refund penuh

---

### 9.3 SLA Enforcement

**FR-RELAY-020:** SLA per leg (dikonfigurasi admin, default):
- Pickup leg: 30 menit sejak order diassign
- Relay leg (Kurir B): 45 menit sejak handover dari A
- Last-mile leg: 60 menit sejak handover ke C

**FR-RELAY-021:** Timer SLA tampil di courier app dan customer app  
**FR-RELAY-022:** Alert 5 menit sebelum SLA habis (ke kurir dan admin)  
**FR-RELAY-023:** Jika SLA breach:
- Kurir dikenai penalti (20% fee dipotong, disalurkan ke kurir berikutnya atau voucher customer)
- Log breach tercatat di profil kurir
- Relay score turun

**FR-RELAY-024:** Kompensasi idle time untuk kurir yang menunggu di titik temu:
- >10 menit: Rp2.000 per 15 menit (dari fee kurir yang terlambat)
- >30 menit: kurir boleh batalkan relay, cari pengganti

---

## 10. NOTIFIKASI & REAL-TIME

### 10.1 Push Notification

**FR-NOTIF-001:** FCM (Firebase Cloud Messaging) untuk Android, APNs untuk iOS  
**FR-NOTIF-002:** Trigger notifikasi customer:
- Order confirmed
- Kurir assigned (+ nama, foto, plat)
- Kurir sedang menuju (ETA)
- Barang diambil
- Handover ke kurir berikutnya (relay)
- Kurir menuju tujuan (ETA)
- Barang terkirim
- Rating request
- Dispute update
- Refund processed

**FR-NOTIF-003:** Trigger notifikasi kurir:
- Order baru (30 detik accept window)
- Reminder SLA (5 menit sebelum habis)
- Partner relay hampir tiba (10 menit ETA)
- Kompensasi idle time diterima
- Payout processed
- Relay score update

**FR-NOTIF-004:** WhatsApp notification (Twilio/WATI API) untuk event kritikal:
- Order confirmed (customer + kurir)
- Barang terkirim (customer)
- SLA breach warning (admin)

---

### 10.2 Real-time WebSocket

**FR-REALTIME-001:** WebSocket connection untuk:
- Customer app: live location kurir (update 10 detik)
- Courier app: order notification real-time, partner ETA
- Admin dashboard: semua event real-time

**FR-REALTIME-002:** Fallback ke HTTP polling (30 detik interval) jika WebSocket terputus  
**FR-REALTIME-003:** GPS ingestion: kurir app kirim koordinat setiap 10 detik saat online dan on-delivery

---

## 11. PAYMENT & QRIS

### 11.1 QRIS Integration

**FR-PAY-001:** Payment gateway: Midtrans atau Xendit (pilih berdasarkan MDR terbaik)  
**FR-PAY-002:** QRIS sebagai metode pembayaran utama  
**FR-PAY-003:** Tampilkan QR code di customer app setelah konfirmasi order  
**FR-PAY-004:** QRIS expire dalam 15 menit (jika tidak dibayar, order otomatis cancelled)  
**FR-PAY-005:** Settlement H+0 atau H+1 ke rekening perusahaan

---

### 11.2 Automatic Fund Splitting

**FR-PAY-010:** Setiap transaksi otomatis split:
```
Dana Masuk (setelah MDR 0.7%) = Harga_Final × 0.993
  ├── Dana PPN (1.1%) → Rekening PPN
  ├── Dana Cuaca (2%) → Reserve account
  ├── Dana Asuransi (kurir share) → Pool asuransi
  └── Dana Operasional → Rekening utama
```

**FR-PAY-011:** Virtual account per rekening tujuan (PPN, cuaca, operasional)  
**FR-PAY-012:** Auto-payout ke kurir: H+1 setelah order selesai  
**FR-PAY-013:** Payout kurir via transfer bank atau dompet digital (GoPay, OVO)

---

### 11.3 Refund & Cancellation

**FR-PAY-020:** Cancellation policy:
- Cancel sebelum kurir assign: refund 100%
- Cancel setelah kurir assign tapi belum pickup: refund 80% (20% fee cancel)
- Cancel setelah pickup: tidak bisa cancel, hanya dispute

**FR-PAY-021:** SLA breach compensation: otomatis issue voucher ke customer (dari penalti kurir)  
**FR-PAY-022:** Insurance claim: trigger ke asuransi mitra jika paket hilang/rusak (konfirmasi admin)  
**FR-PAY-023:** Refund processing time: maks 3 hari kerja

---

## 12. SECURITY REQUIREMENTS

**FR-SEC-001:** JWT access token (15 menit) + refresh token (30 hari)  
**FR-SEC-002:** TLS 1.3 untuk semua komunikasi API  
**FR-SEC-003:** AES-256-GCM untuk data sensitif at rest (nomor HP, koordinat GPS, foto KTP)  
**FR-SEC-004:** Certificate pinning di mobile app (mencegah MITM)  
**FR-SEC-005:** API rate limiting: 100 req/menit per user, 1000 req/menit per IP  
**FR-SEC-006:** Root/jailbreak detection di courier app (blokir accept order)  
**FR-SEC-007:** GPS spoofing detection: Kalman filter + velocity plausibility check  
**FR-SEC-008:** Data masking: nomor HP customer tidak terekspos ke kurir (gunakan nomor virtual)  
**FR-SEC-009:** GDPR/UU PDP compliance: consent management, data retention policy, right to deletion  
**FR-SEC-010:** Penetration testing wajib sebelum go-live  
**FR-SEC-011:** Dependency vulnerability scanning (Snyk/Dependabot) di CI/CD pipeline  
**FR-SEC-012:** WAF (Web Application Firewall) untuk API Gateway

---

## 13. NON-FUNCTIONAL REQUIREMENTS

### 13.1 Performance

| Metrik | Target |
|---|---|
| API response time (P95) | ≤300ms |
| GPS update ingestion | ≤10 detik end-to-end |
| Order matching latency | ≤5 detik |
| App launch time | ≤3 detik cold start |
| Scan processing time | ≤5 detik |
| Dashboard load time | ≤2 detik |

### 13.2 Availability

| Metrik | Target |
|---|---|
| Uptime SLA | 99.5% (≤3.6 jam downtime/bulan) |
| Planned maintenance window | Minggu 02:00-04:00 WIB |
| RTO (Recovery Time Objective) | ≤30 menit |
| RPO (Recovery Point Objective) | ≤1 jam |

### 13.3 Scalability

| Fase | Target Order/Hari | Concurrent Users | Infrastruktur |
|---|---|---|---|
| Pilot | 50 | 100 | Basic (2 vCPU, 4GB) |
| Early Traction | 350 | 700 | Medium (4 vCPU, 8GB) |
| Scale | 1.000 | 2.000 | Large + Auto-scaling |
| Expansion | 5.000 | 10.000 | Multi-region, CDN |

### 13.4 Offline Capability (Mobile)

**FR-OFFLINE-001:** Courier app bisa lanjut delivery jika internet putus sesaat:
- Cache order detail lokal
- Simpan GPS log lokal, sync saat koneksi pulih
- Scan foto tersimpan lokal, upload saat online

**FR-OFFLINE-002:** Customer app: riwayat order cached lokal untuk lihat tanpa internet

---

## 14. API CONTRACT OVERVIEW

### 14.1 Core Endpoints

```
Authentication
  POST /auth/register
  POST /auth/login
  POST /auth/otp/send
  POST /auth/otp/verify
  POST /auth/refresh

Order
  POST   /orders              — buat order baru
  GET    /orders/:id          — detail order
  GET    /orders              — list order (customer/kurir/admin)
  PATCH  /orders/:id/status   — update status
  DELETE /orders/:id          — cancel order
  POST   /orders/:id/dispute  — buka dispute

Pricing
  POST /pricing/estimate      — estimasi harga sebelum order
  GET  /pricing/config        — config harga (admin only)

Scanning
  POST /scan/analyze          — proses gambar → dimensi

Tracking
  POST /tracking/location     — kurir kirim GPS
  GET  /tracking/:order_id    — live tracking data

Payment
  POST /payments/create       — buat QRIS payment
  POST /payments/webhook      — webhook dari payment gateway
  POST /payments/refund       — proses refund

Courier
  GET  /couriers/nearby       — kurir aktif di radius tertentu
  POST /couriers/handover     — konfirmasi handover
  GET  /couriers/:id/stats    — statistik kurir

Admin
  GET  /admin/dashboard       — summary operasional
  GET  /admin/orders          — semua order
  POST /admin/zones           — manajemen zona
  POST /admin/pricing         — update config harga
```

### 14.2 WebSocket Events

```
Client → Server:
  courier:location_update { lat, lng, accuracy, heading, timestamp }
  courier:status_update   { status: online|offline|busy }

Server → Client:
  order:new              { order_id, details, expires_at }
  order:status_changed   { order_id, status, timestamp }
  courier:location       { courier_id, lat, lng, eta }
  alert:sla_warning      { order_id, leg, minutes_remaining }
  alert:system           { type, message }
```

---

## 15. FEATURE FLAGS — DEFINISI LENGKAP & MATRIKS AKSES

### [REVISI] 3.0 Prinsip Baru: Model Delivery sebagai Feature Flag

Mulai PRD v1.1, **setiap model pengiriman (P2P, 2-Kaki, 3-Kaki) diperlakukan sebagai fitur yang bisa diaktifkan/dinonaktifkan secara independen oleh Super Admin** tanpa memerlukan deployment ulang aplikasi.

Keputusan ini didasarkan pada:
- **Fase Pilot (Bulan 1–3):** Hanya P2P yang aktif default — operasi paling sederhana dan margin tertinggi (36.4%)
- **Fase Early Traction (Bulan 4–9):** 2-Kaki diaktifkan setelah validasi lapangan
- **Fase Growth (Bulan 7–12+):** 3-Kaki diaktifkan hanya setelah **3-Leg Activation Framework** terpenuhi

```
STATUS AWAL PILOT (default):
┌─────────────────────┬──────────┬─────────────────────────────────┐
│ Feature Flag Key    │ Status   │ Keterangan                      │
├─────────────────────┼──────────┼─────────────────────────────────┤
│ model_p2p           │ ✅ ON    │ Aktif sejak hari pertama pilot  │
│ model_two_legs      │ ✅ ON    │ Aktif sejak hari pertama pilot  │
│ model_three_legs    │ ❌ OFF   │ Dinonaktifkan — aktifkan manual │
└─────────────────────┴──────────┴─────────────────────────────────┘
```

---

### [BARU] 3.1 Definisi Feature Flags per Model

#### Flag: `model_p2p`
```json
{
  "key": "model_p2p",
  "is_enabled": true,
  "config": {
    "max_distance_km": 15,
    "active_zones": ["JAK-TIM", "JAK-BAR", "JAK-PST", "JAK-UTR", "JAK-SEL"],
    "rollout_pct": 100,
    "fallback_if_disabled": "reject_with_message"
  },
  "description": "Model Point-to-Point: 1 kurir dari pickup ke delivery (<15 km). Model utama pilot.",
  "updated_by": "super_admin_id",
  "updated_at": "2026-04-29T00:00:00Z"
}
```

#### Flag: `model_two_legs`
```json
{
  "key": "model_two_legs",
  "is_enabled": true,
  "config": {
    "max_distance_km": 25,
    "active_zones": ["JAK-TIM", "JAK-BAR", "JAK-PST", "JAK-UTR", "JAK-SEL"],
    "min_courier_density_per_zone": 10,
    "rollout_pct": 100,
    "fallback_if_disabled": "reject_with_message"
  },
  "description": "Model Transfer 2-Kaki: 2 kurir untuk rute menengah (15–25 km). Aktif sejak pilot.",
  "updated_by": "super_admin_id",
  "updated_at": "2026-04-29T00:00:00Z"
}
```

#### Flag: `model_three_legs`
```json
{
  "key": "model_three_legs",
  "is_enabled": false,
  "config": {
    "max_distance_km": 50,
    "active_zones": [],
    "min_courier_density_per_zone": 30,
    "activation_trigger": "manual_super_admin_only",
    "rollout_pct": 0,
    "fallback_if_disabled": "reject_with_message",
    "rejection_message_id": "MSG_THREE_LEGS_UNAVAILABLE"
  },
  "description": "Model Relay 3-Kaki: 3 kurir untuk rute panjang (>25 km). NONAKTIF — aktifkan hanya setelah 3-Leg Activation Framework terpenuhi.",
  "updated_by": null,
  "updated_at": null
}
```

---

### [BARU] 3.2 Three-Leg Activation Framework

3-Kaki **hanya boleh diaktifkan oleh Super Admin** setelah seluruh kondisi berikut terpenuhi:

#### Gate Utama (Wajib — tidak bisa dikompromikan)

| Gate | Threshold | Cara Ukur |
|---|---|---|
| **SLA compliance 2-Kaki** | **≥93% selama 4 minggu berturut-turut** | Dashboard SLA admin |

> Ini adalah *lagging indicator* paling jujur — membuktikan fondasi operasional sudah matang. SLA 2-Kaki ≥93% konsisten berarti kurir hafal zona, koordinasi berjalan, GPS+handover stabil, CS terlatih, dan tim ops mampu monitor multi-leg order. Semua ini prasyarat untuk 3-Kaki yang lebih kompleks.

#### Supporting Checklist (Semua harus ✅ sebelum Super Admin bisa aktifkan)

| # | Kondisi | Threshold |
|---|---|---|
| 1 | Kurir aktif per zona | ≥30 kurir per zona yang akan aktifkan 3-Kaki |
| 2 | Titik temu tervalidasi lapangan | ≥5 titik temu per pair zona (bukan hanya di-input di peta) |
| 3 | Volume order harian | ≥200 order/hari (network effect sudah terasa) |

#### Estimasi Kapan Tercapai

```
Bulan 1–6:  Fokus P2P + 2-Kaki. Build density kurir per zona.
Bulan 7–9:  Evaluasi SLA compliance 2-Kaki (4 minggu window).
Bulan 9–10: Jika gate + checklist hijau → Super Admin aktifkan
            model_three_legs per zona satu-per-satu.
Bulan 10+:  Rollout bertahap ke semua zona.
```

---

### [REVISI] 3.3 Algoritma Pemilihan Model — Dengan Feature Flag Check

**Algoritma lama (PRD v1.0):**
```
IF jarak < 15 km  → P2P
IF jarak 15-25 km → 2-Kaki atau 3-Kaki
IF jarak > 25 km  → 3-Kaki
```

**Algoritma baru (PRD v1.1) — dengan feature flag:**
```
═══════════════════════════════════════════════════════════════
FUNGSI: pilih_model(pickup_coords, dropoff_coords, user_id)
═══════════════════════════════════════════════════════════════

LANGKAH 1: Hitung jarak & zona
  jarak_km        = hitung_jarak(pickup, dropoff)          [Google Maps]
  zona_pickup     = deteksi_zona(pickup)                   [PostGIS]
  zona_dropoff    = deteksi_zona(dropoff)                  [PostGIS]
  zona_adjacent   = cek_adjacency(zona_pickup, zona_dropoff)

LANGKAH 2: Baca feature flags dari Redis (TTL 60 detik)
  flag_p2p        = get_flag("model_p2p")
  flag_two_legs   = get_flag("model_two_legs")
  flag_three_legs = get_flag("model_three_legs")

LANGKAH 3: Validasi zona aktif per flag
  p2p_zone_ok     = zona_pickup IN flag_p2p.config.active_zones
  two_zone_ok     = zona_pickup IN flag_two_legs.config.active_zones
                    AND zona_dropoff IN flag_two_legs.config.active_zones
  three_zone_ok   = zona_pickup IN flag_three_legs.config.active_zones
                    AND zona_dropoff IN flag_three_legs.config.active_zones

LANGKAH 4: Seleksi model (urutan prioritas)
  IF jarak_km <= 15:
    IF flag_p2p.is_enabled AND p2p_zone_ok:
      RETURN MODEL_P2P
    ELSE:
      RETURN ERROR("P2P tidak tersedia di zona ini")

  ELSE IF jarak_km <= 25:
    IF flag_two_legs.is_enabled AND two_zone_ok:
      RETURN MODEL_TWO_LEGS
    ELSE IF flag_three_legs.is_enabled AND three_zone_ok:
      RETURN MODEL_THREE_LEGS              ← fallback ke 3-Kaki jika 2-Kaki off
    ELSE:
      RETURN ERROR("Layanan belum tersedia untuk rute ini")

  ELSE (jarak_km > 25):
    IF flag_three_legs.is_enabled AND three_zone_ok:
      RETURN MODEL_THREE_LEGS
    ELSE:
      RETURN ERROR_WITH_MESSAGE(           ← 3-Kaki off = rute >25km ditolak
        flag_three_legs.config.rejection_message_id
      )

LANGKAH 5: Terapkan dynamic pricing ke model terpilih
  RETURN apply_dynamic_pricing(model, harga_dasar, kondisi_realtime)

═══════════════════════════════════════════════════════════════
```

#### Pesan Penolakan untuk Customer App

| Skenario | Pesan yang Ditampilkan |
|---|---|
| Rute >25 km, 3-Kaki nonaktif | "Maaf, rute ini belum tersedia saat ini. Kami sedang memperluas jangkauan layanan kami. Coba lagi dalam beberapa minggu!" |
| Zona belum aktif | "Layanan belum tersedia di area ini. Kami akan segera hadir!" |
| P2P nonaktif (sangat jarang) | "Layanan sedang dalam pemeliharaan. Coba beberapa menit lagi." |

---

### [BARU] FR-WEB-080: Feature Flag Management (Super Admin Only)

**FR-WEB-080:** Halaman Feature Flags — hanya dapat diakses oleh role `super_admin`.

**FR-WEB-081:** Tampilan daftar semua feature flags dengan:
- Status toggle ON/OFF (dengan konfirmasi modal sebelum ubah)
- Config JSON viewer/editor dengan syntax highlighting
- Last updated by (nama + waktu)
- Tombol "Audit History" per flag

**FR-WEB-082:** Aktivasi `model_three_legs` memiliki **double confirmation**:
```
Langkah 1: Admin klik toggle ON
Langkah 2: Modal muncul — tampilkan 3-Leg Activation Checklist:
           □ SLA 2-Kaki ≥93% (4 minggu) → [LIHAT DATA]
           □ Kurir aktif ≥30/zona       → [LIHAT DATA]
           □ Titik temu ≥5 tervalidasi  → [LIHAT DATA]
           □ Order ≥200/hari            → [LIHAT DATA]
Langkah 3: Admin harus centang manual: "Saya konfirmasi semua kondisi terpenuhi"
Langkah 4: Input catatan alasan aktivasi (mandatory, min 50 karakter)
Langkah 5: Masukkan password + TOTP 2FA code
Langkah 6: Submit → simpan ke admin_logs + aktifkan flag
```

**FR-WEB-083:** Perubahan feature flag **tidak bisa di-undo otomatis** — hanya bisa di-toggle ulang secara manual dengan konfirmasi yang sama.

**FR-WEB-084:** Setiap perubahan flag dikirimkan notifikasi ke:
- Semua `super_admin` aktif via email + in-app
- Slack/Discord ops channel
- Dicatat lengkap di `admin_logs` (before_state + after_state)

**FR-WEB-085:** Config editor per flag:
- Edit `active_zones` (multi-select checkbox dari daftar zona)
- Edit `rollout_pct` (slider 0–100% untuk gradual rollout)
- Edit `min_courier_density_per_zone` (number input)
- Preview: "Dengan config ini, berapa % order yang akan terdampak?" (simulasi)

**FR-WEB-086:** Dashboard 3-Leg Readiness — halaman khusus yang menampilkan:

```
┌─────────────────────────────────────────────────────────┐
│         3-LEG ACTIVATION READINESS DASHBOARD            │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ GATE UTAMA                                              │
│ SLA 2-Kaki (4 minggu rolling)                          │
│ ████████████████░░░░  87.3%  [TARGET: 93%]             │
│ Minggu 1: 85.2% | Minggu 2: 86.1% | Minggu 3: 88.7%   │
│                              Minggu 4: 89.1%           │
│ Status: ❌ BELUM MEMENUHI                               │
│                                                         │
│ SUPPORTING CHECKLIST                                    │
│ □ Kurir aktif/zona: JAK-TIM 28 | JAK-BAR 22 [MIN: 30]│
│ □ Titik temu valid: 4/5 tervalidasi lapangan           │
│ □ Order/hari: 187 [TARGET: 200]                        │
│                                                         │
│ ESTIMASI SIAP: ~6 minggu lagi                          │
│                                                         │
│ [AKTIFKAN 3-KAKI]  ← Tombol disabled sampai semua ✅   │
└─────────────────────────────────────────────────────────┘
```

---

### [REVISI] 9.1 Model Selection — Integrasi Feature Flag

Algoritma pemilihan model di routing-service sekarang **selalu membaca feature flags dari Redis sebelum memilih model**. Cache flag di Redis di-refresh setiap 60 detik dari database. Perubahan flag oleh Super Admin akan terasa di sistem maksimal **60 detik** setelah disimpan (bukan real-time instantaneous, tapi cukup cepat untuk operasional).

**FR-RELAY-005 [BARU]:** Jika flag model berubah saat order sedang dalam proses, order yang sedang berjalan **tidak terpengaruh** — flag hanya berlaku untuk order baru yang masuk setelah perubahan.

**FR-RELAY-006 [BARU]:** Jika 2-Kaki dinonaktifkan sementara (misal: gangguan operasional), sistem otomatis:
1. Stop terima order 2-Kaki baru
2. Tampilkan pesan ke customer: "Layanan rute menengah sedang dalam pemeliharaan"
3. Order 2-Kaki yang sedang berjalan tetap dilanjutkan sampai selesai
4. Alert ke admin + log ke `admin_logs`

---

### [BARU] FR-PRICE-020: Feature Flag Guard di Pricing Engine

Pricing engine harus **validasi flag aktif sebelum hitung harga**:

```
FUNGSI: hitung_harga(order_request)
  model = pilih_model(...)           ← sudah include flag check
  IF model == ERROR:
    RETURN error_response             ← tidak sampai ke pricing
  
  harga = pricing_engine(model, ...)
  RETURN harga
```

Tidak ada perubahan formula pricing — flag hanya mempengaruhi apakah model tersedia atau tidak, bukan nilai harganya.

---

### [BARU] FR-SEC-020: Feature Flag Access Control

**FR-SEC-020:** Endpoint feature flag management hanya bisa diakses dengan:
- Role: `super_admin` (tidak cukup `ops_manager` atau `finance`)
- 2FA aktif dan sudah terverifikasi di session saat ini
- IP address tercatat di whitelist VPN (opsional, untuk keamanan ekstra)

**FR-SEC-021:** Rate limiting khusus untuk endpoint feature flag:
- Max 10 perubahan flag per jam per super_admin
- Jika melebihi: akun di-lock sementara + alert ke super_admin lain

**FR-SEC-022:** Feature flag values **tidak boleh di-cache di client** (mobile app atau web admin). Selalu fetch dari server. Ini mencegah stale state jika flag berubah.

---

## MATRIKS AKSES FEATURE FLAGS (RBAC)

| Role | Lihat Flags | Edit Config | Toggle ON/OFF | Aktifkan 3-Kaki |
|---|---|---|---|---|
| `super_admin` | ✅ | ✅ | ✅ | ✅ (dengan 2FA + checklist) |
| `ops_manager` | ✅ | ❌ | ❌ | ❌ |
| `finance` | ❌ | ❌ | ❌ | ❌ |
| `cs_agent` | ❌ | ❌ | ❌ | ❌ |
| `zone_manager` | ✅ (zona sendiri) | ❌ | ❌ | ❌ |
| `courier` | ❌ | ❌ | ❌ | ❌ |
| `customer` | ❌ | ❌ | ❌ | ❌ |

---

## DAFTAR SEMUA FEATURE FLAGS SISTEM

| Key | Default | Akses Toggle | Keterangan |
|---|---|---|---|
| `model_p2p` | ✅ ON | Super Admin | Model P2P (<15 km) |
| `model_two_legs` | ✅ ON | Super Admin | Model 2-Kaki (15–25 km) |
| `model_three_legs` | ❌ OFF | Super Admin (+ checklist) | Model 3-Kaki (>25 km) — pilot nonaktif |
| `dynamic_pricing_peak_hour` | ✅ ON | Super Admin | Surge jam sibuk |
| `dynamic_pricing_weather` | ✅ ON | Super Admin | Surge cuaca hujan |
| `dynamic_pricing_demand` | ✅ ON | Super Admin | Surge demand/supply |
| `volumetric_scanning` | ✅ ON | Super Admin | Fitur scan dimensi via kamera |
| `arcore_scanning` | ❌ OFF | Super Admin | ARCore/LiDAR enhancement (fase 2) |
| `package_insurance` | ✅ ON | Super Admin | Asuransi barang opsional |
| `in_app_chat` | ✅ ON | Super Admin | Chat kurir-customer |
| `loyalty_program` | ✅ ON | Super Admin | Tier Bronze/Silver/Gold |
| `referral_program` | ✅ ON | Super Admin | Program referral + reward |
| `scheduled_delivery` | ❌ OFF | Super Admin | Pengiriman terjadwal (fase 2) |
| `multi_zone_courier` | ✅ ON | Super Admin | Kurir bisa assign 2 zona |
| `courier_leaderboard` | ✅ ON | Super Admin | Leaderboard zona kurir |

---

## GLOSSARY TAMBAHAN

| Term | Definisi |
|---|---|
| Feature Flag | Switch ON/OFF untuk fitur sistem tanpa deployment ulang. Disimpan di DB dan di-cache Redis. |
| Gate Utama | Kondisi mandatory yang harus terpenuhi sebelum fitur bisa diaktifkan. |
| Supporting Checklist | Kondisi pendukung yang melengkapi gate utama. Semua harus ✅. |
| 3-Leg Activation Framework | Sistem terstruktur untuk memutuskan kapan 3-Kaki boleh diaktifkan. |
| Rollout Pct | Persentase traffic yang mendapat fitur baru (0–100%). Untuk gradual rollout. |
| Double Confirmation | Mekanisme konfirmasi 2 langkah untuk perubahan kritis (3-Kaki). |
| Rejection Message | Pesan yang ditampilkan ke customer jika model tidak tersedia. |


---

## 16. GLOSSARY

| Term | Definisi |
|---|---|
| P2P | Point-to-Point: satu kurir handle pickup hingga delivery (<15 km) |
| 2-Kaki | Transfer 2 kurir, rute menengah (15-25 km) |
| 3-Kaki | Relay 3 kurir, rute panjang (>25 km) |
| Titik Temu | Meeting point dinamis antar-kurir untuk handover |
| Relay Score | Skor performa kurir (1.0-5.0) berdasarkan on-time, dokumentasi, rating |
| SLA | Service Level Agreement, batas waktu per leg |
| Dynamic Pricing | Penyesuaian harga real-time berdasarkan faktor jam/cuaca/demand |
| Volumetric Weight | Berat kalkulasi dari dimensi (P×L×T÷5000), dibandingkan berat aktual |
| e-POD | Electronic Proof of Delivery (foto + tanda tangan digital) |
| Chain of Custody | Dokumentasi rantai kepemilikan paket (siapa pegang kapan, di mana) |
| MDR | Merchant Discount Rate: biaya payment gateway (0.7% untuk QRIS reguler) |
| Geofencing | Batas virtual zona kurir, alert jika kurir keluar zona |
| ARCore/ARKit | Framework AR dari Google/Apple untuk depth sensing |
| CAC | Customer Acquisition Cost |
| LTV | Lifetime Value customer |
| BPJS TK | BPJS Ketenagakerjaan (asuransi sosial ketenagakerjaan) |
