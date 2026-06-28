# Customer App — Spesifikasi Flow & Fitur Detail

> Acuan: pattern Gojek (GoSend), Grab Express, Lalamove, Uber pattern umum.
> Setiap fitur ditandai **[MUST]** (wajib ada, standar industri minimum),
> **[SHOULD]** (best practice, kompetitif), **[NICE]** (diferensiasi/maturity lanjut).
> Setiap fitur juga ditandai status **Feature Flag**: apakah ini harus
> bisa di-toggle on/off tanpa deploy ulang (relevan buat A/B test, kill-switch,
> staged rollout).

---

## A. Keputusan Arsitektur Flow: 1 Halaman vs Multi-Halaman?

**Best practice industri (Gojek/Grab): Order flow dipecah jadi beberapa
step/screen, BUKAN satu halaman panjang.** Alasannya:

| Alasan | Penjelasan |
|---|---|
| Cognitive load | User mobile fokus 1 keputusan per screen (pickup → drop → detail paket → konfirmasi). Satu halaman panjang dengan banyak input bikin drop-off rate naik. |
| Validasi bertahap | Tiap step bisa divalidasi sendiri (misal alamat tidak valid) sebelum user lanjut — mencegah frustasi di step terakhir. |
| Progressive disclosure | Info kompleks (insurance, jenis kendaraan, catatan kurir) muncul cuma saat relevan, bukan bikin overwhelm di awal. |
| Analytics funnel | Multi-step memudahkan tracking drop-off per tahap (mana yang bikin user cancel). |

**Exception**: untuk re-order / quick order dari history, BOLEH 1-tap tanpa
multi-step (shortcut path), karena data sudah pernah diisi sebelumnya.

### Struktur Step yang Direkomendasikan (5 step utama)

```
Step 1: Set Lokasi          → pickup pin + drop pin (map interaktif)
Step 2: Detail Paket        → jenis barang, berat/dimensi estimasi, foto (opsional)
Step 3: Pilih Layanan       → instant/same-day/scheduled, jenis kendaraan, insurance toggle
Step 4: Review & Bayar      → breakdown harga, metode bayar, promo code
Step 5: Konfirmasi & Cari Kurir → searching animation → driver found
```

Tiap step = 1 screen route (bukan 1 screen dengan show/hide section), supaya:
- Back button native berfungsi natural
- State per step bisa di-cache (kalau app di-kill, user gak harus ulang dari nol)
- Mudah di-A/B test per step secara independen

---

## B. Fitur Detail per Screen

### B.1 Screen: Set Lokasi (Pickup & Drop)

| Fitur | Prioritas | Feature Flag? | Detail UX |
|---|---|---|---|
| Pin-drop di map + drag-to-adjust | MUST | Tidak perlu | Pin harus bisa di-drag manual untuk akurasi (GPS sering off beberapa meter) |
| Address autocomplete (search bar) | MUST | Tidak perlu | Pakai TomTom Search API, debounce 300ms, tampilkan max 5 hasil |
| "Lokasi saat ini" quick button | MUST | Tidak perlu | Ikon target di map, sekali tap center ke GPS user |
| Saved addresses (Rumah/Kantor/dst) | SHOULD | `feature_saved_addresses` | List address tersimpan muncul di atas search result |
| Recent locations | SHOULD | Tidak perlu | 3-5 lokasi terakhir, auto dari history order |
| Detail alamat tambahan (patokan, no. rumah) | MUST | Tidak perlu | Text field terpisah dari pin — pin = koordinat, teks = instruksi kurir |
| Kontak pengirim/penerima per titik | MUST | Tidak perlu | Nama + no HP wajib per titik (beda dari akun pemesan, krusial buat B2B use case) |
| Multi-drop (banyak titik antar) | NICE | `feature_multidrop` | Kalau model bisnis lo butuh ini untuk UMKM batch delivery |
| Validasi radius layanan | MUST | `feature_service_area_check` | Kalau pickup/drop di luar coverage area, tampilkan pesan jelas sebelum lanjut ke step berikutnya |

