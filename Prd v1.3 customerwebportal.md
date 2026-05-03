# PRD v1.3 — Customer Web Portal

## Platform Logistik Hyperlocal Relay

### Update: 29 April 2026 | Tambahan dari PRD v1.2

> **Changelog v1.3:** Penambahan Customer Web Portal (React/Next.js) — web app lengkap untuk customer
> yang ingin transaksi via browser/laptop, khususnya UMKM yang mengelola pengiriman massal.
> Landing Page dari v1.2 diperluas menjadi satu domain dengan portal.

---

## ARSITEKTUR WEB CUSTOMER

```
relay.co.id/                     → Landing Page (public, SSR/SSG)
relay.co.id/cek-resi             → Cek resi publik (no auth)
relay.co.id/login                → Login customer
relay.co.id/daftar               → Registrasi customer
relay.co.id/app/                 → Customer Web Portal (auth required)
relay.co.id/app/dashboard        → Home dashboard
relay.co.id/app/kirim            → Single order booking
relay.co.id/app/kirim-massal     → Bulk order via Excel
relay.co.id/app/orders           → Riwayat & tracking order
relay.co.id/app/orders/:id       → Detail order + tracking live
relay.co.id/app/resi             → Resi saya
relay.co.id/app/resi/:id         → Detail resi + QR
relay.co.id/app/alamat           → Address book
relay.co.id/app/laporan          → Dashboard UMKM + export
relay.co.id/app/profil           → Profil & pengaturan
relay.co.id/app/voucher          → Voucher & promo
```

**Tech Stack:**

- Framework: Next.js 14+ (App Router, TypeScript)
- State management: Zustand
- Data fetching: React Query (TanStack Query)
- UI: Tailwind CSS + shadcn/ui component library
- Maps: @vis.gl/react-google-maps
- Charts: Recharts
- Excel: SheetJS (xlsx) untuk parse + generate
- QR: qrcode.react untuk tampilkan, jsQR untuk scan via webcam
- WebSocket: socket.io-client
- Form: React Hook Form + Zod validation
- PDF preview: react-pdf

---

## SEKSI 1: LANDING PAGE (DIPERLUAS DARI v1.2)

### FR-LAND-010: Navbar Global

**FR-LAND-010:** Navbar sticky di semua halaman landing:

- Logo + nama layanan
- Menu: Layanan, Harga, Untuk UMKM, Tentang
- Tombol: [Cek Resi] [Masuk] [Daftar Gratis]
- Mobile: hamburger menu

**FR-LAND-011:** Halaman `/cek-resi` (publik):

- Input nomor resi → tampilkan tracking terbatas
- Status, kota asal → tujuan, estimasi tiba
- CTA: "Login untuk lihat detail lengkap"
- Embed di landing page sebagai section juga

**FR-LAND-012:** Halaman `/login`:

- Input nomor HP → OTP (WhatsApp/SMS)
- Google Sign In
- Link "Belum punya akun? Daftar"
- Remember me (persistent session 30 hari)

**FR-LAND-013:** Halaman `/daftar`:

- Step 1: nomor HP + OTP
- Step 2: nama lengkap + email (opsional)
- Step 3: setup PIN 6 digit
- Referral code input (opsional)
- Auto-redirect ke `/app/dashboard` setelah selesai

---

## SEKSI 2: CUSTOMER WEB PORTAL — LAYOUT & NAVIGASI

### FR-WEB-CUST-001: Layout Utama Portal

**FR-WEB-CUST-001:** Layout `/app/*`:

```
┌──────────────────────────────────────────────────────────────┐
│ TOPBAR: Logo | Search order/resi... | 🔔 Notif | Profil ▾   │
├──────────┬───────────────────────────────────────────────────┤
│          │                                                    │
│ SIDEBAR  │              MAIN CONTENT                         │
│ (240px)  │                                                    │
│          │                                                    │
│ 🏠 Home  │                                                    │
│ 📦 Kirim │                                                    │
│ 📋 Massal│                                                    │
│ 🚚 Order │                                                    │
│ 🧾 Resi  │                                                    │
│ 📍 Alamat│                                                    │
│ 📊 Laporan│                                                   │
│ 🎟 Voucher│                                                   │
│ ⚙ Profil │                                                    │
│          │                                                    │
└──────────┴───────────────────────────────────────────────────┘
```

