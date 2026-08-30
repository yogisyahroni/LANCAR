# Merchant Android — Stitch Screen Parity

Status: Active  
Created: 2026-08-28  
Reference: Stitch project `Integrated Food Delivery Platform` (`7534771775167570963`)

## Goal

Menyelesaikan gap antara aplikasi Android Merchant dan screen reference Stitch yang belum mempunyai padanan Android standalone. Semua perubahan harus memakai data/API nyata yang sudah tersedia; jangan membuat mock order, nominal, notifikasi, atau status bisnis.

## Scope checklist

### 1. Riwayat Pesanan khusus

- [x] Tambahkan screen Riwayat Pesanan yang bisa dibuka dari Profil Merchant.
- [x] Tampilkan filter status dan daftar order dari `GET /api/v1/merchant/orders`.
- [x] Sediakan loading, empty, error, dan retry sesuai kontrak API.
- [x] Terapkan hierarchy visual Stitch: header light, filter compact, row order ringkas, status semantic.
- [x] Buka detail order yang sudah ada tanpa membuat detail duplikat yang tidak konsisten.

### 2. Detail Pesanan Dibatalkan

- [x] Pastikan order berstatus canceled dapat dibuka dari riwayat/detail.
- [x] Tampilkan alasan pembatalan, nominal, dan waktu bila API mengirimkannya.
- [x] Jika field bukti atau alasan tidak dikirim backend, tampilkan state “belum tersedia”, bukan data buatan.
- [x] Cocokkan warna error/status dengan token TEMBUS dan layout detail Stitch.

### 3. Detail Pesanan Ditolak

- [x] Pastikan order berstatus rejected dapat dibuka dari riwayat/detail.
- [x] Tampilkan alasan penolakan dan ringkasan order dari payload backend.
- [x] Bedakan copy rejected dan canceled secara jelas.
- [x] Sediakan aksi kembali dan retry/load error sesuai flow existing.

### 4. Variasi layout web Stitch yang belum punya route Android

- [x] Petakan setiap export Stitch ke route Android atau tandai eksplisit sebagai web-only.
- [x] Review implementasi `Edit Menu dengan Varian` dan `Tambah Menu Lengkap dengan Varian`; width 320dp smoke test tidak menunjukkan overflow pada shell/loading state.
- [x] Review implementasi `Profil Toko`, `Store Information`, `Operating Hours`, dan `Payment Settings`; width 320dp shell/loading state aman.
- [x] Review `Notifications` untuk unread/read, empty, error, dan deep-link order bila tersedia; `order_id` kini membuka flow order existing.
- [x] Review implementasi `Dashboard Pesanan`, `Wawasan Bisnis`, `Buat Promo`, dan `Settlement` terhadap token/inset/overflow; legacy purple/emoji schedule state dibersihkan.

#### Route matrix (2026-08-28)

| Export Stitch | Padanan Android Merchant | Status |
|---|---|---|
| Edit Menu dengan Varian | `Menu` → edit item → `VariantEditorScreen` | Reachable |
| Dashboard Pesanan | `MainScreen` → `Pesanan` / `HomeScreen` | Reachable |
| Wawasan Bisnis | `MainScreen` → `Wawasan` / `ReportScreen` | Reachable |
| Payment Settings | `Profil` → `Payment Settings` | Reachable, data nyata |
| Tambah Menu Lengkap dengan Varian | `Menu` → `Tambah Menu` → editor → varian | Reachable |
| Edit Public Profile | Belum ada endpoint edit profile yang disetujui | Web-only sementara |
| Store Information | `Profil` → `Store Information` | Reachable, read-only |
| Riwayat Pesanan | `Profil` → `Riwayat Pesanan` | Reachable |
| Detail Pesanan Merchant | `Pesanan` → detail/struk order | Reachable |
| Detail Pesanan Dibatalkan | `Riwayat Pesanan` → detail canceled | Reachable |
| Detail Pesanan Ditolak | `Riwayat Pesanan` → detail rejected | Reachable |
| Kelola Menu | `MainScreen` → `Menu` / `MenuScreen` | Reachable |
| Profil Toko | `MainScreen` → `Profil` / `ProfileScreen` | Reachable |
| Operating Hours | `Profil` → `Atur` pada Jam Operasional | Reachable sebagai dialog |
| Notifications | `Profil` → `Notifications` | Reachable, inbox backend |
| Buat Promo | `Profil` → `Promo & Diskon` → `Buat Promo` | Reachable |

## Acceptance criteria

- [x] Semua item scope yang memiliki kontrak backend mempunyai route Android yang reachable dari navigasi Merchant.
- [x] Status canceled dan rejected tidak tertukar dan tidak menampilkan copy/status palsu.
- [x] Tidak ada angka, order, customer, atau notifikasi sintetis pada production path.
- [x] Semua screen mempunyai loading, empty, error, dan retry state yang relevan.
- [ ] Tidak ada text overflow atau overlap pada device width 320–412dp dan font scale besar.
- [x] Card/sheet/input menggunakan token TEMBUS; radius normal maksimal 8dp untuk surface operasional.
- [x] `:app:compileDebugKotlin` dan `:app:installDebug` sukses.
- [ ] Screenshot evidence tersimpan untuk setiap route yang selesai. Evidence terbaru: `merchant-qa-profile-final-ac2.png`, `merchant-qa-store-information-ac.png`, `merchant-qa-payment-settings-ac.png`, `merchant-qa-notifications-ac.png`, `merchant-qa-promo-ac.png`, `merchant-qa-promo-create-ac.png`, `merchant-qa-menu-editor-ac.png`, plus baseline Home/Menu/Wawasan/Riwayat/font-scale/320dp. Data UAT Docker sekarang sudah menyediakan canceled/rejected dan VariantEditor live; screenshot route tersebut masih perlu diambil untuk mencentang acceptance.
- [x] `graphify update .` dijalankan setelah perubahan source.

