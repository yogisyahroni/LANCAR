---
name: ondemand-delivery-standards-audit
description: >
  Gunakan skill ini saat user minta AI agent meng-audit codebase aplikasi
  on-demand delivery/logistics (mirip GoSend/Grab Express) — baik mobile app
  customer, mobile app kurir, admin web/dashboard, maupun backend API —
  untuk dicek kesesuaiannya dengan standar internasional flow bisnis,
  UX pattern, keamanan, dan compliance logistik. Trigger saat user menyebut:
  "audit codebase", "cek standard industri", "bandingin sama Gojek/Grab",
  "review flow customer/kurir/admin", atau "cek UI/UX delivery app".
---

# Audit Standar Internasional: Aplikasi On-Demand Delivery

Skill ini adalah **panduan kerja untuk AI agent** (Claude Code, Cursor, dst)
dalam melakukan audit menyeluruh terhadap codebase aplikasi on-demand
delivery seperti Tembus. Audit dibagi 5 domain: Customer App, Courier App,
Admin Web, UI/UX, dan Cross-cutting (security, data, compliance).

## ⚠️ File Pendukung — WAJIB Dibaca Sebelum Audit

Checklist di file ini ringkas. Untuk **spesifikasi fitur lengkap, detail
flow tiap screen, state machine, feature flag, dan keputusan UX
mikro (contoh: swipe vs tap untuk terima order kurir)**, baca file-file
berikut di folder yang sama — JANGAN audit hanya berdasarkan checklist
ringkas di bawah:

- `01-customer-app-flow.md` — flow order step-by-step, breakdown fitur per
  screen, state machine order, daftar feature flag rekomendasi
- `02-courier-app-flow.md` — flow kurir step-by-step, **detail gestur
  terima order (swipe vs tap + alasannya)**, state machine kurir, device
  permission flow
- `03-admin-web-flow.md` — struktur navigasi admin, fitur per modul, RBAC
- `04-uiux-detail.md` — prinsip gestur, hierarki visual, loading/empty
  states, aksesibilitas, dan format laporan akhir yang diharapkan
- `05-matching-fraud-observability.md` — algoritma matching kurir, fraud &
  abuse handling, notification architecture, in-app CS, onboarding,
  API versioning, observability/SLA monitoring

## Cara Pakai

1. AI agent **scan struktur repo dulu** (`view` direktori root, identifikasi
   stack: Go/Fiber backend, Kotlin Android, Swift iOS, React/TS web).
2. **Baca ke-4 file pendukung di atas secara penuh** sebelum mulai audit —
   ini bukan opsional, karena detail kunci (state machine, feature flag,
   keputusan gestur) hanya ada di file tersebut, bukan di sini.
3. Untuk setiap fitur di tabel pada file pendukung, agent **mencari bukti
   konkret di kode** (nama file, function, screen, endpoint) — bukan asumsi
   dari nama folder/file semata.
4. Setiap item diberi status: ✅ Sesuai / ⚠️ Sebagian / ❌ Belum / ❓ Tidak ditemukan.
5. Untuk fitur yang ditandai "Feature Flag" di file pendukung, cek juga
   apakah benar-benar configurable atau hardcoded — hardcoded dicatat
   sebagai gap tersendiri.
6. Output akhir: laporan gap analysis sesuai format di `04-uiux-detail.md`
   bagian C, dengan rekomendasi prioritas (Critical/High/Medium/Low).
7. Jangan ubah kode di tahap audit — ini read-only assessment, kecuali user minta fix.

---

## 1. Customer App — Flow Standard (acuan: Grab/Gojek/Uber pattern)

