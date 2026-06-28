# Courier/Driver App — Spesifikasi Flow & Fitur Detail

---

## A. Keputusan UX Kritis: Terima Order — Swipe atau Tap?

Ini pertanyaan yang sangat spesifik dan jawabannya **bukan selera, tapi
ada alasan ergonomis & psikologis di balik pilihan industri.**

### Jawaban: **Swipe**, bukan tap — untuk aksi MENERIMA order yang punya timer.

**Alasan teknis & UX:**

1. **Mencegah accidental tap.** Kurir biasanya pegang HP sambil naik motor,
   tangan bisa goyang. Tap sekali gampang ke-trigger gak sengaja
   (di saku, kena gesekan). Swipe butuh gesture yang lebih sengaja/intentional
   — mengurangi false accept.
2. **Memberi sense of "commitment".** Swipe (drag dari kiri ke kanan, biasa
   disebut "swipe to accept") secara psikologis berasa seperti aksi yang
   lebih final dan disengaja dibanding tap singkat. Ini pattern yang dipakai
   Uber Driver, Grab Driver, Gojek Driver — bukan kebetulan, ini hasil
   testing UX mereka selama bertahun-tahun.
3. **Visual progress indicator.** Swipe bisa dikombinasikan dengan progress
   bar yang menunjukkan sisa waktu auto-reject (misal lingkaran timer
   yang mengecil sambil track swipe terisi warna) — memberi 2 informasi
   sekaligus (sisa waktu + aksi) dalam 1 komponen visual.
4. **Reject jadi tap biasa (atau swipe ke arah berlawanan)**, karena reject
   tidak butuh "pengamanan" sebanyak accept — gak masalah kalau ke-trigger
   gak sengaja (worst case: order balik ke pool, gak ada efek samping besar).

### Spesifikasi Komponen "Incoming Order"

```
┌─────────────────────────────────┐
│  🔔 Order Baru!      ⏱ 00:12     │  ← countdown timer visual (lingkaran/bar)
│                                   │
│  📍 Jemput: Jl. Sudirman No.45   │
│  📍 Antar: Jl. Thamrin No.12      │
│  📏 3.2 km · 🕐 ~10 menit         │
│  💰 Rp 18.500                     │
│                                   │
│  [ ←  SWIPE UNTUK TERIMA  → ]    │  ← swipe gesture, full-width track
│                                   │
│         [ Tolak ]                 │  ← tap biasa, secondary/text button
└─────────────────────────────────┘
```

**Detail teknis swipe:**
- Drag threshold: swipe harus mencapai ±80% lebar track untuk dianggap valid
  (mencegah swipe pendek tidak sengaja)
- Snap-back animation kalau swipe tidak mencapai threshold (kasih feedback
  "belum cukup")
- Haptic feedback (vibration) singkat saat berhasil accept — konfirmasi
  fisik selain visual, penting karena kurir sering tidak fokus penuh ke
  screen saat order masuk
- Timer auto-reject: 10-15 detik adalah standar industri (Grab ~10s, Gojek ~15s).
  Order yang tidak di-respond dianggap reject otomatis & lempar ke kurir lain

**Kapan tap biasa boleh dipakai (bukan swipe):**
- Aksi yang tidak time-critical & tidak perlu "pengamanan" — misal toggle
  online/offline, buka detail order yang sudah diterima, navigasi ke maps
- Konfirmasi pickup/delivery **boleh tap** (bukan swipe) karena di titik ini
  kurir biasanya sudah berhenti/parkir, beda kondisi fisik dibanding saat
  terima order sambil jalan

---

## B. Status & Flow Kurir — Detail per Screen

### B.1 Home Screen (Status Online/Offline)

| Fitur | Prioritas | Feature Flag? | Detail UX |
|---|---|---|---|
| Toggle online/offline besar & jelas | MUST | Tidak perlu | Toggle utama di tengah/bawah screen, warna hijau=online jelas kontras |
| Indikator heatmap demand area | SHOULD | `feature_demand_heatmap` | Overlay warna di map menunjukkan area dengan order tinggi — bantu kurir posisikan diri |
| Earnings hari ini (running total) | MUST | Tidak perlu | Selalu visible di header/card atas, update real-time setiap order selesai |
| Status sinyal GPS/koneksi | MUST | Tidak perlu | Indicator kecil kalau GPS lemah/hilang — kurir harus tahu kalau posisinya gak ke-track |

### B.2 Incoming Order (lihat detail section A di atas)

| Fitur | Prioritas | Feature Flag? |
|---|---|---|
| Full-screen overlay/modal saat order masuk | MUST | Tidak perlu |
| Sound + vibration alert | MUST | Tidak perlu |
| Auto-reject timer 10-15s | MUST | `order_offer_timeout_seconds` (config value, bukan boolean) |
| Info jarak ke pickup SEBELUM accept | MUST | Tidak perlu — krusial, kurir harus tahu jarak sebelum komit |
| Estimasi earning per order sebelum accept | MUST | Tidak perlu |
| Multi-order batching offer (2 order sekaligus) | NICE | `feature_order_batching` |

### B.3 Navigasi ke Pickup