**FR-WEB-CUST-002:** Sidebar collapsed mode (mobile/tablet ≤1024px):

- Sidebar menjadi bottom navigation bar (5 menu utama)
- Atau hamburger overlay

**FR-WEB-CUST-003:** Global search bar (top):

- Cari berdasarkan: nomor order, nomor resi, nama penerima, alamat
- Hasil instant (debounced 300ms)
- Shortcut keyboard: Ctrl+K / Cmd+K

**FR-WEB-CUST-004:** Notification center (🔔):

- Dropdown panel: 10 notif terbaru
- Badge count unread
- Link "Lihat semua" → halaman notifikasi lengkap
- Real-time update via WebSocket

---

## SEKSI 3: DASHBOARD HOME

### FR-WEB-CUST-010: Dashboard Home `/app/dashboard`

**FR-WEB-CUST-010:** Layout dashboard:

```
┌─────────────────────────────────────────────────────────────┐
│  Selamat datang, [Nama]! 👋                  [Kirim Sekarang]│
├──────────┬──────────┬──────────┬────────────────────────────┤
│ Order    │ Selesai  │ Total    │ Loyalty Tier               │
│ Aktif: 3 │ Bln ini: │ Belanja: │ 🥈 Silver                  │
│          │ 47       │ Rp2,3jt  │ 3 order lagi → Gold        │
├──────────┴──────────┴──────────┴────────────────────────────┤
│ ORDER AKTIF (real-time)                          [Lihat Semua]│
│ ┌────────────────────────────────────────────────────────┐  │
│ │ RLY-20260429-00142 | Budi Santoso | 🔵 Dalam Perjalanan│  │
│ │ Kurir: Andi (⭐4.8) | ETA: 15 menit | [Track Live]    │  │
│ └────────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│ SHORTCUT AKSI CEPAT                                         │
│ [📦 Kirim Sekarang] [📋 Kirim Massal] [🧾 Unduh Resi]     │
├─────────────────────────────────────────────────────────────┤
│ GRAFIK ORDER 30 HARI (bar chart)        PROMO AKTIF 🎟      │
│ ░░▓▓░░▓▓▓░░░▓▓▓▓▓░░▓▓▓▓▓▓▓▓░░▓▓▓▓▓▓   UMKM10: -10%       │
└─────────────────────────────────────────────────────────────┘
```

**FR-WEB-CUST-011:** Widget order aktif:

- Refresh otomatis setiap 30 detik (atau WebSocket)
- Klik row → expand mini-tracking (peta + ETA)
- Max tampil 5 order aktif, sisanya "lihat semua"

**FR-WEB-CUST-012:** Grafik order 30 hari:

- Bar chart harian
- Hover: tampilkan jumlah order + total biaya hari itu
- Toggle: by count / by value (Rp)

---

## SEKSI 4: SINGLE ORDER BOOKING

### FR-WEB-CUST-020: Halaman Kirim `/app/kirim`

**FR-WEB-CUST-020:** Form booking order — layout 2 kolom (form kiri, summary kanan):

**Kolom Kiri — Form:**

```
ALAMAT PICKUP
┌─────────────────────────────────────────┐
│ 🔍 Cari alamat...  [Pilih dari Buku]   │
│ [Peta mini — pin lokasi]                │
└─────────────────────────────────────────┘

ALAMAT TUJUAN
┌─────────────────────────────────────────┐
│ 🔍 Cari alamat...  [Pilih dari Buku]   │
│ Nama penerima: ___________________      │
│ HP penerima:   ___________________      │
└─────────────────────────────────────────┘

DETAIL PAKET
┌─────────────────────────────────────────┐
│ Nama barang:  _________________________  │
│ Kategori:     [Dropdown ▾]              │
│ Berat (kg):   [___] atau [Scan Webcam] │
│ Dimensi (cm): P[__] × L[__] × T[__]   │
│               [Hitung Volumetrik]       │
│ Asuransi:     ○ Tidak  ○ Ya            │
│               Nilai barang: Rp[______]  │
│ Catatan:      _________________________  │
└─────────────────────────────────────────┘

JADWAL
○ Sekarang  ○ Terjadwal [Date-time picker]
```