### 1.1 Order Lifecycle
- [ ] Address input dengan pin-drop map + autocomplete (bukan cuma teks manual)
- [ ] Estimasi harga **sebelum** konfirmasi order (transparent pricing)
- [ ] Estimasi waktu (ETA) ditampilkan sebelum & sesudah order dibuat
- [ ] Real-time tracking kurir di map (live location update, bukan polling lambat >10s)
- [ ] Status order granular: `searching_driver → driver_assigned → picking_up → in_transit → delivered`
- [ ] Notifikasi push di setiap transisi status
- [ ] Cancel order dengan reason + cancellation fee policy yang jelas
- [ ] Re-order / repeat last order shortcut
- [ ] In-app chat/call ke kurir (masking nomor HP — privacy)
- [ ] Proof of delivery (foto/signature/OTP) terlihat oleh customer

### 1.2 Payment & Pricing
- [ ] Multiple payment methods (e-wallet, VA, COD) dengan status jelas
- [ ] Breakdown harga visible (base fare, distance fare, surcharge, insurance) — relevan ke pricing formula lo
- [ ] Promo/voucher application sebelum checkout
- [ ] Invoice/receipt tersimpan & bisa diakses ulang
- [ ] Refund flow untuk order gagal/cancel oleh sistem

### 1.3 Trust & Safety
- [ ] Rating & review kurir per order
- [ ] Insurance/proteksi barang info (relevan ke integrasi PasarPolis lo)
- [ ] Emergency/SOS button selama tracking aktif
- [ ] Verifikasi data kurir (foto, plat nomor, nama) ditampilkan ke customer

---

## 2. Courier/Driver App — Flow Standard

### 2.1 Onboarding & Status
- [ ] Online/offline toggle yang jelas & battery-aware (background location)
- [ ] Status kurir granular: `idle → offered → accepted → heading_to_pickup → arrived_pickup → picked_up → heading_to_dropoff → arrived_dropoff → completed`
- [ ] Auto-reject timeout untuk order offer (biasanya 10-15 detik) supaya gak ngeblok antrian order
- [ ] Multi-order/batching support (kalau model bisnis butuh efisiensi 2-kaki)

### 2.2 Navigasi & Eksekusi
- [ ] Turn-by-turn navigation terintegrasi (TomTom — cek apakah sudah native nav atau cuma static map)
- [ ] Konfirmasi pickup dengan bukti (foto/scan/OTP dari sender)
- [ ] Konfirmasi delivery dengan bukti (foto/signature/OTP dari penerima)
- [ ] Handling untuk "penerima tidak ada di tempat" / gagal kirim
- [ ] Cash collection tracking jika COD (rekonsiliasi harian)

### 2.3 Earnings & Insentif
- [ ] Real-time earnings tracker per order & harian
- [ ] Breakdown earnings transparan (base + distance, sesuai formula 80% ke driver lo)
- [ ] Riwayat payout & withdrawal flow
- [ ] Incentive/bonus program visibility (jam sibuk, target harian)

### 2.4 Device & Safety
- [ ] Device integrity check (root/jailbreak detection) — lo udah explore ini di Kotlin
- [ ] Background location permission flow yang compliant (Android 10+ "Allow all the time" prompt jelas)
- [ ] Offline mode handling (order tetap bisa diproses saat sinyal hilang sementara)

---

## 3. Admin Web Dashboard — Flow Standard

### 3.1 Operasional Real-time
- [ ] Live map semua kurir aktif + status order berjalan
- [ ] Manual order assignment/override (untuk kasus auto-matching gagal)
- [ ] Dispute/complaint management queue
- [ ] Driver approval/verification workflow (KYC dokumen: KTP, SIM, STNK)

### 3.2 Finance & Reporting
- [ ] Reconciliation dashboard (platform margin 20%, driver payout, infra cost Rp1.500/order)
- [ ] Export laporan (CSV/Excel) untuk akuntansi
- [ ] Refund/adjustment manual tool dengan audit log
- [ ] Revenue dashboard per periode (harian/mingguan/bulanan)

### 3.3 User & Access Management
- [ ] Role-based access control (admin, finance, ops, CS — bukan satu super-admin)
- [ ] Activity log / audit trail untuk semua aksi admin (siapa ubah apa, kapan)
- [ ] Customer support tools (lihat history order user, refund cepat)

