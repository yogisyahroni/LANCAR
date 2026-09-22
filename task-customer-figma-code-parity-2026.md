# Customer App Figma ↔ Code Parity & Flow Execution 2026

**Status:** PARTIAL — FLOW-00 and the authenticated local FLOW-01 Home visual checkpoint are implemented, alongside static FLOW-02 parity, server-backed promo/quick-repeat Home wiring, Figma-aligned Food discovery, Merchant Detail, Checkout, Account, Notification, and Top Up wallet surfaces, Tambal Ban, and Towing surfaces, customer payment handoff, parcel scheduled-pickup contract, dedicated account address route, Account legal-document entry, no-fake location/map states, and roadside/towing route/status wiring; compact-device and remaining edge-flow/provider proof still remain.

**Task ID:** UIUX-2026-008  
**Platform:** `android-app-customer` (Kotlin + Jetpack Compose)  
**Visual source yang diminta user:** [ALL TEMBUS CUSTOMER](https://www.figma.com/design/nKUNTKLwAWj8AlWu74chfF/ALL-TEMBUS-CUSTOMER?node-id=0-1)  
**Branch baseline:** `staging`  
**Repository baseline:** `633b0949735e3170261555f23f00fe146240a98d`

## Tujuan

Menyatukan desain dan flow pada Figma dengan implementasi customer Android yang sudah ada, lalu mengeksekusinya satu flow penuh pada satu waktu. Setiap flow harus dipetakan ke frame Figma, route, screen, state data, dan bukti device sebelum dianggap selesai.

Task ini mengoordinasikan task UI/UX yang sudah ada. Task audit, antislop, standardisasi token, dan flow reliability tetap menjadi sumber evidence yang dipakai ulang; task ini tidak membuat ulang hasil yang sudah terbukti dan tidak mengubah backend hanya demi mengejar tampilan.

## Baseline yang sudah ditemukan

### Figma

- File dapat dibuka dan divisualisasikan pada `Page 1`.
- Frame customer memakai lebar tetap sekitar `390px` dengan tinggi `Hug` yang berbeda-beda. Contoh yang terbaca dari Properties: Customer Home `390 × 1.584`, Food merchant `390 × 1.792`, Food exploration `390 × 1.873`, dan Kirim Paket On-Demand `390 × 1.920`.
- Shell utama yang terlihat: header lokasi, search, saldo TEMBUS-Pay, grid layanan, promo, quick repeat, rekomendasi kuliner, serta bottom navigation `Beranda`, `Aktivitas`, `Pesan`, `Notifikasi`, `Akun`.
- Layanan utama yang terlihat: `Kirim Paket`, `Agregator`, `Food`, `Tambal Ban`, `Towing`, dan `Lainnya`.
- Figma menyediakan screen khusus untuk status/error/trust seperti bantuan, safety warning, detail teknisi/armada, pembayaran, klaim promo, keamanan/PIN, privasi, chat, voice call, rating, tracking, dan share status.
- Sampel visual yang terbaca dari frame memakai surface putih/off-white (`#FFFFFF`, `#F2FCF3`, dan variasi surface food seperti `#F7F8F6`), dengan hijau TEMBUS sebagai primary dan orange sebagai action/high-energy accent. Nilai final tetap harus ditarik dari token, bukan disalin sebagai hardcode per screen.

### Codebase

- `Screen.kt` memiliki 31 route object.
- `RootNavGraph.kt` mendaftarkan 27 `composable` destination.
- Folder screen customer berisi 35 file `*Screen.kt` dan 91 file Kotlin di bawah `ui/screens` jika termasuk helper/view-model terkait.
- Global shell sudah tersedia di `DashboardScreen.kt`, `DashboardHomeComponents.kt`, `TembusControls.kt`, `TembusSurfaces.kt`, dan `TembusBottomNavigation`.
- Flow runtime utama sudah tersedia untuk parcel, food, tambal ban, towing, payment, tracking, history/detail, notification, chat/call, profile, address book, referral, loyalty, dan language.
- Runtime customer tidak lagi menganggap koordinat Jakarta/sample sebagai lokasi aktual: Food meminta lokasi device dan map menampilkan unavailable state jika kontrak koordinat belum tersedia.
- Debug auto-login hanya boleh memakai credential UAT yang diinjeksi dari environment/BuildConfig; tidak ada password UAT yang menjadi source truth di Kotlin.
- Validated customer deep links ditahan saat startup auth masih resolve dan direplay setelah destination authenticated siap, mencakup order detail, tracking, chat, dan booking.
- Tambal Ban search menolak koordinat netral `0,0` pada route langsung/restored dan home menampilkan error backend plus retry, bukan empty-success.
- Parcel pickup schedule memakai lead time server/client yang sama (minimal 30 menit), status paid `scheduled`, dan admin worker yang mengaktifkan order sebelum courier dispatch; schedule food tetap memakai jalur merchant/order-service yang sudah ada.
- Source code masih memiliki perubahan lokal user pada `OrderHistoryScreen.kt` serta artefak screenshot/UI dump yang harus dipertahankan dan tidak boleh di-reset.

## Source-of-truth gate

Repository governance dan `design-tokens/tembus.tokens.json` saat ini menunjuk ke Figma lama `https://www.figma.com/design/9JTlREMJNVkLYchQD1QcpV`, sedangkan permintaan ini menunjuk ke `nKUNTKLwAWj8AlWu74chfF`.

Keputusan source-of-truth untuk task ini:

- `ALL TEMBUS CUSTOMER` adalah visual source terbaru untuk komposisi screen customer;
- Figma lama tetap menjadi stable component-library source karena validator dan catalog reusable component masih mengikat tiga halaman library;
- metadata token/catalog/governance sekarang menyimpan kedua boundary tersebut;
- pertahankan semantic token, accessibility, server-authoritative price/payment/ETA, dan Code Connect policy yang sudah ada;
- jangan menganggap frame Figma sebagai bukti backend/payment/provider sudah benar.

## Urutan flow eksekusi

| Flow | Nama | Frame Figma utama | Implementasi code utama | Dependency |
| --- | --- | --- | --- | --- |
| FLOW-00 | Foundation, token, dan mapping | seluruh file; terutama Customer Home | `design-tokens/`, `ui/theme/`, `ui/designsystem/`, catalog/governance | source-of-truth gate |
| FLOW-01 | Customer Home dan global shell | `TEMBUS - Customer Home` | `DashboardScreen.kt`, `DashboardHomeComponents.kt`, `RootNavGraph.kt`, `Screen.kt` | FLOW-00 |
| FLOW-02 | Aktivitas, riwayat, detail order | `TEMBUS - Aktivitas & Riwayat`, `TEMBUS - Status & E-Resi Pick-up...`, rating | `OrderHistoryScreen.kt`, `OrderDetailScreen.kt`, detail sections, rating | FLOW-01 |
| FLOW-03 | Kirim Paket, pickup, alamat, pilihan armada | `TEMBUS - Kirim Paket On-Demand`, `TEMBUS - Kirim Paket & Pilihan Ekspedisi`, `TEMBUS - Ambil Paket (Pick-up Driver)`, `TEMBUS - Alamat Tersimpan`, `TEMBUS - Verifikasi Kecocokan Armada` | `BookingScreen.kt`, `BookingStepContent.kt`, `BookingComponents.kt`, `BookingModalSheets.kt`, `BookingViewModel.kt`, `BookingAddressPoint.kt`, `AddressBookScreen.kt` | FLOW-00, FLOW-01 |
| FLOW-04 | Food discovery sampai checkout | `TEMBUS Food - Eksplorasi Kuliner & ...`, `TEMBUS Food - Soto Betawi H. Mamat`, `TEMBUS Food - Checkout Pesanan`, `TEMBUS - Beri Penilaian & Ulasan` | `FoodHomeScreen.kt`, `MerchantDetailScreen.kt`, `FoodCartScreen.kt`, `FoodCheckoutScreen.kt`, `FoodFavoritesScreen.kt`, rating | FLOW-01 |
| FLOW-05 | Payment, wallet, promo, confirmation | `TEMBUS - Metode Pembayaran & ...`, `TEMBUS - Top Up Saldo TEMBUS-Pay`, `TEMBUS - Detail & Klaim Promo`, `TEMBUS - Konfirmasi Pesanan & Pembayaran` | `PaymentScreen.kt`, `PaymentViewModel.kt`, profile wallet/withdraw, promo entry, order confirmation | FLOW-03 atau FLOW-04 |
| FLOW-06 | Tambal Ban / teknisi siaga | `TEMBUS - Layanan Darurat Tambal Ban`, `TEMBUS - Mencari Teknisi Siaga`, `TEMBUS - Pilih Penawaran Montir Siaga`, `Profil & Sertifikasi Montir Siaga`, `TEMBUS - Verifikasi Kecocokan Armada` | `TambalBanHomeScreen.kt`, `TambalBanSearchScreen.kt`, `NearbyCouriersScreen.kt`, `CourierDetailScreen.kt`, `ServiceBookingScreen.kt`, `ServiceTrackingScreen.kt`, `ServiceReportScreen.kt` | FLOW-00, FLOW-01, FLOW-05 |
| FLOW-07 | Derek/Towing darurat | `TEMBUS - Derek Towing Darurat`, `TEMBUS - Konfirmasi & Kunci Derek`, `TEMBUS - Konfirmasi Derek & Kontak`, `Detail Armada & Sertifikasi Derek`, `TEMBUS - Pilih Penawaran Petugas`, `Profil Petugas Derek`, `TEMBUS - Pelacakan Derek Towing`, `TEMBUS - Bagikan Status & Posisi` | `ServiceCategoryScreen.kt`, `SubTypeSelectorScreen.kt`, `ServiceBookingScreen.kt`, `ServiceTrackingScreen.kt`, `ServiceReportScreen.kt` | FLOW-05, FLOW-06 patterns |
| FLOW-08 | Tracking, chat, voice, support, notification | `TEMBUS - Pesan & Obrolan`, `TEMBUS - Obrolan Kurir`, `TEMBUS - Panggilan Suara Kurir`, `TEMBUS - Pusat Bantuan`, `TEMBUS - Notifikasi`, `TEMBUS - Bagikan Status & Posisi` | `TrackingScreen.kt`, `ChatScreen.kt`, `InAppCallScreen.kt`, `BusinessScreen.kt`, `NotificationCenterScreen.kt`, deep-link policy | FLOW-02, FLOW-06, FLOW-07 |
| FLOW-09 | Akun, alamat, keamanan, privacy, retention | `TEMBUS - Akun Pengguna`, `TEMBUS - Alamat Tersimpan`, `TEMBUS - Keamanan & PIN Transaksi`, `Privasi & Ketentuan Layanan`, `TEMBUS - Profil Bisnis & E-Faktur`, `TEMBUS - Detail & Klaim Promo` | `ProfileScreen.kt`, `AddressBookScreen.kt`, `LanguageScreen.kt`, `ReferralScreen.kt`, `LoyaltyScreen.kt`, `WithdrawDialog.kt`, business | FLOW-01, FLOW-05, FLOW-08 |

## Detail task per flow

### FLOW-00 — Foundation, token, dan mapping

- [x] Reconcile Figma file baru dengan `docs/design/tembus-figma-governance-2026.md`, `docs/design/tembus-component-catalog-2026.json`, dan `design-tokens/tembus.tokens.json`.
- [x] Buat inventory frame-to-route-to-code untuk frame customer yang dipakai pada baseline, termasuk source/page reference; node-level URL ditambahkan saat frame flow dieksekusi.
- [x] Tetapkan semantic tokens untuk layout, surface, typography, radius, state, motion, dan minimum touch target; tidak menambah palette screen-specific.
- [x] Mapping komponen Figma ke primitive existing (`TembusButton`, `TembusIconButton`, `TembusTextField`, `TembusSearchField`, `TembusCard`, navigation, status, merchant/service cards).
- [x] Catat states wajib: default, pressed/selected, disabled, loading, empty, error, offline/stale, success, cancelled, dan permission denied.
- [ ] Exit gate: source of truth disepakati, mapping tidak duplikatif, dan validator design/token tetap dijalankan tanpa menghapus guard.

### FLOW-01 — Customer Home dan global shell

- [x] Samakan hierarchy Customer Home: lokasi, search, wallet, active order, grid service, promo, repeat, food recommendation, dan bottom nav melalui existing shell dan handoff spec.
- [x] Authenticated local emulator checkpoint now visually follows the attached Figma composition and uses live local location, wallet, order, and merchant data; final screenshot/AX artifacts are recorded in `docs/task-evidence/UIUX-2026-008.md`.
- [x] Resolusi produk: tile utama memakai label `Agregator` dan route `aggregator`; `Ambil Paket` tetap menjadi secondary entry melalui universal search/banner, bukan dihapus dari route model.
- [x] Sinkronkan bottom nav Figma `Beranda/Aktivitas/Pesan/Notifikasi/Akun` dengan route code `dashboard/history/business/notifications/profile`.
- [ ] Pastikan active tab, cold start, deep link, process recreation, loading/error/offline, dan notification badge konsisten.
- [ ] Exit gate: screenshot emulator 390dp dan compact/common width, AX labels, route transitions, dan no fake business data.

### FLOW-02 — Aktivitas, riwayat, detail order

- [x] Implementasikan tab/status hierarchy dari Figma ke history tanpa mengubah status order server.
- [x] Satukan visual order card, status copy, service identity, e-resi/order number, reorder, detail actions, dan service-specific detail sections pada existing history/detail surfaces.
- [x] Pastikan package, food, tambal ban, dan towing memakai status vocabulary masing-masing tanpa bocor antar-service.
- [x] Detail mempertahankan `order_number`, service category, dan scheduled pickup dari tracking read model; `pending_payment` dapat melanjutkan pembayaran dan status terminal dapat membuka proof/rating tracking.
- [x] Authenticated local Activity checkpoint now follows the Figma composition: shared Home shell, Indonesian title/filter hierarchy, server-backed active order card, honest tracking-map availability, persistent bottom navigation, history section, and canonical tracking CTA.
- [ ] Exit gate: history normal/empty/error/offline, detail active/completed/cancelled, rating, proof, dan back-stack.

### FLOW-03 — Kirim Paket, pickup, alamat, pilihan armada

- [ ] Ubah Booking menjadi urutan visual yang sesuai Figma: pickup/dropoff, contact, package detail, protection/photo, armada/ekspedisi, pickup time, payment summary, dan final CTA.
- [ ] Reuse address book dan route snapshot server; UI tidak menghitung atau mengarang harga/ETA.
- [ ] Selaraskan `Kirim Paket` dengan `Ambil Paket`/pickup dan aggregator sesuai keputusan FLOW-01.
- [x] Pickup time parcel sudah mempunyai kontrak nyata: `schedule_type/scheduled_at` dinormalisasi, pembayaran tidak langsung dispatch, worker mengaktifkan order due, dan cancel sebelum aktivasi tetap tersedia.
- [x] Parcel review sekarang menampilkan komponen quote server yang tersedia, termasuk tarif dasar, volumetrik, perlindungan, biaya dinamis, platform, tol, dan total; premi protection tidak lagi hanya dilabeli sebagai opsi tanpa nominal.
- [x] Draft booking parcel menyimpan input customer yang aman dipulihkan melalui `SavedStateHandle`; quote/price breakdown tidak dipersist dan selalu dihitung ulang dari server setelah recreation.
- [ ] Exit gate: validasi field lokal, preserve input, location denial, route failure, unavailable service, duplicate CTA, dan resume setelah process death.

### FLOW-04 — Food discovery sampai checkout

- [ ] Samakan food home dengan Figma: search/location, promo/voucher, category, merchant card, availability, ETA/distance, menu, cart bar, dan recommended list.
- [ ] Samakan merchant detail, option/variant, stock/unavailable item, notes, cart, checkout, payment handoff, dan rating.
- [x] Checkout food sekarang masuk ke `PaymentScreen` terlebih dahulu; order backend tetap `pending_payment` sampai payment service mengonfirmasi sebelum customer masuk tracking/merchant dispatch.
- [x] Merchant/menu availability mengikuti operating state, pause/enforcement, schedule, inventory, dan daily limit; backend quote/create menolak stale/unavailable item secara server-authoritative.
- [x] Quote food menampilkan breakdown fee/minimum order/expiry dan customer tidak dapat submit quote yang kedaluwarsa; requote/item-unavailable/minimum-order errors mempertahankan jalur recovery.
- [x] Food discovery runtime sekarang mengikuti hierarchy Figma: location/search shell, category rail, filter chips, nearby merchant rail, server-derived availability/rating/distance facts, trust surface, dan nearby merchant list; media kosong tetap honest placeholder.
- [x] Top Up wallet runtime sekarang mengikuti frame Figma: green wallet hero, nominal grid, payment-provider disclosure, server-backed balance/error state, session summary, dan sticky payment CTA.
- [x] Gateway payment/wallet proxy mempertahankan path `/api/v1/...` saat meneruskan ke payment-service; regression 404 akibat Express mounted-proxy path stripping sudah diperbaiki tanpa mengubah sumber saldo/payment di client.
- [ ] Pertahankan disclosure sponsor/promo dan jangan membuat merchant/menu palsu saat API gagal.
- [ ] Exit gate: location denied, merchant closed, item unavailable, price change, minimum order, empty/error/loading, duplicate checkout.

### FLOW-05 — Payment, wallet, promo, confirmation

- [ ] Petakan frame payment Figma ke `PaymentScreen`, payment method, wallet/top-up, promo detail/claim, expiry, pending, success, failed, dan retry.
- [ ] Audit gap karena route top-up/PIN/privacy tidak seluruhnya terlihat sebagai destination terpisah di `Screen.kt`.
- [x] Tambah route customer `wallet-topup`, profile-backed balance, nominal top-up tervalidasi, dan server-provided `invoice_url`; mobile tidak membentuk URL provider dari token.
- [x] Daftarkan route `Payment` yang sebelumnya dipakai oleh parcel tetapi belum ada di `RootNavGraph`; payment success diarahkan ke tracking parcel/food atau tracking roadside sesuai service subtype.
- [x] Server-side top-up retry memakai UUID key yang diteruskan dari client, reference provider deterministik, replay session yang tersimpan, dan unique index migration; provider callback/replay real tetap harus dibuktikan pada environment payment yang berwenang.
- [x] Error/expired payment recovery melakukan resync ke status server; response non-paid tanpa redirect URL tetap menjadi error recoverable dan tidak membuka WebView kosong.
- [ ] Total dan status tetap server-authoritative; UI tidak boleh mengubah status paid atau membuat reference ID.
- [ ] Exit gate: payment method, fee breakdown, balance, idempotent submit, pending/expired/failed/success, resume, dan evidence keterbatasan provider eksternal.

### FLOW-06 — Tambal Ban / teknisi siaga

- [ ] Samakan emergency-first flow: safety notice, location, vehicle, issue, photo, estimate/quote, technician search, offer, detail certification, booking, tracking, proof/report.
- [ ] Pastikan bahasa darurat tidak memakai vocabulary parcel dan tidak menampilkan promo yang mengganggu aksi kritis.
- [ ] Gunakan status matching yang jujur: searching, unavailable, timeout, assigned, arriving, arrived, in-service, completed, cancelled.
- [x] Daftarkan `ServiceTracking` dan `ServiceReport` ke root navigation, sambungkan chat/call/report, serta mapping status tambal ban ke lifecycle customer yang bounded.
- [x] Selaraskan customer Retrofit, API gateway, dan order-service untuk read-only report tambal ban berbasis `order_id` dengan ownership customer.
- [x] Tracking roadside membaca snapshot order canonical secara langsung; kegagalan refresh mempertahankan snapshot terakhir dengan label stale/offline dan status no-technician tetap eksplisit.
- [x] Jalur status terminal membuka Order Detail agar bukti, penyesuaian harga, pembatalan, bantuan, klaim, dan rating memakai surface/contract existing yang sama.
- [ ] Exit gate: permission denied, stale/offline, no technician, price adjustment, cancel, proof, rating, dan support.

### FLOW-07 — Derek/Towing darurat

- [ ] Pisahkan vocabulary dan trust surface towing dari tambal ban: tipe kendaraan, lokasi, kondisi, armada, sertifikasi, estimasi, quote, kontak, safety, dan damage/proof.
- [ ] Selaraskan jalur `ServiceCategory → SubTypeSelector → ServiceBooking` dengan depth dan screen grouping Figma; gabungkan step hanya jika kontrak/state tetap aman.
- [ ] Implementasikan tracking towing, share status/position, chat/call/support, completion report, dan aftercare yang sudah tersedia di code.
- [x] Booking towing mengikuti payment handoff yang sama sebelum tracking; tracking/report route terdaftar dan mapping lifecycle towing mencakup matching, arriving, inspection, loading, transit, unloading, completed, cancelled, dan failed.
- [x] Tambahkan read-only towing report route di order-service dan gateway dengan ownership validation agar `ServiceReportScreen` tidak memanggil endpoint fiktif.
- [x] Towing report dan runtime map mempertahankan state missing-proof/location-unavailable secara jujur; tidak mengganti data kosong dengan copy atau koordinat sample.
- [x] Towing terminal flow kini memakai Order Detail yang memasang roadside aftercare untuk klaim, rating, report final, dan payment adjustment; selector kendaraan tidak lagi menampilkan harga statis sebelum quote server.
- [ ] Exit gate: vehicle mismatch, no armada, quote pending, cancellation, tracking stale/offline, damage report, insurance handoff, completion.

### FLOW-08 — Tracking, chat, voice, support, notification

- [ ] Jadikan tracking card/status/ETA/action panel sebagai surface utama di atas map, bukan map kosong.
- [ ] Selaraskan chat kurir, voice call, notification center, Pusat Bantuan, quick contact, SOS/support, dan share status.
- [ ] Pastikan deep link order/chat/tracking membuka konten yang tepat dan unauthorized/expired IDs gagal secara aman.
- [x] Tab `Pesan` sekarang memakai route inbox order-scoped yang mengambil order customer dari history dan membuka chat bridge canonical; route `Business` lama tetap dipertahankan untuk fitur bisnis.
- [x] Deep link dan notification kategori `support` sekarang membuka destination `SupportScreen`; tidak ada lagi handler support yang berhenti sebagai no-op.
- [x] Safety Center sekarang memakai kontrak safety-share customer: customer dapat membuat, membagikan, dan mencabut link status order; payload publik dibatasi ke data minimum dan tidak mengklaim live position.
- [x] Notification center runtime sekarang memakai persistent Figma bottom-navigation shell dengan tab kategori, unread/read/archive action, order-scoped deep-link action, serta state loading/empty/error yang tetap jujur.
- [ ] Exit gate: live, stale/offline, reconnect, notification entry, call interruption, chat empty/error, and accessibility semantics.

### FLOW-09 — Akun, alamat, keamanan, privacy, retention

- [ ] Samakan Account Home, business profile/e-faktur, saved addresses, language, loyalty, referral, wallet/withdraw, security/PIN, privacy, terms, dan logout.
- [ ] Audit screen Figma yang belum punya route dedicated di code; gunakan dialog/sheet hanya jika state/back behavior tetap jelas.
- [ ] Pastikan destructive/security action memakai confirmation, auth/session policy, dan copy satu locale.
- [x] Entry wallet top-up dari Account/Profile sudah tersambung ke route secure dan memakai identity/session yang sama dengan profile serta payment service.
- [x] Security surface sekarang membedakan PIN akun/transaksi server (`POST /api/v1/customer/security/pin`) dari PIN/biometrik perangkat lokal; customer dapat mengubah PIN akun dengan validasi 6 digit dan konfirmasi sebelum dikirim.
- [x] Account shell sekarang mengikuti hierarchy Figma: identity compact, wallet TEMBUS-Pay hijau, menu akun/security terkelompok, dan persistent bottom navigation dengan `Akun` aktif.
- [ ] Exit gate: empty/error/loading, long name/address, locale ID/EN, font scale, logout/session expiry, and safe account deletion/privacy entry.

## Aturan implementasi

1. Kerjakan satu FLOW-ID sampai verification gate-nya lulus sebelum maju ke flow berikutnya.
2. Reuse existing bounded ownership dan design-system primitives; jangan membuat service, token, route, atau source of truth kedua hanya karena Figma punya nama berbeda.
3. Figma mengatur visual intent, bukan harga, payment state, ETA, eligibility, availability, ranking, risk, atau provider success.
4. Semua flow wajib punya loading, empty, error, offline/stale, disabled, dan success/cancelled state yang jujur.
5. Perubahan backend/contract hanya dilakukan jika audit membuktikan contract yang ada tidak memungkinkan UX Figma yang benar; perubahan tersebut menjadi subtask terpisah.
6. Perubahan lokal user pada `OrderHistoryScreen.kt` dan artefak UAT tidak boleh dihapus atau di-reset.

## Verification plan

Per flow, jalankan hanya verifikasi yang relevan dan catat hasil aktual:

```powershell
Push-Location android-app-customer
.\gradlew.bat :app:testDebugUnitTest
.\gradlew.bat :app:assembleDebug
Pop-Location
node scripts/design/validate-tembus-design-tokens.mjs
node scripts/design/validate-tembus-component-adoption.mjs
```

Untuk flow yang mengubah route/component catalog, jalankan juga validator Figma traceability setelah metadata Figma sudah direkonsiliasi. Device proof wajib mencakup screenshot/AX state pada emulator, bukan hanya compile success. Evidence final per TASK-ID harus mengikuti `docs/task-evidence/README.md` dan divalidasi dengan `python scripts/tasks/validate_task_evidence.py`.

## Remaining requirements sebelum eksekusi

- [x] Konfirmasi file `nKUNTKLwAWj8AlWu74chfF` sebagai Figma source of truth terbaru untuk customer screens.
- [x] Putuskan label/route `Agregator` versus `Ambil Paket` pada Customer Home.
- [ ] Tambahkan node-level Figma links saat setiap frame flow mulai dieksekusi.
- [x] Finalisasi prioritas: FLOW-01 dikerjakan setelah mapping, lalu lanjut ke FLOW-02 setelah verification gate.

## Status evidence

- **Implementation:** PARTIAL — metadata handoff, Customer Home shell/service-grid parity, profile-backed wallet, Figma-aligned Activity shell/active tracking snapshot/history surface, Figma-aligned Top Up wallet surface, payment handoff, idempotent wallet top-up session, Pesan inbox, dedicated address-book route, Account legal-document route backed by approved market config, Business route, honest Food/map location gating, injected-only UAT login, startup-safe deep-link replay, Tambal Ban neutral-coordinate/error handling, roadside/towing tracking/report navigation and bounded vocabulary, serta customer↔gateway↔order-service report paths sudah diubah; initial emulator login/register/deep-link and authenticated wallet endpoint proof is recorded, while authenticated cross-app, provider callback, and flow-local edge proof remain open.
- **Figma inspection:** PASS — file terbuka, frame/layer dan Properties terbaca melalui browser.
- **Codebase inspection:** PASS — route, destination, screen inventory, existing design system, task overlap, dan local worktree state sudah diperiksa.
- **Visual parity:** PARTIAL — authenticated local Home and Activity screenshots/accessibility trees now prove the shared Figma shell and Activity hierarchy; the complete authenticated 390dp/compact flow matrix is not yet run.
- **Device/E2E:** PARTIAL — APK install, launch, authenticated Home/Activity screenshot+AX, Activity scroll, active `Lacak Pesanan` transition into tracking, login/register surfaces, and supported unauthenticated order-tracking deep-link safety passed; authenticated cross-app/provider scenarios remain open.
- **Known blockers:** Authenticated staging/provider callback proof is unavailable in the current environment; customer account deletion has no backend contract and is not invented as a client-only destructive action.