**Kolom Kanan — Summary (sticky):**

```
ESTIMASI HARGA
┌─────────────────────────────────────────┐
│ Model:    P2P (< 15 km)                 │
│ Jarak:    8.3 km                        │
│ ─────────────────────────────────────── │
│ Ongkos dasar:      Rp18.000            │
│ Surge (jam sibuk): Rp3.600  (+20%)     │
│ Asuransi:          Rp0                 │
│ ─────────────────────────────────────── │
│ TOTAL:             Rp21.600            │
│                                         │
│ ETA: ~35 menit                         │
│ ⚡ SURGE PRICING AKTIF                 │
│                                         │
│ [Bayar Sekarang — Rp21.600]            │
│ Bayar via QRIS                          │
└─────────────────────────────────────────┘
```

**FR-WEB-CUST-021:** Summary update real-time saat form diisi:

- Harga update setiap pickup/dropoff address berubah
- Debounced 500ms setelah ketik untuk hindari terlalu banyak API call
- Loading skeleton saat kalkulasi

**FR-WEB-CUST-022:** Scan dimensi via webcam (opsional):

- Tombol "Scan via Webcam" — buka modal kamera browser
- Instruksi: letakkan paket + kartu referensi di depan webcam
- Gunakan ML model yang sama dengan mobile (TFLite WASM atau API call)
- Fallback: input manual

**FR-WEB-CUST-023:** Payment modal:

- Tampilkan QR QRIS (besar, mudah scan)
- Countdown 15 menit
- Instruksi scan QR dengan e-wallet
- Auto-detect payment (polling + WebSocket)
- Fallback: tombol "Saya sudah bayar" → manual check

---

## SEKSI 5: BULK ORDER WEB

### FR-WEB-CUST-030: Halaman Kirim Massal `/app/kirim-massal`

**FR-WEB-CUST-030:** Layout 3 tahap (stepper di atas):

```
① Upload File  →  ② Review & Edit  →  ③ Bayar & Proses
```

**Tahap 1 — Upload:**

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│   📥 Download Template Excel                            │
│   [Download Template v1]                                │
│                                                          │
│   ┌──────────────────────────────────────────────────┐  │
│   │                                                  │  │
│   │   Drag & drop file .xlsx di sini                │  │
│   │   atau                                           │  │
│   │   [Pilih File dari Komputer]                    │  │
│   │                                                  │  │
│   │   Max 500 baris | Max 5MB | Format: .xlsx only  │  │
│   └──────────────────────────────────────────────────┘  │
│                                                          │
│   📍 Alamat Pickup (untuk semua order):                 │
│   [Pilih dari Buku Alamat ▾] atau [Input Baru]         │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**Tahap 2 — Review & Edit:**

```
┌──────────────────────────────────────────────────────────┐
│ Hasil Validasi:  45 valid ✅  |  2 error ❌             │
│                  [Download Error Report]                 │
├──────────────────────────────────────────────────────────┤
│ Filter: [Semua ▾] [Search penerima...] [Edit Mode: OFF] │
├──────────────────────────────────────────────────────────┤
│ No │ Penerima      │ Tujuan       │ Berat│ Harga  │ Aksi│
│  1 │ Budi Santoso  │ Jl. Merdeka  │ 1kg  │Rp18rb  │ ✏ 🗑│
│  2 │ Siti Rahayu   │ Jl. Pahlawan │ 2kg  │Rp24rb  │ ✏ 🗑│
│ ❌3│ Ahmad Yusuf   │ ??? tidak    │ —    │Error   │ ✏ 🗑│
│    │               │ ditemukan    │      │        │     │
├──────────────────────────────────────────────────────────┤
│ TOTAL: 45 order × avg Rp21.000 = Rp945.000             │
│ Diskon loyalty Silver (-5%): -Rp47.250                 │
│ TOTAL BAYAR: Rp897.750                                  │
│                          [Lanjut ke Pembayaran →]       │
└──────────────────────────────────────────────────────────┘
```

