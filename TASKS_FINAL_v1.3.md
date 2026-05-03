## FASE 2.5 TAMBAHAN: CUSTOMER WEB PORTAL (Minggu 15–19)

### [BARU v1.3] — Sisipkan setelah Landing Page Sprint 7.5

> Bagian ini melengkapi TASKS_FINAL_v1.2.md dengan task Web Portal.
> Integrate ke TASKS v1.2 setelah Sprint 7.5 (Landing Page).

---

### WEB-SETUP-001: Customer Web Portal — Project Setup

**Assignee:** Frontend Engineer
**Estimasi:** 2 hari
**Priority:** P0

- ✅ Next.js 14+ (App Router, TypeScript) project setup
- ✅ Struktur route: `/` landing, `/app/*` portal (auth guard)
- ✅ Tailwind CSS + component library install + theme config
- ✅ State management: Zustand store setup (auth, notifications, bulk job progress)
- ✅ Data fetching: React Query (TanStack Query) setup + global error handling
- ⬜ WebSocket: socket.io-client + custom hook `useWebSocket`
- ✅ HTTP: Axios instance + auth interceptor (attach httpOnly cookie) + retry
- ✅ Folder structure: `/app/(public)` landing, `/app/(portal)` auth routes
- ✅ Middleware Next.js: redirect `/app/*` ke `/login` jika session tidak valid
- ✅ Environment variables: `.env.local` setup
- ⬜ Sentry + Google Analytics 4 + GTM setup
- ⬜ Bundle analyzer: `@next/bundle-analyzer` — target First Load JS <200KB

**Acceptance Criteria:**

```
✅ Dev server running tanpa error
✅ Auth guard: /app/* redirect ke /login jika belum login
✅ Build production sukses
✅ Bundle size First Load JS <200KB
```

---

### WEB-AUTH-001: Auth Flow Web (Login + Register)

**Assignee:** Frontend Engineer
**Estimasi:** 2 hari
**Priority:** P0

- ⬜ Halaman `/login`:
  - Input email/password dasar sudah ada (belum OTP)
  - Timer resend OTP (60 detik countdown)
  - Google Sign In button
  - "Remember me" checkbox (session 30 hari)
  - Redirect ke `/dashboard` setelah login (✅ Selesai)
- ⬜ Halaman `/daftar`:
  - Step 1: nomor HP + OTP
  - Step 2: nama + email (opsional) + referral code (opsional)
  - Step 3: setup PIN 6 digit + konfirmasi
  - Progress stepper di atas form
- ✅ Session management:
  - ✅ JWT di httpOnly cookie via `POST /auth/web/login`
  - ⬜ Auto-refresh token sebelum expire
  - ✅ Logout: `POST /auth/web/logout` + clear cookie + redirect `/login`
- ⬜ "Lupa PIN" flow via OTP reset

**Acceptance Criteria:**

```
✅ Login berhasil → redirect dashboard
✅ Refresh halaman → session tetap aktif (httpOnly cookie)
✅ Logout → semua route /app/* tidak bisa diakses
✅ OTP auto-paste dari clipboard
```

---

### WEB-LAYOUT-001: Layout Utama Portal

**Assignee:** Frontend Engineer
**Estimasi:** 2 hari
**Priority:** P0

- ✅ Sidebar component:
  - ✅ Menu items dengan icons (Lucide)
  - ✅ Active state highlight
  - ⬜ Collapsed state untuk tablet
  - ⬜ Badge notif di menu "Order"
- ✅ Topbar component:
  - ⬜ Search bar global (Ctrl+K shortcut → command palette)
  - ⬜ Notification bell dropdown (last 10 notif, real-time WebSocket)
  - ✅ User avatar dropdown (profil, logout)
- ⬜ Responsive:
  - ✅ Desktop (≥1024px): sidebar full
  - ⬜ Tablet (768–1023px): sidebar collapsed (icons only)
  - ⬜ Mobile (≤767px): bottom navigation bar (5 menu utama)
- ⬜ Dark mode toggle (Tailwind dark: prefix + localStorage preference)
- ⬜ Toast notification system (global, muncul di corner kanan atas)
- ⬜ Loading bar (top progress bar saat navigasi antar halaman)

---

### WEB-DASH-001: Dashboard Home

**Assignee:** Frontend Engineer
**Estimasi:** 3 hari
**Priority:** P0

- ✅ Widget summary cards: order aktif, selesai bulan ini, total belanja, loyalty tier
- ⬜ Order aktif list (WebSocket real-time, update 30 detik):
  - Max 5 rows, tombol "Lihat Semua"
  - Klik row → expand mini-tracking inline (peta kecil + ETA)