## Current baseline

- Sudah tersedia: order queue/detail dasar, struk, menu CRUD/varian, promo, settlement, profile, Store Information, Payment Settings, Notifications inbox.
- Sudah ditambahkan: Riwayat Pesanan standalone dengan filter dan state API.
- Belum parity penuh: audit route/layout terhadap seluruh export Stitch dan screenshot evidence per route.
- Backend notification inbox sudah tersedia melalui `/api/v1/notifications`; mark-read memakai `/api/v1/notifications/read` dengan body `notification_id`.

## Evidence log

- 2026-08-28: task dibuat untuk memisahkan pekerjaan parity screen yang belum selesai dari pekerjaan UI Merchant yang sudah terimplementasi.
- 2026-08-28: Riwayat dan detail canceled/rejected diimplementasikan; backend payload alasan ditambahkan; Android/backend tests hijau.
- 2026-08-28: QA emulator menyimpan evidence `merchant-qa-home.png`, `merchant-qa-profile.png`, dan `merchant-qa-profile-settings.png`. Ditemukan isu inset: konten Profil saat scroll dapat berada di bawah status bar; belum dicentang sebagai parity final.
- 2026-08-28: Header Profil dipindahkan ke luar scroll container; `merchant-qa-profile-fixed.png` menunjukkan header tetap aman saat content scroll. Compile/install debug sukses.
- 2026-08-28: QA emulator tambahan menyimpan `merchant-qa-menu-final.png`, `merchant-qa-report-final.png`, `merchant-qa-profile-fixed.png`, dan `merchant-qa-history-final.png`. Riwayat berhasil dijangkau dari Profil; header, filter, empty state, dan bottom navigation terlihat tanpa overlap.
- 2026-08-28: Profile shell dan settings scaffold dimigrasikan lebih dekat ke Stitch: canvas mint, hero profile card dengan rating/edit affordance, header compact, dan detail cards ber-border. `:app:compileDebugKotlin` serta `:app:installDebug` sukses.
- 2026-08-28: Shell `Pesanan`, `Menu`, dan `Wawasan` ikut dipindahkan ke canvas mint dengan header/spacing compact agar tidak lagi memakai surface lama. Graphify diperbarui; compile/install debug sukses.
- 2026-08-29: Point 4 dilanjutkan: Profile/settings, Pesanan/Menu/Wawasan, editor Tambah/Edit Menu, dan VariantEditor diselaraskan ke shell Stitch; editor menu kini full-screen. Graphify, compile, dan install debug sukses. Screenshot serta width/font-scale audit masih pending.
- 2026-08-29: Audit lanjutan point 4: promo create menjadi full-screen, Operating Hours memakai compact `TimeInput`, Settlement/History memakai canvas mint dan radius token, schedule badge tidak lagi memakai emoji/purple, serta Notifications membuka order existing via `order_id`. Smoke test emulator 320dp mencapai MainActivity loading state tanpa overflow; screenshot `merchant-qa-320dp.png` tersimpan. Font-scale besar dan content-state screenshot masih pending.
- 2026-08-29: Acceptance audit: route/data/state production, status canceled/rejected, token/radius scan, compile/install, dan graphify dicentang berdasarkan implementasi/verifikasi. Sisa terbuka hanya font-scale besar dan screenshot evidence lengkap seluruh route.
- 2026-08-29: QA evidence dilengkapi untuk Store Information, Payment Settings, Notifications error/retry, Promo list/create, dan Tambah Menu editor. Compile/install debug final sukses; acceptance tetap belum dicentang untuk font-scale lintas seluruh route dan screenshot canceled/rejected/VariantEditor karena backend demo tidak menyediakan record yang dapat dipakai tanpa melanggar larangan synthetic data.
- 2026-08-29: Ditambahkan `backend/admin-service/src/seed-merchant-demo.ts` + script `npm run seed:merchant-demo`. Seed opt-in, non-production only, idempotent, tidak random dan tidak menghapus data umum. Data PostgreSQL UAT sekarang mencakup order delivered, canceled, dan merchant-rejected (kontrak aktual: `cancelled` + `reject_reason`), item snapshot + varian, lifecycle events, serta notification unread. Validasi seed dua kali menghasilkan tetap 3 order/3 item/3 varian/3 event/1 notification.
- 2026-08-29: Image `admin-service` dibuild ulang dan container `tembus-admin` direcreate. Seed dijalankan di container terhadap DB Docker; 3 order dan 1 item kini terhubung ke merchant aktif akun demo (profil legacy tidak dipakai). Gateway health dan login smoke test sama-sama HTTP 200. Healthcheck admin internal masih melaporkan unhealthy karena probe `/health` terkena autentikasi 401, sementara proses service listening dan seed berhasil.

### Menjalankan data UAT merchant

`SEED_MERCHANT_DEMO=true` dan `DEV_MERCHANT_PASSWORD_HASH` wajib diberikan hanya dari environment lokal/UAT. Hash harus Argon2id yang dibuat oleh tool auth resmi; password/hash tidak boleh ditulis ke source atau log. Script otomatis menolak `NODE_ENV=production` dan `ENVIRONMENT=production`.