---

## 4. UI/UX Standard

### 4.1 Konsistensi & Heuristik (Nielsen's 10 Usability Heuristics)
- [ ] Visibility of system status (loading state, skeleton screen, bukan blank screen)
- [ ] Konsistensi komponen (button, color, spacing) lintas screen — cek design system/token
- [ ] Error message jelas & actionable (bukan "Error 500" mentah ke user)
- [ ] Undo/cancel tersedia untuk aksi penting (cancel order, hapus alamat)

### 4.2 Accessibility (WCAG 2.1 AA — minimal baseline industri)
- [ ] Kontras warna teks ≥ 4.5:1 (cek warna dark green/orange brand lo terhadap background)
- [ ] Touch target minimal 44x44px (Apple HIG) / 48x48dp (Material Design)
- [ ] Support dynamic font size / text scaling
- [ ] Alt text / accessibility label untuk icon-only button

### 4.3 Mobile Platform Guidelines
- [ ] Android: ikut Material Design 3 (motion, elevation, navigation pattern)
- [ ] iOS: ikut Apple HIG (safe area, swipe back gesture, native navigation feel)
- [ ] Konsisten antara Android & iOS app (jangan beda flow signifikan)

### 4.4 Performance UX
- [ ] Skeleton loading / shimmer saat fetch data, bukan spinner polos di semua tempat
- [ ] Optimistic UI untuk aksi ringan (misal like/rating) tanpa nunggu network round-trip
- [ ] Empty state design (riwayat order kosong, dll) — bukan blank putih

---

## 5. Cross-Cutting: Security, Data, & Compliance

### 5.1 Security (OWASP Mobile Top 10 + OWASP API Top 10)
- [ ] API auth pakai JWT/OAuth dengan expiry & refresh token yang benar
- [ ] Rate limiting di endpoint kritikal (login, OTP request)
- [ ] Sensitive data (no HP, alamat) tidak di-log plaintext
- [ ] Secrets management (Infisical/Doppler — sudah lo terapkan, cek konsistensi di semua service)
- [ ] Certificate pinning di mobile app untuk komunikasi ke backend

### 5.2 Data & Privacy (relevan UU PDP Indonesia)
- [ ] Consent eksplisit untuk pengumpulan lokasi & data pribadi
- [ ] Data retention policy (riwayat order, lokasi historis tidak disimpan selamanya tanpa alasan)
- [ ] Masking nomor telepon customer↔kurir (privacy by design)

### 5.3 Regulasi Logistik Indonesia (relevan ke riset lo: PP No. 20/2026, PP No. 8/2021, Perpres No. 27/2026)
- [ ] Flow asuransi pengiriman terhubung ke compliance (PasarPolis integration check)
- [ ] Driver Partnership Agreement tercermin di flow app (status mitra, bukan karyawan — pengaruh ke UX onboarding kurir)
- [ ] Proof of delivery tersimpan sesuai durasi yang disyaratkan regulasi (audit trail untuk dispute)

---

## Format Output Audit

Setelah AI agent selesai scan, hasilkan laporan dengan struktur:

```
## Ringkasan Eksekutif
- Skor kesesuaian per domain (Customer/Courier/Admin/UIUX/Security): X/Y item terpenuhi

## Temuan Detail
### [Domain] > [Sub-kategori]
- ✅/⚠️/❌/❓ [Item] — Bukti: `file:line` atau "tidak ditemukan implementasi"
- Rekomendasi: ...
- Prioritas: Critical/High/Medium/Low

## Top 5 Gap Prioritas (yang harus dikerjain duluan)
1. ...
```

Prioritaskan gap yang berkaitan dengan: keamanan data, proof of delivery/dispute
(karena ini legal exposure), dan konsistensi pricing display (karena langsung
ke trust customer).