- ⬜ Bar chart order 30 hari (Recharts):
  - Toggle: by count / by value (Rp)
  - Hover tooltip
- ⬜ Shortcut aksi cepat: [Kirim Sekarang] [Kirim Massal] [Unduh Resi]
- ⬜ Promo banner (jika ada voucher aktif)
- ⬜ Progress loyalty tier (progress bar menuju tier berikutnya)
- ⬜ Skeleton loader saat data loading

---

### WEB-ORDER-001: Single Order Booking

**Assignee:** Frontend Engineer
**Estimasi:** 4 hari
**Priority:** P0

- ✅ Layout 2 kolom: form (kiri) + sticky summary harga (kanan)
- ✅ Input alamat pickup:
  - Google Places autocomplete
  - Peta interaktif (drag pin untuk adjust)
  - Tombol "Gunakan Lokasi Saya" (browser geolocation)
  - "Pilih dari Buku Alamat" (modal dropdown address book)
- ✅ Input alamat tujuan: sama dengan pickup + field nama + HP penerima
- ✅ Input detail paket:
  - Nama, kategori (dropdown), berat kg
  - Dimensi P×L×T (input angka) + tombol "Hitung Volumetrik" → tampilkan charged weight
  - Opsi scan dimensi via webcam (modal kamera browser + ML API)
  - Toggle asuransi + input nilai barang
  - Catatan kurir (textarea 200 char)
- ✅ Jadwal: radio "Sekarang" / "Terjadwal" (datetime picker)
- ✅ Summary harga sticky (update real-time, debounced 500ms):
  - Breakdown: dasar + surge + asuransi + diskon
  - Model badge (P2P / 2-Kaki)
  - Surge badge jika aktif
  - ETA estimasi
- ✅ Payment modal: QR QRIS + countdown 15 menit + auto-detect
- ✅ Sukses screen: animasi + link tracking + link resi

---

### WEB-BULK-001: Bulk Order Web UI

**Assignee:** Frontend Engineer
**Estimasi:** 5 hari
**Priority:** P0

- ✅ Stepper 3 tahap di atas: Upload → Review → Bayar
- ✅ Tahap 1 — Upload:
  - Drag & drop zone (react-dropzone)
  - Klik untuk browse file
  - Validasi client: format .xlsx, max 5MB
  - Pilih alamat pickup (dropdown dari address book atau input baru)
  - Upload progress bar
  - Polling status validasi job (setiap 3 detik)
- ✅ Tahap 2 — Review & Edit:
  - Summary: X valid, Y error → tombol download error report
  - DataGrid table (TanStack Table atau AG Grid Community):
    - Kolom: No, Penerima, HP, Tujuan, Berat, Harga, Status validasi, Aksi
    - Baris error: background merah muda, tooltip error per kolom
    - Edit inline per baris
    - Hapus per baris
    - Checkbox multi-select → bulk hapus
    - Search + filter per kolom
    - Virtual scroll (performa untuk 500 baris)
  - Tombol "Hapus Semua Error" (1 klik)
  - Footer sticky: subtotal + diskon + total bayar + [Lanjut ke Pembayaran]
- ✅ Tahap 3 — Bayar & Proses:
  - QR QRIS besar + countdown 30 menit
  - Copy kode QR ke clipboard
  - Progress bar setelah bayar (WebSocket real-time)
  - Counter: selesai / gagal / total
  - Toast progress di corner (jika user navigasi ke halaman lain)
  - Selesai: ringkasan + tombol download ZIP resi

**Acceptance Criteria:**

```
✅ Upload 500 baris → progress validasi tampil real-time
✅ Edit inline: save → re-validate + update harga tanpa reload
✅ Virtual scroll: 500 baris tidak lag (< 16ms frame render)
✅ Progress real-time via WebSocket saat processing
✅ ZIP download berhasil setelah semua order dibuat
```

---

### WEB-ORDER-002: Order List & Detail

**Assignee:** Frontend Engineer
**Estimasi:** 3 hari
**Priority:** P0

- ✅ Halaman `/app/orders`:
  - ✅ Tabel dengan kolom: no order, penerima, status badge, model, harga, tanggal, aksi
  - ✅ Filter panel: status, date range, model, bulk/single
  - ✅ Search bar (full-text, debounced)
  - ✅ URL-based filter (query params)
  - ✅ Checkbox multi-select + bulk download resi
  - ✅ Pagination atau infinite scroll