**Catatan UX kritis**: Jangan biarkan user lanjut ke step 2 kalau salah satu
pin belum di-set. Tombol "Lanjut" harus disabled + helper text, bukan
silent fail.

### B.2 Screen: Detail Paket

| Fitur | Prioritas | Feature Flag? | Detail UX |
|---|---|---|---|
| Kategori barang (dokumen/makanan/elektronik/fragile/dll) | MUST | Tidak perlu | Pakai chip selector, bukan dropdown — lebih cepat di-tap di mobile |
| Estimasi berat/ukuran | MUST | Tidak perlu | Slider atau preset (S/M/L) lebih cepat daripada input angka manual |
| Foto paket | SHOULD | `feature_package_photo` | Opsional tapi sangat membantu dispute resolution nanti |
| Catatan khusus (fragile, jangan dibalik, dll) | SHOULD | Tidak perlu | Text field + quick-tag chips ("Fragile", "Jangan dibalik") |
| Estimasi nilai barang (untuk insurance) | SHOULD | `feature_insurance` | Muncul hanya kalau user toggle insurance di step berikutnya — progressive disclosure |

### B.3 Screen: Pilih Layanan

| Fitur | Prioritas | Feature Flag? | Detail UX |
|---|---|---|---|
| Pilihan jenis kendaraan (motor/mobil/dll) | MUST | `feature_vehicle_type_car` (kalau motor dulu yang live) | Card horizontal scroll dengan estimasi harga & ETA per opsi — user bandingin langsung |
| Instant vs Scheduled delivery | SHOULD | `feature_scheduled_delivery` | Toggle/tab di atas, bukan halaman terpisah |
| Insurance toggle | SHOULD | `feature_insurance` (relevan integrasi PasarPolis lo) | Toggle dengan info premi otomatis terhitung, bukan halaman baru |
| Same-day vs Express vs Economy tier | NICE | `feature_multi_tier_pricing` | Kalau mau diferensiasi harga seperti J&T/SiCepat tapi versi instant |

### B.4 Screen: Review & Bayar

| Fitur | Prioritas | Feature Flag? | Detail UX |
|---|---|---|---|
| Breakdown harga (base+distance+infra+margin) | MUST | Tidak perlu | **Wajib transparan** — ini langsung pengaruh ke trust, sesuai formula `(Base+Distance+Infra)×1.2` lo |
| Promo code input | SHOULD | `feature_promo` | Collapsed by default ("Punya kode promo?"), expand saat di-tap |
| Payment method selector | MUST | Tidak perlu | Icon + nama metode, default ke metode terakhir dipakai |
| Saldo/balance check otomatis | SHOULD | Tidak perlu | Kalau e-wallet saldo kurang, beri warning sebelum submit, bukan setelah gagal |
| Estimasi total waktu (ETA) | MUST | Tidak perlu | Tampilkan range, bukan angka pasti ("15-20 menit" bukan "17 menit") |
| Terms acceptance (untuk insurance/COD) | MUST jika ada insurance | Tidak perlu | Checkbox kecil, link ke T&C, bukan blocking modal |

### B.5 Screen: Cari Kurir & Tracking