**FR-WEB-CUST-031:** Edit inline per baris:

- Klik ✏ → baris menjadi editable (input fields)
- Simpan → re-validate baris tersebut + update harga
- Ideal untuk fix baris error langsung di web

**FR-WEB-CUST-032:** Bulk actions:

- Checkbox select multiple → hapus selected
- "Hapus semua error" (1 klik hapus semua baris tidak valid)
- "Perbaiki otomatis" (coba geocode ulang alamat yang gagal)

**Tahap 3 — Bayar & Proses:**

```
┌──────────────────────────────────────────────────────────┐
│  PEMBAYARAN                                              │
│  ┌────────────────────────┐  Total: Rp897.750           │
│  │   [QR QRIS BESAR]      │  Berlaku: 29:45             │
│  │                        │                             │
│  │                        │  Scan dengan:               │
│  │                        │  GoPay | OVO | DANA        │
│  │                        │  BCA | Mandiri | dll        │
│  └────────────────────────┘                             │
│                                                          │
│  Atau salin kode QR: [COPY] XXXXXXXXXXXXXXXXXXXX        │
└──────────────────────────────────────────────────────────┘

[setelah bayar]

┌──────────────────────────────────────────────────────────┐
│  ✅ Pembayaran diterima!                                 │
│  Memproses 45 order...                                   │
│  ████████████████░░░░░  36/45 (80%)                     │
│                                                          │
│  Selesai: 36 | Gagal: 0 | Dalam proses: 9              │
│                                                          │
│  [Lihat Detail Per Order]  [Tutup — proses di background]│
└──────────────────────────────────────────────────────────┘
```

**FR-WEB-CUST-033:** Processing bisa di-background:

- Pengguna boleh navigasi ke halaman lain
- Progres tetap jalan di background
- Toast notification di corner: "Proses massal: 40/45 ✅"
- Notif setelah semua selesai: "45 order berhasil! Unduh ZIP Resi"

---

## SEKSI 6: ORDER MANAGEMENT

### FR-WEB-CUST-040: Halaman Order `/app/orders`

**FR-WEB-CUST-040:** Tabel order dengan fitur lengkap:

```
┌──────────────────────────────────────────────────────────┐
│ RIWAYAT ORDER                                    [+ Baru]│
├──────────────────────────────────────────────────────────┤
│ Filter: [Status ▾] [Tanggal: 1-30 Apr ▾] [Model ▾]     │
│ Search: [Cari nomor order, penerima, alamat...]          │
├──────────────────────────────────────────────────────────┤
│ □ No. Order        │ Penerima   │ Status     │ Harga│Aksi│
│ □ RLY-20260429-142 │ Budi S.    │ 🚚 Dikirim │21rb  │ 👁 │
│ □ RLY-20260428-087 │ Siti R.    │ ✅ Selesai │24rb  │ 👁 │
│ □ RLY-20260428-051 │ Ahmad Y.   │ ✅ Selesai │18rb  │ 👁 │
├──────────────────────────────────────────────────────────┤
│ □ Pilih semua  [Unduh Resi Terpilih]  Showing 1-20/234  │
└──────────────────────────────────────────────────────────┘
```

**FR-WEB-CUST-041:** Filter & search:

- Filter by status: semua / aktif / selesai / dibatalkan / dispute
- Filter by date range (date picker)
- Filter by model: P2P / 2-Kaki
- Filter by bulk/single
- Search full-text (nomor order, penerima, alamat)
- URL-based filter (bisa di-bookmark/share)

**FR-WEB-CUST-042:** Bulk download resi:

- Checkbox select multiple order
- Tombol "Unduh Resi Terpilih" → server generate ZIP → download
- Max 100 resi per download

### FR-WEB-CUST-043: Detail Order `/app/orders/:id`

**FR-WEB-CUST-043:** Halaman detail order — layout 2 kolom:

**Kolom Kiri — Tracking Live:**

```
┌────────────────────────────────────┐
│  [GOOGLE MAPS EMBED — FULL HEIGHT] │
│  Marker: pickup, dropoff, kurir   │
│  Polyline: rute saat ini           │
│  ETA: 12 menit                     │
└────────────────────────────────────┘
```

