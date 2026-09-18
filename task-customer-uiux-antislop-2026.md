# Task: Customer App UI/UX Antislop Audit 2026

## Ringkasan

Audit antislop (Mode 2/AFTER) aplikasi customer Android terhadap standar UI/UX 2026
dengan benchmark pola global (Gojek, Grab, Uber, DoorDash). Struktur beranda sudah
selevel pola global (search-first, wallet card, service grid, promo carousel,
kartu order aktif), arah desain ada (`DESIGN.md` + `design-tokens/tembus.tokens.json`),
kontras sampling PASS, state offline/lambat/error dasar ada. Belum lolos gate:
1 pelanggaran Hard Gate + 2 bug integritas yang terlihat user.

Sumber audit: sesi UAT emulator 2026-09-17/18 (Pixel_6_Pro_customer),
skill `antislop` + `antislop-ui` + `antislop-human` + `antislop-layoutmobile`.

## Status Update - 2026-09-18

Legend:

- `[x]` selesai dan sudah ada bukti build/test atau implementasi langsung.
- `[/]` sebagian sudah dikerjakan, tetapi belum boleh dianggap production-complete.
- `[ ]` belum dikerjakan.

## TASK-ID

### UIUX-2026-001 — Hilangkan em dash di copy user-facing (R-02) [HIGH]

11 baris di 8 file (cek presisi: `python scripts/tmp-emdash.py` atau grep `\u2014`
di `android-app-customer/.../src/main`):

- `ui/screens/detail/OrderDetailScreen.kt:404,413` — "Pembatalan gratis — ..."
- `ui/screens/food/FoodCheckoutScreen.kt:330,553,781`
- `ui/screens/history/OrderHistoryScreen.kt:456` — plus emoji mentah `⚠️`
  di awal string (bersihkan sekalian, pakai ikon + teks jujur)
- `ui/screens/profile/WithdrawDialog.kt:436`
- `ui/screens/rating/MerchantRatingDialog.kt:208`
- `ui/screens/service/ServiceBookingViewModel.kt:401` — masuk ke
  `item_description` order (data produksi, bukan sekadar label)
- `ui/screens/tracking/TrackingScreen.kt:319`
- `data/localization/LocaleContract.kt:75` — placeholder kosong `"—"`,
  ganti placeholder non-em-dash yang jelas.

Acceptance:

- [ ] Nol karakter U+2014 di string user-facing customer app (test: grep di CI atau unit test kontrak).
- [ ] Tidak ada emoji mentah di string UI (⚠️ dll diganti ikon + teks).
- [ ] `testDebugUnitTest` customer tetap hijau.

### UIUX-2026-002 — Sinkronkan highlight bottom-nav dengan destinasi (C-4/R-26) [HIGH]

Repro: force-stop customer app → launch → tab **Riwayat** highlighted hijau
padahal konten = Beranda. Kemungkinan state tab tersimpan tidak sinkron dengan
`RootNavGraph` start destination (`MainViewModel.resolveAuthenticatedDestination`).

Acceptance:

- [ ] Cold start selalu highlight tab sesuai layar yang tampil (Beranda ↔ Beranda).
- [ ] Pindah tab manual + rotasi/proses mati tidak merusak sinkronisasi.
- [ ] Bukti emulator: screenshot Beranda + Riwayat + Profil seusai fix.

### UIUX-2026-003 — Perbaiki render nama kurir `Andri+Pratama` (R-38) [HIGH]

Plus mentah tampil di kartu teknisi Tambal Ban dan layar booking
(`Andri+Pratama`, kemungkinan URL-encoding bocor dari backend/display layer).
Telusuri sumber (`+` vs spasi) di API vs aplikasi, perbaiki di titik yang benar
satu tempat (jangan patch dua sisi).

Acceptance:

- [ ] Nama "Andri Pratama" tampil berspasi di semua layar (home tambal, detail teknisi, booking).
- [ ] Tidak ada transformasi nama baru yang merusak nama sah bertanda `+`.
- [ ] Bukti emulator: screenshot kedua layar.

### UIUX-2026-004 — Konsistensi locale satu sesi (R-20) [MEDIUM]

Satu sesi campur `Tire Repair` / `What would you like today?` /
`Notifications` / `Profile` dengan `Tambal Ban` / `Mau apa hari ini?`.
Standar global: satu locale penuh per sesi, ikut bahasa device/akun.

Acceptance:

- [ ] Kunci string yang belum diterjemahkan dilengkapi ID + EN.
- [ ] Cold start EN dan ID masing-masing murni satu bahasa di Beranda + Tambal Ban + Food.
- [ ] Bukti emulator: dua screenshot (EN penuh, ID penuh).

### UIUX-2026-005 — Rapikan error katalog material di booking (R-27) [MEDIUM]

Teks merah `Gagal memuat katalog material` tampil permanen di layar booking
padahal flow tetap jalan. Putuskan: endpoint diperbaiki, atau error non-blokir
tidak ditampilkan sebagai error (retry sunyi + sembunyikan section material
bila kosong).

Acceptance:

- [ ] Tidak ada teks error merah saat flow bisa lanjut; bila gagal beneran,
      ada aksi retry yang jelas.
- [ ] Bukti emulator: booking tanpa error merah + (bila endpoint diperbaiki)
      section material tampil.

### UIUX-2026-006 — Tracking berkonteks: kartu status + ETA + aksi (C-3/C-4) [MEDIUM]

Layar tracking saat ini peta full-screen tanpa kartu status/ETA/aksi kurir
(Grab/Uber selalu tampil kartu + ETA + hubungi). Minimal: bottom-sheet kartu
status order (status, ETA/menit, tombol chat/telepon/SOS) di atas peta,
terikat data `tracking-detail` yang sudah terbukti 200.

Acceptance:

- [ ] Tracking order aktif selalu tampil kartu status + ETA + minimal 1 aksi
      (chat/telepon/SOS) tanpa perlu gesture tersembunyi.
- [ ] Marker kurir/pickup tampil bila lokasi tersedia; bila tidak, tertulis
      jujur (bukan peta kosong).
- [ ] Bukti emulator: screenshot tracking order aktif (pakai order UAT
      `TMB-805738-000408` atau order baru).

### UIUX-2026-007 — Scrim status-bar di atas peta terang (R-25) [LOW]

Jam/status bar putih di atas map terang nyaris tak terbaca. Tambah scrim/
overlay sadar status-bar di layar peta (tracking + booking map bila ada).

Acceptance:

- [ ] Jam + ikon status terbaca di atas tile terang maupun gelap.
- [ ] Bukti emulator: screenshot peta terang.

## Yang eksplisit BUKAN temuan (jangan "diperbaiki")

- Grid layanan seragam (konvensi platform ala Gojek/Grab, bukan R-14).
- Badge SOS di Tambal Ban/Towing (darurat = purpose tertulis).
- Saldo/coins real, foto merchant real, bottom-nav 4 destinasi berlabel.

## Verification record (isi saat eksekusi)

- [ ] `android-app-customer`: `.\gradlew.bat :app:testDebugUnitTest`.
- [ ] `android-app-customer`: `.\gradlew.bat :app:assembleDebug`.
- [ ] Emulator Pixel_6_Pro_customer: screenshot tiap TASK-ID seusai fix.
- [ ] `rg '\u2014' android-app-customer/app/src/main` → nol hasil user-facing.
- [ ] Evidence per TASK-ID: `docs/task-evidence/UIUX-2026-00X.md`.

## Non-Goal

- Tidak mengubah flow order/pricing/matching.
- Tidak mengubah backend kecuali display-layer encoding nama (UIUX-2026-003)
  bila akar masalahnya di API.
- Tidak menambah bahasa baru di luar ID/EN.