| Fitur | Prioritas | Feature Flag? | Detail UX |
|---|---|---|---|
| Searching animation dengan radius pulse di map | MUST | Tidak perlu | Beri feedback visual bahwa sistem aktif mencari, bukan diam |
| Timeout & retry kalau tidak ada kurir | MUST | `feature_search_timeout_config` | Setelah ±60-90 detik tanpa match, beri opsi: tunggu lebih lama / naikkan tarif / cancel |
| Driver found card (foto, nama, rating, plat, ETA jemput) | MUST | Tidak perlu | Slide-up bottom sheet, bukan halaman baru — biar map tetap visible |
| Live tracking kurir di map | MUST | Tidak perlu | Update posisi tiap 3-5 detik via WebSocket, bukan REST polling >10s |
| Status order granular dengan progress indicator | MUST | Tidak perlu | `Menuju lokasi jemput → Tiba di lokasi jemput → Sedang diantar → Tiba di tujuan → Selesai` |
| Chat/call ke kurir dengan masking nomor | MUST | Tidak perlu | Tombol chat & call selalu visible di bottom sheet selama order aktif |
| Cancel order dengan reason picker | MUST | Tidak perlu | Modal dengan list alasan (radio button), bukan free text — lebih cepat & data lebih clean buat analytics |
| Notifikasi push tiap transisi status | MUST | Tidak perlu | Termasuk saat kurir 5 menit dari lokasi (heads-up notification) |
| SOS/emergency button | SHOULD | `feature_sos_button` | Floating button kecil pojok, hanya aktif saat order in_transit |
| Proof of delivery viewer (foto/signature) | MUST | Tidak perlu | Muncul otomatis di notifikasi "selesai" + tersimpan permanen di detail order |
| Rating & review setelah selesai | MUST | Tidak perlu | Muncul otomatis sebagai bottom sheet begitu status `delivered`, bisa di-skip tapi muncul lagi di history kalau belum diisi |

---

## C. Status Order — State Machine Lengkap

```
DRAFT (belum submit)
  ↓
SEARCHING_DRIVER ──(timeout)──→ NO_DRIVER_FOUND ──→ [retry/cancel]
  ↓ (matched)
DRIVER_ASSIGNED ──(kurir reject/timeout)──→ kembali ke SEARCHING_DRIVER
  ↓
DRIVER_HEADING_TO_PICKUP
  ↓
DRIVER_ARRIVED_PICKUP
  ↓
PACKAGE_PICKED_UP (proof of pickup tersimpan)
  ↓
IN_TRANSIT
  ↓
DRIVER_ARRIVED_DROPOFF
  ↓
DELIVERED (proof of delivery tersimpan) ──→ RATING_PENDING ──→ COMPLETED
  
  [Cancellation bisa terjadi di hampir semua state sebelum PACKAGE_PICKED_UP]
  CANCELLED_BY_CUSTOMER / CANCELLED_BY_SYSTEM / CANCELLED_BY_DRIVER

  [Edge case wajib di-handle]
  FAILED_DELIVERY (penerima tidak ada/tolak terima) ──→ [retry/return to sender/refund]
```

**Cek di codebase**: apakah semua state ini benar-benar ada sebagai enum
di backend (Go), bukan cuma "pending/completed/cancelled" yang terlalu
generic. State granular ini krusial untuk UX real-time tracking yang baik.

---

## D. Feature Flag — Daftar Rekomendasi Lengkap

Kategori feature flag yang sebaiknya ada di sistem (pakai tool seperti
Unleash/LaunchDarkly/atau custom table di Postgres + Redis cache):

| Flag Name | Tujuan | Tipe |
|---|---|---|
| `feature_scheduled_delivery` | Kill-switch fitur jadwal kirim nanti | Boolean |
| `feature_multidrop` | Multi-titik antar dalam 1 order | Boolean |
| `feature_insurance` | Toggle integrasi asuransi (PasarPolis) | Boolean |
| `feature_promo` | Matikan promo saat campaign selesai tanpa deploy | Boolean |
| `feature_sos_button` | Rollout bertahap fitur safety | Boolean |
| `feature_vehicle_type_car` | Buka opsi mobil setelah motor stabil | Boolean per-city |
| `pricing_surge_multiplier_enabled` | Kill-switch dynamic pricing kalau ada masalah | Boolean |
| `feature_package_photo` | A/B test pengaruh foto paket ke trust/conversion | Percentage rollout |
| `min_app_version_force_update` | Force update kalau ada bug kritis | Config value |
| `service_area_polygon` | Update area coverage tanpa deploy app | Config (per city, geojson) |

**Cek di codebase**: apakah ada layer feature flag terpusat, atau semua
masih hardcoded `if/else` di kode? Hardcoded = red flag untuk skalabilitas
multi-kota.