| Fitur | Prioritas | Feature Flag? | Detail UX |
|---|---|---|---|
| Turn-by-turn navigation native (bukan cuma static map) | MUST | Tidak perlu | Pakai TomTom Navigation SDK, bukan cuma render polyline statis — kurir butuh voice guidance saat riding |
| Tombol "Navigasi" buka app maps eksternal (fallback) | SHOULD | Tidak perlu | Kalau in-app nav belum stabil, minimal ada tombol buka Google Maps/Waze dengan koordinat ter-pass otomatis |
| Tombol call/chat ke pengirim | MUST | Tidak perlu | Nomor masking, sama seperti customer app |
| Tombol "Tiba di Lokasi" | MUST | Tidak perlu | **Tap biasa** (bukan swipe) — sudah dijelaskan di section A |
| Info instruksi tambahan dari pengirim | MUST | Tidak perlu | Tampil jelas di card, bukan harus expand dulu |

### B.4 Proses Pickup

| Fitur | Prioritas | Feature Flag? | Detail UX |
|---|---|---|---|
| Foto bukti pickup | MUST | Tidak perlu | Kamera in-app langsung (jangan buka galeri), 1 tap |
| OTP/kode verifikasi dari pengirim | SHOULD | `feature_pickup_otp` | Untuk barang high-value, sebagai layer keamanan tambahan |
| Checklist kondisi barang (opsional) | NICE | `feature_condition_checklist` | Relevan untuk klaim insurance nanti |
| Tombol "Mulai Pengantaran" | MUST | Tidak perlu | Tap biasa, trigger transisi status ke `IN_TRANSIT` |

### B.5 Navigasi ke Drop & Proses Delivery

| Fitur | Prioritas | Feature Flag? | Detail UX |
|---|---|---|---|
| Turn-by-turn nav ke titik antar | MUST | Tidak perlu | Sama seperti B.3 |
| Foto bukti delivery | MUST | Tidak perlu | Wajib sebelum bisa tap "Selesai" — validasi di FE & BE |
| Signature digital (opsional) | NICE | `feature_signature_pod` | Untuk barang B2B/dokumen penting |
| OTP dari penerima | SHOULD | `feature_delivery_otp` | Mencegah delivery fiktif (fraud kurir) |
| Handling "penerima tidak ada" | MUST | Tidak perlu | Flow alternatif: tunggu (timer), hubungi CS, atau return — bukan dead-end |
| Tombol "Selesai" | MUST | Tidak perlu | Disabled sampai foto/OTP terisi — validasi sebelum submit |

### B.6 Earnings & Riwayat

| Fitur | Prioritas | Feature Flag? | Detail UX |
|---|---|---|---|
| Breakdown earning per order (base+distance, 80% formula lo) | MUST | Tidak perlu | Transparan, bukan cuma total |
| Riwayat order (list + detail) | MUST | Tidak perlu | Filter by tanggal/status |
| Withdrawal/penarikan saldo | MUST | Tidak perlu | Minimal nominal jelas, estimasi waktu proses jelas |
| Insentif/bonus tracker (progress bar target harian) | SHOULD | `feature_incentive_program` | Gamification ringan, terbukti naikkan retention kurir di Gojek/Grab |

---

## C. Device & Permission Flow (Android khususnya)

| Item | Prioritas | Detail |
|---|---|---|
| Background location permission flow | MUST | Android 10+ butuh 2-step: dulu "While using app", baru kemudian prompt "Allow all the time" — **jangan langsung minta "Allow all the time" di awal**, akan auto-reject oleh sistem Android & user bingung |
| Battery optimization exemption prompt | MUST | Tampilkan halaman edukasi kenapa app butuh exempt dari battery optimization, sebelum buka system settings |
| Root/jailbreak detection | MUST | Sudah lo explore di Kotlin — pastikan ada fallback UX yang jelas (bukan crash) kalau device terdeteksi root: blokir login + pesan jelas |
| Mock location detection | MUST | Kurir curang pakai fake GPS adalah risiko nyata di model on-demand — deteksi & flag akun |
| Offline order handling | SHOULD | Order yang sudah accepted harus tetap bisa diproses (update status lokal) walau sinyal hilang sementara, lalu sync saat online lagi |

---

## D. State Machine Kurir (selaras dengan Customer App)

```
OFFLINE
  ↓ (toggle online)
ONLINE_IDLE
  ↓ (order offer masuk)
ORDER_OFFERED ──(timeout/reject)──→ kembali ke ONLINE_IDLE
  ↓ (swipe accept)
ACCEPTED
  ↓
HEADING_TO_PICKUP
  ↓ (tap "tiba")
ARRIVED_PICKUP
  ↓ (foto/OTP + tap "mulai antar")
PICKED_UP / IN_TRANSIT
  ↓ (tap "tiba")
ARRIVED_DROPOFF
  ↓ (foto/OTP + tap "selesai")
DELIVERED ──→ kembali ke ONLINE_IDLE (siap terima order baru)

[Edge cases]
ARRIVED_DROPOFF → RECIPIENT_NOT_FOUND → [tunggu/return/hubungi CS]
ACCEPTED → CANCELLED_BY_DRIVER (dengan reason wajib + dampak ke rating kurir)
```