**Kolom Kanan — Detail & Timeline:**

```
Status: 🔵 DALAM PERJALANAN
No. Order: RLY-20260429-00142
No. Resi:  RLY-20260429-00142-X3

KURIR AKTIF
┌──────────────────────────────┐
│ 📸 Foto │ Andi Pratama       │
│         │ ⭐ 4.8 | Motor Matic│
│         │ B 1234 XYZ         │
│         │ [📞 Hubungi]       │
└──────────────────────────────┘

TIMELINE
✅ 14:32 Order dikonfirmasi
✅ 14:38 Kurir menuju pickup
✅ 14:45 Barang diambil [lihat foto]
🔵 14:52 Dalam perjalanan ke tujuan
⬜ — Tiba di tujuan (ETA 15:05)

DETAIL PAKET
Nama:     Sepatu Olahraga
Berat:    1.2 kg
Dimensi:  30×20×15 cm
Model:    P2P
Asuransi: Tidak

[🧾 Unduh Resi]  [⚠ Laporkan Masalah]
```

**FR-WEB-CUST-044:** In-browser chat dengan kurir:

- Chat box di bawah detail
- Send teks (WebSocket)
- Nomor HP kurir di-mask

---

## SEKSI 7: RESI MANAGEMENT

### FR-WEB-CUST-050: Halaman Resi `/app/resi`

**FR-WEB-CUST-050:** Tabel resi mirip order management:

- Search by: nomor resi, penerima
- Filter by: tanggal, bulk/single, status order
- Bulk select + download ZIP

### FR-WEB-CUST-051: Detail Resi `/app/resi/:id`

**FR-WEB-CUST-051:** Layout detail resi:

```
┌──────────────────────────────────────────────────────────┐
│ RESI PENGIRIMAN                    No: RLY-20260429-00142│
├──────────────────────────────────────────────────────────┤
│  PENGIRIM               │  PENERIMA                      │
│  Toko Maju Jaya         │  Budi Santoso                  │
│  Jl. Kelapa Gading...   │  Jl. Merdeka No. 10...        │
│  📞 08xx-xxxx-xx89      │  📞 08xx-xxxx-xx23            │
├──────────────────────────────────────────────────────────┤
│  DETAIL PAKET                                            │
│  Nama: Sepatu Olahraga │ Kategori: Fashion               │
│  Berat: 1.2 kg         │ Dimensi: 30×20×15 cm           │
│  Model: P2P            │ Asuransi: Tidak                 │
│  Dibayar: Rp21.600     │ Tgl: 29 Apr 2026 14:32         │
├──────────────────────────────────────────────────────────┤
│  STATUS: ✅ TERKIRIM (29 Apr 2026 15:08)                │
├─────────────────────┬────────────────────────────────────┤
│                     │                                    │
│  [QR CODE BESAR]    │  Scan dengan aplikasi resmi       │
│                     │  untuk verifikasi paket           │
│  RLY://v1/U2Fsdk... │                                   │
│                     │  Berlaku hingga: 29 Mei 2026      │
│                     │                                    │
└─────────────────────┴────────────────────────────────────┘
│  [📄 Unduh PDF]  [🖼 Unduh PNG]  [📤 Bagikan]  [🔄 Cetak]│
└──────────────────────────────────────────────────────────┘
```

**FR-WEB-CUST-052:** Tombol aksi resi:

- **Unduh PDF** → download file PDF resi
- **Unduh PNG** → download image PNG
- **Bagikan** → generate shareable link (public, limited info) atau share ke WA
- **Cetak** → print-friendly view (window.print())
- **Scan QR via Webcam** → buka webcam untuk test scan resi sendiri

**FR-WEB-CUST-053:** QR code di web:

- Tampilkan QR besar (256×256px minimum)
- Rotate/zoom support
- Copy raw QR string ke clipboard

---

## SEKSI 8: ADDRESS BOOK WEB

### FR-WEB-CUST-060: Halaman Alamat `/app/alamat`

**FR-WEB-CUST-060:** Grid card alamat:

```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ 🏠 Gudang    │  │ 🏢 Kantor    │  │ + Tambah     │
│ Jl. Kelapa  │  │ Jl. Sudirman │  │ Alamat Baru  │
│ Gading...   │  │ No. 45...    │  │              │
│ ⭐ Default  │  │              │  │              │
│ [Edit] [Del]│  │ [Edit] [Del] │  │              │
└──────────────┘  └──────────────┘  └──────────────┘
```

**FR-WEB-CUST-061:** Tambah/edit alamat — modal:

- Input teks dengan Google Places autocomplete
- Peta interaktif: drag pin untuk adjust
- Field: label, nama penerima (jika alamat tujuan), HP penerima
- Toggle: set sebagai default pickup

**FR-WEB-CUST-062:** Import dari Excel:

- Download template (kolom: label, alamat, nama, HP)
- Upload → validasi → preview → import
- Max 100 alamat per import

---

## SEKSI 9: DASHBOARD UMKM & LAPORAN

### FR-WEB-CUST-070: Halaman Laporan `/app/laporan`

**FR-WEB-CUST-070:** Dashboard analytics UMKM (tampil jika >10 order/bulan):

```
┌──────────────────────────────────────────────────────────┐
│  LAPORAN PENGIRIMAN                    [Apr 2026 ▾] [📥] │
├──────────┬──────────┬──────────┬──────────────────────────┤
│ Total    │ Selesai  │ Gagal/   │ Total                   │
│ Order    │          │ Dispute  │ Pengeluaran              │
│ 234      │ 229 (98%)│ 5 (2%)   │ Rp4.872.000             │
├──────────┴──────────┴──────────┴──────────────────────────┤
│                                                           │
│  TREN ORDER (line chart)                                 │
│  ─── Order/hari    ─── Pengeluaran/hari                  │
│  Jan────Feb────Mar────Apr                                 │
│                                                           │
├───────────────────────┬───────────────────────────────────┤
│  TOP TUJUAN           │  DISTRIBUSI MODEL                 │
│  1. Jak Barat (45%)  │  ▓▓▓▓▓▓▓░░░ P2P: 68%            │
│  2. Jak Timur (30%)  │  ▓▓▓░░░░░░░ 2-Kaki: 32%         │
│  3. Jak Selatan (25%)│                                   │
├───────────────────────┴───────────────────────────────────┤
│  RATA-RATA BERAT PAKET: 1.8 kg                           │
│  ONGKOS RATA-RATA PER ORDER: Rp20.822                    │
│  ON-TIME DELIVERY RATE: 94.2%                            │
└──────────────────────────────────────────────────────────┘
```

**FR-WEB-CUST-071:** Export laporan:

- **Export Excel**: semua order periode terpilih (kolom: no resi, tgl, penerima, alamat, berat, model, harga, status)
- **Export PDF**: laporan ringkasan bergambar (untuk keperluan pembukuan)
- Filter: per bulan, per kuartal, atau custom range

**FR-WEB-CUST-072:** Periode pilihan:

- Bulan ini, bulan lalu
- Kuartal ini
- Custom range (date picker)
- Year to date

---

## SEKSI 10: PROFIL & PENGATURAN

### FR-WEB-CUST-080: Halaman Profil `/app/profil`

**FR-WEB-CUST-080:** Halaman profil dengan tab:

**Tab: Akun**

- Foto profil (upload + crop)
- Nama lengkap (editable)
- Nomor HP (tampilkan, tidak bisa edit langsung — perlu verifikasi OTP)
- Email (editable)
- Loyalty tier badge + progress ke tier berikutnya

**Tab: Keamanan**

- Ganti PIN (input PIN lama → PIN baru → konfirmasi)
- Reset PIN via OTP
- Riwayat login: device, waktu, IP (last 10)
- Tombol "Logout semua device"

**Tab: Notifikasi**

- Toggle per channel: Push browser, WhatsApp, Email
- Level detail notifikasi WA: Minimal / Standar / Detail

**Tab: Referral**

- Kode referral unik
- Tombol copy + share link
- Statistik: berapa yang daftar, berapa yang sudah order
- Reward history

---

## SEKSI 11: VOUCHER & PROMO