- ✅ Halaman `/app/orders/:id`:
  - ✅ Layout 2 kolom: live map (kiri) + detail & timeline (kanan)
  - ✅ Google Maps dengan marker kurir (update real-time WebSocket)
  - ✅ Polyline rute aktif
  - ✅ Timeline event dengan foto (klik foto → lightbox)
  - ✅ Kurir info card + tombol hubungi
  - ✅ Chat box in-browser (WebSocket)
  - ✅ Tombol: unduh resi, laporkan masalah
  - ✅ Status badge animasi (pulse jika aktif)

---

### WEB-RESI-001: Resi Management Web

**Assignee:** Frontend Engineer
**Estimasi:** 3 hari
**Priority:** P0

- ⬜ Halaman `/app/resi`:
  - Tabel resi dengan filter + search
  - Bulk select + download ZIP (POST /orders/bulk-download)
  - Status ZIP download: polling → selesai → tombol unduh
- ⬜ Halaman `/app/resi/:id`:
  - Layout resi sesuai PDF (visual konsisten)
  - QR code besar (qrcode.react component)
  - Tombol: Unduh PDF, Unduh PNG, Bagikan, Cetak
  - Tombol "Scan QR via Webcam" → modal kamera → verifikasi → tampilkan konfirmasi
  - Status order badge
- ⬜ Share resi:
  - Copy link public (limited info) ke clipboard
  - Share via WhatsApp (wa.me link dengan text)
  - Print-friendly CSS media query

---

### WEB-ADDR-001: Address Book Web

**Assignee:** Frontend Engineer
**Estimasi:** 2 hari
**Priority:** P1

- ⬜ Halaman `/app/alamat`:
  - Grid cards alamat
  - Tambah alamat: modal dengan Google Places + peta drag pin
  - Edit alamat: prefill modal
  - Set default pickup (radio select)
  - Hapus dengan konfirmasi dialog
- ⬜ Import dari Excel:
  - Download template → upload → preview → import
  - Validasi di client sebelum submit
- ⬜ Integrasi ke booking form: "Pilih dari Buku Alamat" modal

---

### WEB-LAPORAN-001: Dashboard UMKM & Laporan

**Assignee:** Frontend Engineer
**Estimasi:** 3 hari
**Priority:** P1

- ⬜ Halaman `/app/laporan`:
  - Conditional: tampil hanya jika customer >10 order/bulan
  - Summary cards: total order, selesai, gagal, total pengeluaran, on-time rate
  - Period picker: bulan ini, bulan lalu, Q1/Q2/Q3/Q4, custom range
  - Line chart tren order + pengeluaran per hari (Recharts)
  - Donut chart distribusi model (P2P vs 2-Kaki)
  - Bar chart top 5 zona tujuan
  - Stats: avg berat, avg ongkos per order
- ⬜ Export Excel (SheetJS):
  - Generate client-side dari data API
  - Kolom: no resi, tanggal, penerima, alamat, berat, model, harga, status
  - Download langsung tanpa server (untuk performa)
- ⬜ Export PDF (server-side via Puppeteer):
  - POST /customers/me/reports/monthly → async generate
  - Progress indicator → download link siap

---

### WEB-PROFIL-001: Profil & Pengaturan Web

**Assignee:** Frontend Engineer
**Estimasi:** 2 hari
**Priority:** P1

- ⬜ Halaman `/app/profil` dengan tab navigation:
  - Tab Akun: foto (upload + crop modal), nama, HP, email, tier badge + progress
  - Tab Keamanan: ganti PIN, riwayat login table, logout semua device
  - Tab Notifikasi: toggle push browser + WA + email, level detail WA
  - Tab Referral: kode + copy + share + statistik + reward history
- ⬜ Foto profil: crop modal (react-easy-crop), upload ke S3

---

### WEB-PUSH-001: Browser Push Notification

**Assignee:** Frontend Engineer
**Estimasi:** 2 hari
**Priority:** P1

- ⬜ Service Worker setup (`/public/sw.js`)
- ⬜ Request permission prompt (setelah login, satu kali)
- ⬜ Subscribe: `POST /notifications/web/subscribe` (kirim endpoint + keys ke backend)
- ⬜ Unsubscribe di halaman profil → `DELETE /notifications/web/subscribe`
- ⬜ Handle incoming push: tampilkan notification native browser
- ⬜ Klik notification → focus tab atau buka halaman terkait

---

### WEB-QA-001: Testing Web Portal

**Assignee:** QA Engineer
**Estimasi:** 4 hari
**Priority:** P0

**[Unit & Component Testing]**

- ⬜ React Testing Library: semua form validation
- ⬜ Mock API (MSW — Mock Service Worker): semua API calls
- ⬜ Test: bulk order table edit inline + re-validate
- ⬜ Test: QR code scan via webcam flow (mock getUserMedia)
- ⬜ Coverage target: ≥75% semua komponen utama

**[E2E Testing (Playwright)]**

