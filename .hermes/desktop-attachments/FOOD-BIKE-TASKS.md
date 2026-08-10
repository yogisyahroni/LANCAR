# FOOD-BIKE — Sisa Task (Belum Selesai)

> **UPDATE 8 Agustus 2026 (SESI TUNTAS):** Semua task di bawah sudah dikerjakan
> & pushed ke `staging` (commit 7f69ff4 s/d d37db39). Detail tiap task ada di
> masing-masing section. Yang tersisa hanya opsional lanjutan (riset lebih
> lanjut), bukan blocker.

---

## ✅ FB-093 & FB-094 — Lokasi Merchant Wajib (SELESAI)

- **FB-093**: Map picker wajib di web (`merchant-web/src/components/LocationPicker.tsx`,
  Leaflet + CARTO tiles tanpa API key) + Android (`LocationPickerSection.kt`, osmdroid OSM
  tanpa API key). Lat/lng wajib di step Data Toko + review + payload.
- **FB-094**: Guard `CreateFoodOrder` tolak merchant tanpa lokasi (0,0) di order-service;
  validasi Register (wajib + rentang valid) di merchant-service; gate approve admin tolak
  tanpa pin lokasi di admin-service. 4 unit test.

## ✅ FB-095 — Jam Buka/Tutup Otomatis (SELESAI)

- `merchant-service/internal/worker/operating_hours_worker.go` — worker tiap 5 menit
  sinkron `is_open` dengan `jam_buka`/`jam_tutup` (dukung lintas tengah malam).
- Auto-buka WAJIB lolos gate KYC dokumen pangan (`FoodDocsReady`), auto-tutup bebas.
- 9 kasus unit test.

## ✅ FB-096 — Print Struk Fisik ke Printer Thermal (SELESAI)

- **Zero-dependency** (bukan library JitPack — tanpa supply-chain risk):
  `android-app-merchant/.../data/printer/EscPos.kt` — BluetoothSocket SPP + byte ESC/POS
  manual, QR native `GS(k`, tombol "Cetak Thermal (Bluetooth)" + dialog pilih printer paired,
  runtime permission `BLUETOOTH_CONNECT` API 31+.

## ✅ FB-097 s/d FB-101 — Promo Merchant (Diskon Menu) (SELESAI)

- **FB-097**: Verified — `serviceCodeSchema` regex di promoEngine.ts sudah terima
  `food_delivery` (admin tinggal isi di field free-text service_codes).
- **FB-098**: Migrasi `20260808000001_create_merchant_promos.sql` — tabel `merchant_promos`
  (id, merchant_id, menu_item_id nullable, discount_type percent/fixed/buy1get1,
  discount_value, max_discount_idr, starts_at, ends_at, is_active).
- **FB-099**: `merchant_promo_service.go` CRUD self-serve tanpa approval admin — validasi
  max_discount cap, harga tidak negatif/nol, menu milik merchant. Route
  `/api/v1/merchant/promos`. 7 unit test.
- **FB-100**: Android tab "Promo" (ke-4) — list, dialog buat (percent/fixed/buy1get1,
  window UTC default 7 hari), pause/aktif, hapus.
- **FB-101**: Settlement — kolom `merchant_promo_discount_idr`, kalkulasi diskon
  (percent cap max_discount / fixed per item / buy1get1, cap subtotal per item & total),
  `netPayout = gross - fee - disburse - promo` (BUKAN komisi PT), metadata audit. 8 unit test.

## ✅ SEMUA TASK FOOD-BIKE SELESAI — 8 Agustus 2026

- Total 8 commit: 7f69ff4 (FB-094), 309fc3b (FB-093 web), 72a39d4 (FB-093 android),
  9bd8340 (FB-095), 09bba63 (FB-096), 1381b15 (FB-098+099), 21fcedc (FB-100), d37db39 (FB-101).
- Semua build + test + vet hijau (order-service, merchant-service, admin-service tsc, android compile).
- Pushed ke `staging` (bukan main/production).