### FR-WEB-CUST-090: Halaman Voucher `/app/voucher`

**FR-WEB-CUST-090:**

- List voucher aktif milik user (cards dengan tanggal expired)
- Form input kode promo manual + tombol "Pakai"
- Voucher teraplikasi otomatis saat checkout jika ada yang berlaku
- Riwayat voucher yang sudah dipakai

---

## SEKSI 12: NOTIFIKASI

### FR-WEB-CUST-100: Halaman Notifikasi `/app/notifikasi`

**FR-WEB-CUST-100:**

- List semua notifikasi (paginasi infinite scroll)
- Filter: order update / promo / sistem
- Mark all as read
- Click notifikasi → deep link ke halaman terkait

**FR-WEB-CUST-101:** Browser push notification:

- Request permission saat pertama login
- Notifikasi browser native ketika tab tidak aktif
- Service Worker untuk offline notification queue

---

## SEKSI 13: KEAMANAN WEB PORTAL

**FR-WEB-SEC-001:** Session management:

- JWT di httpOnly cookie (bukan localStorage)
- CSRF token untuk semua state-changing requests
- Auto-logout setelah 8 jam inaktif
- "Remember me" → session 30 hari

**FR-WEB-SEC-002:** Barcode di web:

- QR code tampil hanya setelah auth
- QR tidak bisa di-screenshot protect (CSS user-select: none, tapi ini tidak 100% — utamakan server-side protection)
- API `/resi/scan` tetap require JWT → meskipun QR content bocor, tetap butuh login untuk resolve

**FR-WEB-SEC-003:** Rate limiting spesifik web:

- Pricing estimate (kalkulator landing): max 20 req/menit per IP (no auth)
- POST /orders: max 5 req/menit per user
- POST /orders/bulk/upload: max 3 per hari per user
- Bulk download ZIP: max 10 per jam per user

**FR-WEB-SEC-004:** Content Security Policy:

- Strict CSP: whitelist Google Maps, WATI, payment gateway domains
- No inline scripts
- Subresource integrity untuk CDN assets

---

## AKSESIBILITAS & UX

**FR-WEB-UX-001:** Dark mode support (CSS variables, toggle di profil)

**FR-WEB-UX-002:** Keyboard navigation penuh:

- Semua aksi bisa dilakukan tanpa mouse
- Focus visible untuk semua elemen interaktif
- Shortcut: N = new order, M = massal, O = orders, R = resi

**FR-WEB-UX-003:** Loading states:

- Skeleton loader untuk semua data fetch
- Optimistic updates untuk aksi yang sering (mark read, dll)
- Toast notification untuk semua aksi sukses/gagal

**FR-WEB-UX-004:** Error pages:

- 404: halaman tidak ditemukan + navigasi balik
- 500: error server + tombol retry
- Offline: banner "Tidak ada koneksi internet"
- Session expired: modal login ulang tanpa kehilangan progress

**FR-WEB-UX-005:** Responsive breakpoints:

- Mobile (≤768px): layout single column, bottom nav
- Tablet (768–1024px): sidebar collapsed, 2 kolom
- Desktop (≥1024px): sidebar full, multi-column
- Wide (≥1440px): max-width 1440px, centered

---

## API ENDPOINTS TAMBAHAN (WEB-SPECIFIC)

```
# Landing Page
POST /landing/leads              → simpan lead dari form UMKM/kurir
POST /landing/cek-resi           → public resi check (rate-limited)

# Web Auth (session-based untuk web portal)
POST /auth/web/login             → login + set httpOnly cookie
POST /auth/web/logout            → clear cookie
GET  /auth/web/session           → validasi session aktif

# Notification (browser push)
POST /notifications/web/subscribe    → simpan push subscription
DELETE /notifications/web/subscribe  → unsubscribe

# Bulk download
POST /orders/bulk-download           → generate ZIP dari array order_ids
GET  /orders/bulk-download/:job_id   → download ZIP yang sudah siap

# Dashboard UMKM
GET  /customers/me/dashboard         → stats summary
GET  /customers/me/reports/monthly   → export Excel laporan bulanan
GET  /customers/me/analytics         → data untuk grafik (per hari/minggu)
```
