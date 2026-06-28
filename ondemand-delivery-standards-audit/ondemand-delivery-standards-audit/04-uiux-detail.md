# UI/UX Detail Standard & Cara Pakai Skill Ini

---

## A. Prinsip Desain Spesifik untuk On-Demand Delivery App

### A.1 Gestur — Kapan Pakai Tap, Swipe, Long-Press

Ini sering disepelekan tapi berdampak besar ke usability. Aturan umum:

| Gestur | Kapan Dipakai | Contoh di Tembus |
|---|---|---|
| **Tap** | Aksi reversible, tidak time-critical, low-risk | Buka detail order, navigasi antar tab, toggle filter, konfirmasi "tiba di lokasi" |
| **Swipe** | Aksi yang butuh "pengamanan" dari accidental trigger, ATAU ada timer/urgency | Terima order (kurir), dismiss notification, swipe-to-delete di list |
| **Long-press** | Aksi sekunder/kontekstual yang tidak perlu selalu visible | Long-press order di history untuk quick-actions (re-order, report issue) |
| **Drag** | Reordering, atau adjust posisi (pin map) | Drag pin lokasi pickup/drop untuk fine-tuning |
| **Double-tap** | Hindari kecuali sudah jadi konvensi universal (like di Instagram) | Tidak relevan untuk delivery app — jangan dipaksakan |

**Aturan emas**: makin besar konsekuensi sebuah aksi (komitmen waktu,
uang, atau tidak bisa di-undo), makin "berat" gestur yang dibutuhkan.
Tap = murah secara kognitif → untuk aksi murah konsekuensi.
Swipe = lebih effortful → untuk aksi yang perlu sedikit "gesekan" supaya
tidak ke-trigger gak sengaja.

### A.2 Hierarki Visual & Komponen

- **Bottom sheet** untuk informasi kontekstual yang gak perlu nutup full
  screen (driver found, order detail saat tracking) — supaya map/context
  tetap visible di belakang.
- **Full-screen modal** hanya untuk aksi yang butuh fokus penuh tanpa
  distraksi (incoming order ke kurir, payment flow).
- **Toast/snackbar** untuk feedback sekilas (promo berhasil dipakai, copy
  berhasil) — auto-dismiss, jangan butuh aksi user.
- **Floating Action Button (FAB)** dipakai hemat, hanya untuk 1 aksi
  paling penting di screen tersebut (misal SOS button saat tracking).

### A.3 Loading & Empty States (sering terlewat tapi standar wajib)

| State | Wajib Ada? | Detail |
|---|---|---|
| Skeleton loading saat fetch data | MUST | Bukan spinner generik — skeleton yang mirip shape konten asli (card outline, dst) |
| Empty state riwayat order kosong | MUST | Ilustrasi + copy yang friendly + CTA ("Buat order pertama kamu") |
| Error state network gagal | MUST | Ilustrasi + tombol "Coba lagi", bukan cuma teks error mentah |
| Empty state hasil search (alamat tidak ketemu) | MUST | Saran alternatif, bukan blank |
| Offline state (no internet) | MUST | Banner persistent di atas, bukan silent fail saat user tap sesuatu |

### A.4 Konsistensi Cross-Platform (Android vs iOS)

- Pakai **shared design token** (warna, spacing, typography scale) yang
  sama antara Kotlin & Swift, bukan reimplementasi manual yang gampang
  drift seiring waktu. Idealnya ada design system terdokumentasi (Figma +
  token export) yang jadi single source of truth.
- **Navigasi tetap ikut konvensi platform**: Android pakai back button
  hardware/gesture sistem, iOS pakai swipe-back dari kiri edge — jangan
  override gesture native ini kecuali ada alasan kuat.
- Brand color (dark green/orange Tembus) harus dicek kontrasnya di kedua
  platform karena rendering warna kadang sedikit beda (color profile).

### A.5 Aksesibilitas Minimum (WCAG 2.1 AA)

- Kontras teks ≥ 4.5:1 — cek khususnya teks orange di atas background
  terang (sering jadi masalah kontras kalau gak dicek).
- Touch target minimal 44×44pt (iOS) / 48×48dp (Android) — penting buat
  kurir yang make app sambil pakai sarung tangan/kondisi jalan.
- Dynamic type/font scaling didukung, jangan hardcode ukuran teks dalam px
  yang gak responsive ke setting accessibility user.

---

## B. Cara AI Agent Menggunakan Skill Ini untuk Audit

1. Baca `SKILL.md` (file utama) untuk checklist ringkas per domain.
2. Untuk detail lengkap & alasan keputusan UX, baca:
   - `01-customer-app-flow.md`
   - `02-courier-app-flow.md`
   - `03-admin-web-flow.md`
   - `04-uiux-detail.md` (file ini)
3. Scan codebase secara sistematis:
   - Backend (Go/Fiber): cari endpoint & enum status order, validasi
     apakah state machine selengkap yang dispesifikasikan di file 01/02.
   - Android (Kotlin): cari screen/composable terima order — cek
     implementasi gestur (apakah pakai `SwipeToDismiss`/custom drag
     detector, atau cuma `Button` biasa untuk accept order).
   - iOS (Swift): cek pattern serupa (drag gesture vs button).
   - Web Admin (React/TS): cek role-based routing & apakah validasi role
     juga ada di backend (bukan cuma hide component).
4. Untuk setiap fitur di tabel, AI agent **harus cari bukti nyata di kode**
   (nama file/function/component), bukan asumsi dari nama folder semata.
5. Tandai status: ✅ Ada & sesuai / ⚠️ Ada tapi kurang lengkap / ❌ Tidak ada / ❓ Tidak ditemukan (perlu konfirmasi manual).
6. Untuk fitur yang ditandai punya **Feature Flag**, cek juga: apakah
   benar-benar configurable (lewat config/DB/flag service), atau hardcoded?
   Hardcoded = catat sebagai gap tersendiri meski fiturnya ada.

## C. Format Laporan Akhir yang Diharapkan

```markdown
# Laporan Audit Tembus — [Tanggal]

## Ringkasan Skor
| Domain | Total Item | ✅ Sesuai | ⚠️ Sebagian | ❌ Belum | Skor |
|---|---|---|---|---|---|
| Customer App | 35 | .. | .. | .. | ..% |
| Courier App | 30 | .. | .. | .. | ..% |
| Admin Web | 25 | .. | .. | .. | ..% |
| UI/UX | 15 | .. | .. | .. | ..% |
| Security/Compliance | 12 | .. | .. | .. | ..% |

## Temuan Kritis (harus difix sebelum scale-up)
1. [Nama fitur] — [kondisi saat ini] — [risiko kalau dibiarkan] — [file/lokasi kode]
...

## Temuan Detail per Domain
[detail per item, dengan bukti file:line]

## Rekomendasi Roadmap (urutan prioritas)
1. Critical (blocking launch/scale)
2. High (harus sebelum funding round / investor demo)
3. Medium (bisa nyusul post-launch)
4. Low (nice-to-have, gak urgent)
```