- ⬜ Login flow: OTP → dashboard
- ⬜ Single order booking → payment → tracking → resi
- ⬜ Bulk order: upload Excel → review → bayar → download ZIP
- ⬜ Address book: add → set default → use in booking
- ⬜ Resi scan: view QR → webcam scan → verify
- ⬜ Dashboard UMKM: filter periode → export Excel
- ⬜ Responsive: test semua halaman di 3 viewport (375, 768, 1440)

**[Performance Testing]**

- ⬜ Lighthouse audit semua halaman utama: target ≥90
- ⬜ Bulk order table: 500 baris render time <1 detik
- ⬜ Live tracking map: WebSocket update 10 detik tanpa memory leak
- ⬜ Dashboard analytics: load time <2 detik

**[Security Testing]**

- ⬜ CSRF: semua POST/PATCH/DELETE ada CSRF token
- ⬜ XSS: semua user input di-sanitize
- ⬜ Auth bypass: `/app/*` tidak bisa diakses tanpa session
- ⬜ QR scan: scan resi user lain → 403
- ⬜ Rate limit: pricing estimate >20/menit → 429

---

## RINGKASAN TASK WEB PORTAL (v1.3)

| Task ID | Deskripsi | Sprint | Estimasi | Priority |
|---|---|---|---|---|
| WEB-SETUP-001 | Next.js project setup + architecture | 7.5 | 2 hari | P0 |
| WEB-AUTH-001 | Login + register web | 7.5 | 2 hari | P0 |
| WEB-LAYOUT-001 | Layout portal (sidebar, topbar, responsive) | 8 | 2 hari | P0 |
| WEB-DASH-001 | Dashboard home (charts, order aktif) | 8 | 3 hari | P0 |
| WEB-ORDER-001 | Single order booking + payment | 8 | 4 hari | P0 |
| WEB-BULK-001 | Bulk order web UI (drag drop, datagrid, progress) | 9 | 5 hari | P0 |
| WEB-ORDER-002 | Order list + detail + tracking live | 9 | 3 hari | P0 |
| WEB-RESI-001 | Resi management + QR scan webcam | 9 | 3 hari | P0 |
| WEB-ADDR-001 | Address book web | 10 | 2 hari | P1 |
| WEB-LAPORAN-001 | Dashboard UMKM + export | 10 | 3 hari | P1 |
| WEB-PROFIL-001 | Profil & pengaturan | 10 | 2 hari | P1 |
| WEB-PUSH-001 | Browser push notification | 10 | 2 hari | P1 |
| WEB-QA-001 | Testing web portal (unit + E2E + perf) | 12 | 4 hari | P0 |
| **TOTAL** | | | **37 hari** | |

---

## UPDATE ESTIMASI TOTAL (v1.3)

| Fase | SP Sebelum | +Web Portal v1.3 | Total |
|---|---|---|---|
| Fase 0: Foundation | 64 SP | — | 64 SP |
| Fase 1: Core Backend | 130 SP | +2 SP (web_sessions, web_push DB) | **132 SP** |
| Fase 1.5: Customer Backend | 18 SP | — | 18 SP |
| Fase 2: Mobile MVP | 114 SP | — | 114 SP |
| Fase 2.5: Landing + Web Portal | 9 SP | +30 SP (WEB-SETUP s/d WEB-ORDER-001) | **39 SP** |
| Fase 3: Advanced | 52 SP | — | 52 SP |
| Fase 4: Admin Dashboard | 73 SP | — | 73 SP |
| Fase 5: QA | 62 SP | +8 SP (WEB-QA-001) | **70 SP** |
| **TOTAL** | **500 SP** | **+40 SP** | **🎯 540 SP** |

*540 SP ÷ 7 engineers ÷ 20 SP per sprint = ~27–28 minggu. Masih dalam target 28 minggu dengan buffer minimal.*

---

## DEPENDENCY MAP UPDATE (v1.3)

```
[Backend selesai — ORDER, RESI, BARCODE, BULK API]
    ↓
WEB-SETUP-001 → WEB-AUTH-001
    ↓
WEB-LAYOUT-001
    ↓
WEB-DASH-001 → WEB-ORDER-001 (paralel)
    ↓                ↓
WEB-BULK-001    WEB-ORDER-002
    ↓                ↓
WEB-RESI-001 (depends on SBAR-001 backend)
    ↓
WEB-ADDR-001 → WEB-LAPORAN-001 → WEB-PROFIL-001 (sequential)
WEB-PUSH-001 (paralel dengan WEB-LAPORAN-001)
    ↓
WEB-QA-001 (semua WEB-* selesai)
    ↓
LAUNCH-001..003
```
