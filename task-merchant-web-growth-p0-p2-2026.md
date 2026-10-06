# Merchant Web — P0–P2 Growth, Trust & Operational Readiness

Status: Ready for scoped execution — PRD v1.1; implementation and production readiness remain incomplete
Created: 2026-10-03
Baseline: `staging`
Target: `merchant-web` pada `https://merchant.bawain.my.id/`
Audience: perusahaan/PT dan merchant bisnis; pendaftaran perorangan diarahkan ke Merchant Android
Product requirements: [`docs/product/merchant-portal-prd-2026.md`](docs/product/merchant-portal-prd-2026.md)

## Urutan eksekusi yang disepakati — 2026-10-05

Atas keputusan pemilik produk, implementasi capability end-to-end didahulukan
lintas Customer, Merchant Web/Android, Courier, Admin, service, database, dan
event contract. Staging smoke test, device/UAT, reconnect/replay, security,
accessibility, observability, rollback, dan production release gate tetap wajib
dikerjakan, tetapi dicatat sebagai verifikasi tertunda sampai seluruh scope
fitur portal selesai.

Verifikasi tertunda bukan status lulus dan bukan indikasi production-ready.
Setiap evidence harus mempertahankan status `NOT_RUN`, `PARTIAL`, atau
`DEFERRED` yang jujur; tidak boleh mengubah proof yang belum dijalankan menjadi
PASS. Setelah seluruh capability selesai, queue verifikasi harus dijalankan
secara berurutan dan seluruh kegagalan diperbaiki sebelum readiness diputuskan.

## Tujuan

Membawa website Merchant TEMBUS dari landing page yang sudah rapi menjadi kanal akuisisi bisnis yang meyakinkan, jelas alurnya, dapat diverifikasi, dan konsisten dengan portal Merchant yang sudah berjalan.

Benchmark digunakan untuk pola kemampuan dan ekspektasi merchant, bukan untuk menyalin UI proprietary. GoFood Merchant menonjolkan pendaftaran perusahaan, persyaratan, verifikasi, dan tahapan onboarding. GrabMerchant menonjolkan ekosistem aplikasi, portal, staf, multi-outlet, katalog, laporan, promosi, dan pusat bantuan.

## Batasan wajib

- Web ini adalah jalur utama untuk PT/badan usaha/merchant bisnis.
- Merchant perorangan tidak dibuatkan jalur onboarding baru di web; CTA-nya diarahkan ke aplikasi Merchant Android.
- Tidak boleh memakai angka merchant, logo partner, testimonial, SLA, biaya, cakupan area, atau klaim performa yang belum terbukti.
- Tidak boleh memakai gambar acak dari internet. Gunakan aset milik TEMBUS, foto berizin, atau aset generatif yang dibuat khusus.
- Semua status pendaftaran, verifikasi, dokumen, dan CTA portal harus memakai API/database atau state yang benar-benar tersedia.
- Perubahan implementasi mengikuti branch `staging`, dibuild ulang Docker lokal bila web dijalankan melalui Docker, lalu diverifikasi sebelum push staging.

## Urutan dependensi

`P0-001 audience & funnel` → `P0-002 trust/legal` → `P0-003 onboarding readiness` → `P0-004 support/status` → `MWEB-P0-006 status contract` + `MWEB-P0-007 web auth` + `MWEB-P0-009 status security` → `MWEB-P0-008 full E2E` → `MWEB-P0-010 production release gate` → `P1 product proof/content` → `P1 visual/performance` → `P2 growth ecosystem`.

## Keputusan readiness saat ini — 2026-10-04

**Status: NOT READY untuk public production.** Portal Mitra sudah memiliki jalur inti Web → API Gateway → database → Admin → database → status Web, tetapi belum boleh dipakai terbuka oleh merchant bisnis sebelum task P0 tambahan di bawah selesai dan dibuktikan dengan evidence.

Batas penggunaan saat ini:

- boleh untuk development, staging, dan closed UAT dengan akun test terisolasi;
- belum boleh menjadi kanal onboarding merchant umum atau dijadikan dasar klaim bahwa portal sudah production-ready;
- link approved harus kembali ke Merchant Web (`/masuk`), bukan mengarahkan user ke aplikasi Android.

Dasar keputusan yang perlu ditutup:

- halaman status hanya memetakan `pending`, `approved`, dan `rejected`, sementara database memiliki lifecycle `DRAFT`, `SUBMITTED`, `VERIFYING`, `ACTIVE`, `REJECTED`, dan `SUSPENDED`;
- alur Web belum memiliki continuation UI ketika registrasi/login memerlukan OTP; implementasi saat ini menganggap tidak adanya `access_token` sebagai kegagalan;
- access token dan refresh token Portal Mitra masih disimpan di `localStorage`, sehingga perlu security review dan hardening sesi browser;
- full flow disposable account dari daftar sampai approval/rejection/suspend dan cek status ulang belum dibuktikan sebagai browser E2E;
- data lokal saat ini memiliki onboarding profile dan dokumen, tetapi riwayat `merchant_onboarding_reviews` belum berisi data untuk merchant lama.

---

## P0 — Blocker tambahan sebelum Portal Mitra public production

### MWEB-P0-006 — Canonical onboarding status contract dan handoff portal

**Tujuan:** status yang dilihat calon merchant, Admin, database, dan Portal Mitra selalu memakai lifecycle yang sama.

**Ruang lingkup:**

- Ubah endpoint status publik agar mengembalikan `onboarding_status` canonical, `verification_status` legacy hanya sebagai compatibility field, nama toko, waktu submit/update, alasan penolakan/suspend yang aman, dan next action.
- Map seluruh state `DRAFT`, `SUBMITTED`, `VERIFYING`, `ACTIVE`, `REJECTED`, `SUSPENDED`, `no_merchant`, dan `not_found` ke state UI yang jelas.
- Status `ACTIVE`/approved mengarahkan ke `/masuk` Merchant Web; jangan lagi mengarahkan ke aplikasi Android.
- Status `REJECTED` menyediakan jalur perbaikan/resubmit; `SUSPENDED` menampilkan instruksi bantuan, bukan “sedang diproses”.
- Pastikan halaman login dan route protected memakai lifecycle canonical yang sama dengan halaman status.

**Acceptance criteria:**

- Setiap state database punya response contract, label UI, warna/icon, copy, dan aksi yang teruji.
- `no_merchant` selalu terlihat oleh user dan tidak hilang karena lookup status UI tidak punya metadata.
- Perubahan Admin dari `SUBMITTED`/`VERIFYING`/`ACTIVE`/`REJECTED`/`SUSPENDED` tercermin di Portal Mitra setelah refresh sesuai aturan konsistensi baca.
- Tidak ada teks internal seperti backend, service, atau nama tabel pada UI publik.

### MWEB-P0-007 — Production-grade web authentication, OTP continuation, dan session hardening

**Tujuan:** pendaftaran dan login Portal Mitra tetap berjalan ketika kontrol keamanan production diaktifkan.

**Ruang lingkup:**

- Buat continuation flow OTP untuk registrasi baru dan login perangkat baru; jangan menganggap response tanpa `access_token` sebagai error generik.
- Pastikan `customer_auth_otp_required`/provider OTP yang aktif di production tidak memutus onboarding merchant Web.
- Validasi role, ownership merchant, session expiry, refresh rotation, logout, multi-tab, dan device binding.
- Gunakan namespace sesi web merchant yang terisolasi dari customer web/API: `merchant_session` secure HttpOnly SameSite cookie dengan refresh rotation; staff tetap melewati validasi tenant/outlet/capability dan device session.
- Tambahkan copy/error state untuk OTP expired, rate limit, provider unavailable, session expired, dan akun belum memiliki toko.

**Acceptance criteria:**

- Dengan OTP flag aktif, registrasi → verifikasi OTP → submit merchant berhasil.
- Login pertama/perangkat baru dapat menyelesaikan OTP lalu membuka dashboard; login trusted device tetap terkontrol.
- Token tidak lagi tersedia sebagai credential persisten di `localStorage`.
- Logout, refresh, expired session, dan revoke session terverifikasi lewat browser E2E.
- Tidak ada akun customer biasa yang dapat membuka data merchant milik akun lain.

### MWEB-P0-008 — Disposable-account full E2E onboarding proof

**Tujuan:** membuktikan Admin → DB → Merchant Web benar-benar bekerja, bukan hanya tersambung secara kode.

**Skenario wajib:**

- daftar perusahaan dari Merchant Web;
- upload KTP, foto tempat usaha, rekening, dan NIB;
- verifikasi bahwa row masuk ke `merchants`, `merchant_documents`, `merchant_legal_profiles`, dan `merchant_onboarding_reviews`;
- Admin memulai verifikasi lalu approve; Portal status berubah menjadi aktif dan login membuka dashboard;
- Admin reject dengan alasan; Portal menampilkan alasan dan jalur perbaikan;
- resubmit lalu approve;
- suspend merchant aktif; Portal menampilkan status suspend dan tidak memberi akses operasional aktif.

**Acceptance criteria:**

- Skenario memakai akun dan dokumen test disposable, bukan data merchant nyata.
- Setiap transition diverifikasi di database dan response API, bukan hanya screenshot UI.
- Browser E2E mencakup loading, retry, error, refresh, dan read-after-write.
- Evidence mencatat commit, image Docker, migration state, API response yang sudah disanitasi, dan database invariant tanpa PII/credential.

### MWEB-P0-009 — Public status lookup security dan consistency

**Tujuan:** halaman cek status aman untuk publik dan tidak menampilkan status yang salah atau bocor.

**Ruang lingkup:**

- Jika email dan nomor HP dikirim bersamaan, keduanya harus cocok pada akun yang sama; jangan memakai pencocokan `OR` yang dapat mengambil akun berbeda.
- Pertahankan rate limit, generic not-found response, audit/metric request, dan redaksi PII.
- Tentukan strategi read-after-write setelah Admin transition: primary read, bounded retry, atau version/timestamp contract yang jelas.
- Pastikan alasan penolakan/suspend hanya tampil setelah identity lookup memenuhi kebijakan yang disetujui.

**Acceptance criteria:**

- Test mismatch email/phone tidak mengembalikan status akun lain.
- Test enumeration/rate limit dan generic error lulus.
- Status setelah transition Admin memiliki batas stale yang terdokumentasi dan diuji.
- Public endpoint tidak pernah mengembalikan token, dokumen URL privat, rekening, atau data internal.

### MWEB-P0-010 — Portal Mitra production release gate

**Tujuan:** memastikan portal yang dipromosikan benar-benar memakai konfigurasi production dan memiliki baseline operasional.

**Ruang lingkup:**

- Build web gagal tertutup bila `VITE_API_URL` masih localhost atau domain staging yang salah.
- Tetapkan domain API resmi per environment secara eksplisit; jangan mengandalkan default `http://localhost:8080/api/v1`.
- Tambahkan security headers Nginx/CDN yang relevan: HSTS, CSP, frame protection, nosniff, referrer policy, dan permissions policy setelah diuji terhadap asset yang sah.
- Jalankan dependency/security scan untuk merchant-web image dan lockfile.
- Sediakan health check, error monitoring, rollback image, migration compatibility, support escalation, dan release checklist.
- Verifikasi public domain, API origin, CORS, TLS, cache asset, dan route fallback `/masuk`, `/daftar`, `/status`, `/dashboard`.

**Acceptance criteria:**

- Build staging/production tidak mungkin menghasilkan bundle yang memanggil localhost.
- CI lulus build, lint, typecheck, security/container scan, browser E2E, accessibility, dan Docker smoke test.
- Rollback ke image sebelumnya teruji tanpa merusak data onboarding.
- Public production readiness sign-off memiliki evidence terpisah dari health check tunnel lokal.

### MWEB-P0-011 — Tarif merchant food dan dua jalur onboarding

**Tujuan:** bisnis/PT dapat mengelola kebijakan komisi secara terkontrol di Admin dan
merchant perorangan dapat mendaftar lewat Merchant Android lalu memantau hasilnya
melalui Portal Mitra.

**Ruang lingkup:**

- Jadikan tarif food merchant server-authoritative: standar 15% dan program merchant
  baru 5% selama 90 hari atau 100 pesanan makanan selesai, mana yang lebih dulu.
- Simpan kontrak bertanggal, versi, metadata program, dan snapshot komersial order;
  tarif tidak boleh dihitung ulang dari frontend atau mengubah order lama.
- Sediakan pengaturan Admin untuk membuat draft, approval maker-checker/TOTP, dan
  retire kontrak; Portal Merchant menampilkan tarif aktif dan progres program dari API.
- Merchant Android menyediakan pendaftaran **perorangan saja** dengan dokumen dan
  persetujuan legal yang tercatat; pendaftaran PT/badan usaha tetap melalui Portal
  Mitra web. Setelah submit tampilkan CTA ke
  `https://merchant.bawain.my.id/status` menggunakan identitas yang sama.
- Login Merchant Android menjelaskan bahwa pendaftaran perorangan dilakukan dari
  profil aplikasi, tanpa membuat jalur web perorangan yang berbeda.

**Acceptance criteria:**

- Kontrak komisi aktif dipakai oleh snapshot order food baru dan tarif intro berhenti
  ketika batas waktu atau batas pesanan tercapai.
- Finance Merchant Web menampilkan tarif aktif, tarif standar, dasar perhitungan,
  dan potongan komisi dari statement server.
- Admin UI tidak dapat mengubah kontrak aktif tanpa role, TOTP, idempotency key,
  approval reference, dan audit path.
- Merchant Android dapat dikompilasi/diluncurkan, menampilkan jalur pendaftaran
  perorangan yang jelas, meminta persetujuan Perjanjian Mitra dan Kebijakan Privasi
  dari policy server, serta menyediakan link status publik setelah submit; status
  tetap berasal dari Admin → database → endpoint status, bukan status buatan aplikasi.

### MWEB-P0-012 — Pendaftaran merchant perorangan end-to-end di aplikasi

**Tujuan:** pemilik usaha perorangan dapat memulai pendaftaran dari aplikasi
Merchant tanpa tersesat ke jalur PT, dengan legal consent yang versioned dan
status yang dapat dilacak melalui Portal Mitra.

**Ruang lingkup:**

- Tampilkan CTA `Daftar sebagai merchant` di layar login. CTA membuka alur
  pembuatan akun TEMBUS publik, meminta nama, email, nomor handphone, password,
  dan konfirmasi password, lalu mengirim OTP ke email. Setelah OTP terverifikasi,
  sesi dibuat dan user diarahkan melalui onboarding bila diperlukan sebelum
  masuk ke form pengajuan merchant perorangan. Login tetap khusus untuk akun
  yang sudah ada. Untuk tunnel/local UAT, OTP registrasi dapat dinonaktifkan
  melalui flag `customer_registration_otp_required`; default production tetap
  wajib dan flag `customer_auth_otp_required` tetap menjadi gerbang keamanan
  autentikasi customer.
- Hilangkan pemilih `perusahaan` dari form mobile. Backend menegakkan kanal
  Android sebagai `business_type=perorangan`, sedangkan Portal Mitra tetap menjadi
  jalur perusahaan/PT.
- Sebelum submit, ambil requirement legal aktif dari policy server dan catat
  persetujuan append-only untuk `merchant_terms` dan `merchant_privacy_notice`
  memakai versi yang dikembalikan server, bukan versi hardcode di aplikasi.
- Wajibkan data toko, lokasi, KTP, foto tempat usaha, rekening, dan checkbox
  persetujuan. Setelah submit, tampilkan hasil `SUBMITTED` dan link status publik.

**Acceptance criteria:**

- CTA daftar terlihat di login dan tidak membuat request pendaftaran sebelum akun
  TEMBUS berhasil masuk.
- Payload perusahaan dari kanal Android ditolak server; payload portal perusahaan
  tidak berubah.
- Submit hanya dapat dilanjutkan setelah dua consent legal tercatat dan semua
  dokumen inti tersedia.
- Pendaftaran berhasil masuk ke lifecycle merchant yang sudah ada dan halaman
  sukses mengarahkan pengguna ke `/status`.

---

## P1 — Kelengkapan operasional setelah blocker P0 selesai

### MWEB-P1-006 — Historical onboarding audit baseline

**Tujuan:** merchant lama tidak tampak seolah-olah kehilangan histori hanya karena dibuat sebelum lifecycle audit tersedia.

**Ruang lingkup:**

- Audit merchant lama yang sudah memiliki legal profile/dokumen tetapi belum memiliki `merchant_onboarding_reviews`.
- Buat baseline event yang ditandai sebagai `legacy_import` hanya bila sumber dan waktunya dapat dibuktikan; jangan membuat histori approval palsu.
- Tampilkan empty state yang jujur jika histori memang tidak tersedia.

**Acceptance criteria:**

- Tidak ada review/audit fiktif.
- Admin dapat membedakan histori native dan baseline legacy.
- Data lama tetap dapat di-review, suspend, atau re-verify melalui lifecycle canonical.

---

## P0 — Wajib sebelum web dipakai untuk akuisisi perusahaan

### MWEB-P0-001 — Pisahkan jalur perusahaan dan perorangan

**Tujuan:** pengunjung langsung memahami jalur yang sesuai dengan bentuk usahanya.

**Ruang lingkup:**

- Ubah hero dan CTA utama menjadi `Daftar sebagai perusahaan`.
- Tambahkan CTA sekunder `Daftar sebagai perorangan lewat aplikasi`.
- Tambahkan jalur `Sudah punya akun? Masuk portal`.
- Pertahankan `Cek status pendaftaran` sebagai jalur mandiri.
- Jelaskan secara singkat perbedaan data yang dibutuhkan untuk perusahaan dan perorangan.
- Pastikan semua CTA memiliki route/URL nyata dan tidak mengarah ke placeholder.

**Acceptance criteria:**

- Pengguna baru dapat memilih jalur perusahaan atau perorangan tanpa membaca FAQ.
- CTA perusahaan membuka flow pendaftaran perusahaan yang benar.
- CTA perorangan membuka tautan aplikasi resmi atau instruksi instalasi yang valid.
- Login portal dan cek status dapat dijangkau dari header, hero, dan footer.
- Layout tetap aman pada lebar 320–1440px dan keyboard navigation.

### MWEB-P0-002 — Bangun trust layer dan identitas legal

**Tujuan:** perusahaan dapat memvalidasi siapa TEMBUS sebelum mengirim data bisnis.

**Ruang lingkup:**

- Tambahkan identitas badan hukum, alamat/kontak bisnis, email support, dan kanal bantuan yang benar.
- Tambahkan tautan Kebijakan Privasi, Syarat dan Ketentuan, dan kebijakan penggunaan data.
- Jelaskan bahwa data usaha diperiksa sebelum toko menerima pesanan.
- Tambahkan security/data handling copy yang faktual, tanpa klaim sertifikasi yang belum dimiliki.
- Siapkan area testimonial/logo partner sebagai komponen kosong yang tidak dirender bila belum ada data terverifikasi.

**Acceptance criteria:**

- Tidak ada footer atau trust copy yang menyebut data fiktif.
- Semua legal link menghasilkan halaman valid dan dapat dibuka langsung.
- Informasi support memiliki owner dan target respons internal yang terdokumentasi.
- Review copy tidak menyisakan istilah teknis internal seperti `backend`, `server`, atau nama service.

### MWEB-P0-003 — Tampilkan persyaratan dan alur pendaftaran perusahaan

**Tujuan:** mengurangi pendaftaran gagal karena dokumen atau informasi tidak siap.

**Ruang lingkup:**

- Buat checklist persiapan: data perusahaan, data penanggung jawab/direktur, dokumen legal, rekening pencairan, outlet, dan menu.
- Tampilkan tahapan: isi data → unggah dokumen → verifikasi → perbaikan bila diperlukan → toko siap.
- Tampilkan biaya pendaftaran hanya jika kebijakan biaya sudah authoritative; jika gratis, sumber keputusan harus terdokumentasi.
- Tampilkan estimasi verifikasi hanya jika SLA benar-benar disepakati dan diukur.
- Tambahkan state dokumen: belum diunggah, sedang diperiksa, perlu diperbaiki, disetujui, ditolak.
- Sediakan link ke `Cek status pendaftaran` dari setiap tahap.

**Acceptance criteria:**

- Checklist di web konsisten dengan kontrak onboarding merchant dan API yang dipakai.
- Tidak ada dokumen yang dinyatakan wajib bila backend tidak memvalidasinya.
- Pengunjung dapat memahami apa yang harus disiapkan sebelum mengisi form.
- Status pendaftaran berasal dari sumber data yang sama dengan portal/admin; tidak ada status simulasi.
- Error, retry, upload gagal, dan resubmission memiliki copy yang jelas bagi pengguna non-teknis.

### MWEB-P0-004 — Perkuat conversion, status, dan support funnel

**Tujuan:** calon merchant tidak berhenti setelah klik daftar atau ketika menemukan masalah.

**Ruang lingkup:**

- Sediakan halaman `Cara bergabung` yang memiliki checklist, FAQ, dan CTA berulang.
- Sediakan halaman `Cek status` dengan input/identitas yang aman dan rate limit sesuai kontrak.
- Tambahkan `Pusat bantuan` minimal untuk pendaftaran, dokumen, verifikasi, menu, order, dan pencairan.
- Tambahkan fallback kontak ketika status/API tidak tersedia, tanpa membocorkan detail internal.
- Tambahkan analytics funnel yang privacy-safe: view hero, klik daftar, mulai form, submit, upload, selesai, dan error.

**Acceptance criteria:**

- Setiap state API memiliki loading, empty, error, retry, dan contact support yang relevan.
- Tidak ada keberhasilan palsu ketika submit atau cek status gagal.
- Event analytics tidak memuat dokumen, nomor rekening, token, atau PII sensitif.
- Funnel dapat diaudit dari log/event yang sudah disetujui.

### MWEB-P0-005 — Release gate kualitas landing page

**Tujuan:** memastikan perubahan P0 layak dipromosikan.

**Acceptance criteria:**

- Build, lint, typecheck, dan test web lulus.
- Browser E2E memverifikasi CTA perusahaan, CTA perorangan, login portal, cek status, FAQ, legal link, dan error API.
- Audit responsive 320px, 375px, 412px, tablet, dan desktop selesai.
- Audit keyboard/focus/contrast/semantics selesai.
- Docker lokal dibuild ulang, halaman lokal dan public staging mengembalikan HTTP 200 setelah deployment.
- Screenshot evidence untuk hero, onboarding, status, support, dan footer tersimpan.

---

## P1 — Membuat produk terlihat matang dan bernilai untuk bisnis

### MWEB-P1-001 — Product capability proof

Tampilkan kemampuan portal dengan bukti UI nyata dan copy yang konkret:

- pesanan masuk, terima/tolak, siapkan, dan perubahan pesanan;
- menu, kategori, varian, stok/ketersediaan, dan foto;
- owner, manager, kasir, staff, dan hak akses;
- multi-outlet dan status toko;
- promosi/campaign bila modul sudah tersedia;
- laporan penjualan, pencairan, settlement, dan rekonsiliasi;
- integrasi printer/POS hanya bila benar-benar didukung.

**Acceptance criteria:** setiap klaim memiliki route/screen/API yang bisa ditunjukkan atau diberi label `segera hadir`; tidak ada mock nominal/status dalam preview produksi.

### MWEB-P1-002 — Merchant proof dan outcome bisnis

Tambahkan komponen untuk:

- testimonial merchant yang memiliki izin;
- studi kasus dengan metrik yang bersumber dari data terverifikasi;
- foto pemilik/staff/outlet yang asli atau aset generatif berlisensi internal;
- logo partner hanya dari daftar partner yang disetujui.

**Acceptance criteria:** setiap bukti memiliki sumber, tanggal validasi, dan owner; komponen tidak tampil bila datanya kosong; tidak ada social proof palsu.

### MWEB-P1-003 — Content/help hub

Bangun struktur konten seperti:

- panduan pendaftaran perusahaan;
- panduan persiapan dokumen;
- panduan menerima pesanan dan mengatur menu;
- panduan staff dan multi-outlet;
- panduan pencairan dan laporan;
- pusat bantuan dan escalation path.

**Acceptance criteria:** halaman dapat ditemukan dari header/footer, memiliki search atau kategori yang jelas, metadata SEO valid, dan semua artikel punya owner/review date.

### MWEB-P1-004 — Design system, visual storytelling, dan accessibility

- Pertahankan token warna TEMBUS, hierarchy hijau-oranye, radius, typography, dan safe spacing.
- Ganti komposisi yang terlalu bergantung pada kartu abstrak dengan satu visual merchant/product yang kuat.
- Audit logo, ikon, whitespace, contrast, reduced motion, alt text, focus ring, dan text scaling.
- Pastikan visual marketing berbeda jelas dari UI portal agar tidak menimbulkan ekspektasi palsu.

**Acceptance criteria:** tidak ada overlap/terpotong, WCAG target tercatat, visual regression baseline tersedia, dan semua gambar memiliki alt/fallback yang benar.

### MWEB-P1-005 — Portal/app handoff dan deep-link readiness

- Link portal login ke host yang benar.
- Link aplikasi perorangan ke store/download yang benar.
- Tambahkan QR hanya jika URL final sudah stabil.
- Tangani browser/device yang tidak mendukung deep link.

**Acceptance criteria:** semua link diuji pada desktop dan Android; tidak ada dead link; event handoff tercatat tanpa PII.

---

## P2 — Growth ecosystem dan optimasi berkelanjutan

### MWEB-P2-001 — SEO dan resource engine

- Landing per segmen: PT, restoran multi-outlet, bisnis kuliner, dan perorangan/app.
- Structured data, sitemap, canonical, Open Graph, metadata, dan performance budget.
- Artikel berbasis pertanyaan calon merchant, bukan keyword stuffing.

**Acceptance criteria:** SEO technical audit lulus, tidak ada halaman tipis/duplikat, dan semua klaim memiliki sumber.

### MWEB-P2-002 — Lead/demo/contact-sales flow

- Form minat demo untuk bisnis besar/multi-outlet.
- Routing lead berdasarkan ukuran bisnis dan area layanan.
- Consent, rate limit, anti-spam, audit trail, dan handoff ke support/sales.

**Acceptance criteria:** lead tersimpan pada sistem resmi, tidak dikirim ke spreadsheet atau email pribadi, dan status follow-up dapat dilacak.

### MWEB-P2-003 — Integrations and partner ecosystem

- Halaman integrasi printer, POS, payment, accounting, atau operational tools.
- Hanya tampilkan integrasi dengan adapter, owner, dokumentasi, dan status availability yang nyata.
- Sediakan request-integration flow jika belum tersedia.

**Acceptance criteria:** setiap integrasi memiliki status supported/beta/planned/deprecated dan tidak menampilkan logo partner tanpa persetujuan.

### MWEB-P2-004 — Experimentation dan growth measurement

- Dashboard funnel: acquisition → signup → verification → activation → first order.
- Eksperimen CTA/copy/layout dengan feature flag dan assignment yang dapat diaudit.
- Guardrail untuk conversion, error rate, verification drop-off, support load, dan privacy.

**Acceptance criteria:** eksperimen dapat dimatikan tanpa deploy ulang, assignment konsisten, dan tidak memengaruhi kebenaran order/finance/onboarding.

### MWEB-P2-005 — Content operations dan quarterly review

- Owner per halaman/klaim/asset.
- Review legal, produk, support, dan security berkala.
- Arsipkan claim/asset yang kedaluwarsa.

**Acceptance criteria:** setiap halaman publik memiliki owner, tanggal review, sumber data, dan status aktif/arsip.

---

## Portal Mitra authenticated — F&B Global Operations Standard

Bagian ini adalah backlog lanjutan untuk **setelah merchant berhasil masuk Portal Mitra**. Fokusnya bukan sekadar menambah halaman, tetapi memastikan portal menjadi pusat operasi bisnis F&B yang konsisten dengan Merchant Android dan terhubung end to end dengan Customer, Courier, Admin, database, ledger/settlement, notifikasi, dan provider yang memang sudah diaktifkan.

### Prinsip scope dan kontrak wajib

- Portal mendukung merchant perorangan dan bisnis/PT, tetapi capability ditentukan oleh `business_type`, verifikasi, outlet scope, role, dan feature flag dari server; UI tidak boleh menganggap user sebagai owner hanya karena route dapat dibuka.
- Semua nominal, status order, status outlet, menu availability, promo redemption, settlement, payout, refund, review, dan permission harus berasal dari sumber otoritatif. Tidak boleh ada angka, status sukses, saldo, atau data pelanggan yang di-hardcode pada production path.
- Semua command yang dapat diulang harus idempotent dan memiliki correlation/request ID: terima/tolak order, ubah item, pause outlet, ubah availability, publish menu, aktifkan promo, withdrawal, invite staff, dan reply review.
- Waktu disimpan dan dibandingkan secara timezone-aware; tampilan portal menggunakan timezone outlet. Mata uang, pajak, komisi, promo funding, refund, dan settlement tidak boleh dihitung ulang hanya di frontend.
- Data pelanggan dan kurir menerapkan least privilege, masking PII, retention, audit trail, dan larangan menampilkan nomor kontak langsung bila komunikasi in-app sudah tersedia.
- Satu kontrak status dibagikan ke Admin, Merchant Web, Merchant Android, Customer Android, Courier Android, webhook, dan event bus. Label UI boleh berbeda untuk bahasa pengguna, tetapi mapping state dan transition tetap satu.
- Bila capability belum benar-benar tersedia di backend/provider, tampilkan `Segera hadir` atau sembunyikan berdasarkan capability matrix; jangan membuat kartu yang tampak aktif tetapi tidak dapat dieksekusi.

### Benchmark minimum standar global

Baseline ini disusun dari pola resmi portal merchant yang saat ini tersedia: GrabMerchant mendukung multi-outlet, laporan/keuangan, menu, campaign, dan akses staff berbasis peran; Uber Eats Manager mencakup order, status toko, menu, feedback, pembayaran, dan marketing; DoorDash Merchant Portal mencakup order aktif, komunikasi penyelesaian masalah, menu, jam toko, dan ketersediaan item. Rujukan primer dicantumkan agar setiap klaim dapat diperbarui saat produk berkembang:

- [GrabMerchant Portal — kelola bisnis, multi-outlet, laporan, menu, campaign, dan staff](https://merchant.grab.com/id-id/guides/all/kemudahan-kelola-bisnis-dengan-grabmerchant-portal)
- [GrabMerchant — atur akses karyawan berdasarkan peran](https://merchant.grab.com/id-id/guides/pengaturan-toko/atur-akses-dengan-mudah-untuk-setiap-peran-karyawan)
- [Uber Eats Manager — overview operasi merchant](https://merchants.ubereats.com/us/en/technology/simplify-operations/overview/)
- [Uber Eats Manager — menu, payout, notifikasi, status toko, dan campaign](https://merchants.ubereats.com/ca/en/resources/articles/product-highlights/uber-eats-manager-updates-june-2025/)
- [Uber Eats Orders — menerima order, pause, jam operasi, dan tracking delivery person](https://merchants.ubereats.com/gb/en/technology/manage-orders/uber-eats-orders-app/)
- [DoorDash Merchant Portal — order, menu, jam toko, issue resolution, dan ketersediaan item](https://merchants.doordash.com/en-us/products/merchant-portal)

Benchmark tersebut adalah referensi capability, bukan izin untuk menyalin merek/UI pihak lain. Implementasi tetap harus memakai design system TEMBUS, kontrak backend LANCAR, kebijakan privasi, serta provider yang benar-benar tersedia.

## P0 — Core operations yang wajib layak dipakai merchant F&B

### MWEB-PORTAL-P0-001 — Portal shell, tenant scope, dan capability-aware navigation

**Tujuan:** setelah login, merchant selalu berada pada konteks bisnis, outlet, role, dan capability yang benar.

**Cakupan:**

- App shell responsif: header, outlet switcher, notification center, help, account menu, breadcrumb, global search, command feedback, loading/error/empty state, dan session-expiry recovery.
- `merchant_id`, `business_id`, `outlet_id`, role, permission, verification state, country/market, currency, dan timezone dimuat dari server session/token; jangan dipercaya dari query parameter.
- Menu navigasi berbasis capability: Beranda, Pesanan, Menu, Promo, Laporan, Keuangan, Staff, Integrasi, Bantuan, dan Pengaturan.
- Route guard, object-level authorization, tenant isolation, CSRF/session protection, audit event, dan deep link kembali ke halaman tujuan setelah login.
- Support desktop, tablet, dan browser mobile tanpa mengorbankan operasi order yang mendesak.

**Acceptance criteria:**

- User perorangan, owner PT, manager outlet, kasir, kitchen, dan finance melihat navigasi serta data Merchant Web yang berbeda sesuai server policy. Support/admin diuji sebagai boundary terpisah melalui Admin Support Console dengan akses case-scoped, read-only, redacted, dan audited; support tidak membuat `merchant_session`, tidak membuka `/merchant/context`, dan tidak melakukan impersonasi umum.
- User tidak dapat mengganti `merchant_id`, `outlet_id`, atau object ID di URL untuk membaca/menulis data tenant lain.
- Semua aksi sensitif menghasilkan audit event berisi actor, role, tenant/outlet, action, object, result, timestamp, correlation ID, dan reason bila gagal.
- Refresh, membuka deep link, multi-tab, expired session, dan koneksi putus tidak menghilangkan konteks atau membuat aksi ganda.
- Kontrak permission diuji melalui API dan browser E2E; bukan hanya dengan menyembunyikan tombol.

### MWEB-PORTAL-P0-002 — Beranda operational control center

**Tujuan:** owner/manager dapat memahami kondisi toko dan mengambil tindakan penting dalam satu layar.

**Cakupan:**

- Kartu status outlet: buka, tutup, jeda sementara, mode sibuk, jam operasi, jam khusus/libur, alasan perubahan, dan siapa yang mengubah.
- Terima otomatis dengan guardrail: hanya aktif bila outlet, menu, device/notification, dan capability order siap; tampilkan konsekuensi dan audit perubahan.
- Ringkasan order: baru, perlu tindakan, disiapkan, menunggu kurir, berjalan, selesai, batal, refund/dispute, SLA terlewati, dan error sinkronisasi.
- Ringkasan bisnis: penjualan kotor/net, order selesai, average order value, komisi, diskon, pajak/biaya, payout berikutnya, dan alert bila data belum tersedia.
- Alert operasional: menu habis, dokumen kedaluwarsa, bank belum terverifikasi, printer/POS putus, payout tertahan, kualitas turun, atau provider sedang gangguan.

**Acceptance criteria:**

- Data beranda dapat ditelusuri ke endpoint/database/event yang sama dengan halaman detail; tidak ada angka mock atau copy yang menyatakan real-time tanpa freshness timestamp.
- Toggle buka/jeda/mode sibuk/terima otomatis memiliki optimistic state yang aman, rollback saat gagal, retry, idempotency, dan notifikasi ke channel yang relevan.
- Perubahan jam operasi dan status outlet langsung tercermin pada Customer, Courier, Merchant Android, dan Admin sesuai cache invalidation/event contract.
- Dashboard multi-outlet menunjukkan agregasi dan outlet detail secara jelas; tidak mencampur currency, timezone, settlement window, atau role scope.

### MWEB-PORTAL-P0-003 — Order operations center dan lifecycle F&B end to end

**Tujuan:** portal menangani seluruh alur order food dari customer membuat pesanan sampai order selesai, dibatalkan, direfund, atau masuk dispute.

**Cakupan lifecycle minimum:**

1. Customer membuat order dan payment/authorization tercatat.
2. Merchant menerima notifikasi, melihat countdown/SLA, lalu menerima atau menolak dengan reason.
3. Merchant memproses item, mengusulkan penggantian/penghapusan item bila tersedia, dan customer mendapat kesempatan menyetujui sesuai policy.
4. Kitchen/merchant menandai menyiapkan, siap diambil, dan order diserahkan ke kurir.
5. Courier mendapat assignment, navigasi pickup, konfirmasi pickup, lalu delivery/customer confirmation.
6. Merchant melihat timeline dan bukti setiap transition; state terminal menjadi delivered, cancelled, refunded, partially refunded, disputed, atau failed sesuai kontrak.

**Cakupan UI/operasi:**

- Queue baru/aktif/terjadwal/selesai/batal dengan filter outlet, channel, payment, SLA, status courier, dan search order ID.
- Detail order: item, modifier, catatan/alergi bila tersedia, harga sebelum/sesudah promo, pajak/biaya, payment state, customer privacy-safe, courier state, timeline, receipt, dan audit.
- Aksi terima/tolak/siapkan/ready/unavailable/cancel/issue/refund/reprint hanya tampil jika transition diizinkan server.
- Substitusi, item habis, partial acceptance, customer approval, partial refund, cancellation fee, dan dispute escalation.
- Realtime via websocket/SSE dengan fallback polling; sound/browser notification yang dapat diatur per role/device.

**Acceptance criteria:**

- Browser E2E membuktikan customer → database/order service → merchant portal → courier → customer, termasuk success, timeout, reconnect, reject, item unavailable, cancel, refund, dan duplicate click.
- Merchant tidak dapat menandai ready/delivered atau mengubah total pembayaran dari frontend tanpa transition/authorization server.
- Timer, status, dan notifikasi tetap benar setelah refresh, multi-tab, background tab, reconnect, dan event out-of-order.
- Komunikasi customer/kurir tercatat, privacy-safe, rate-limited, dan memiliki escalation path; tidak bergantung pada nomor telepon mentah.
- Receipt yang diunduh atau dicetak berasal dari order authoritative dan menampilkan status pembayaran/pajak yang benar.

### MWEB-PORTAL-P0-004 — Catalog/menu, modifier, availability, dan kesiapan publikasi

**Tujuan:** merchant dapat mengelola catalog food yang tampil konsisten di Customer dan dapat dieksekusi oleh order service.

**Cakupan:**

- Kategori, item, foto, nama/deskripsi, harga, tax class, prep time, serving option, label diet/alergen, SKU/internal code, visibility, jam tersedia, stok, dan sold-out.
- Variant/modifier/add-on, pilihan wajib/opsional, minimum/maksimum, price delta, dependency, dan konflik item.
- Bulk import/export dengan schema validation, preview, dry-run, rollback/versioning, duplicate detection, image constraints, dan audit perubahan.
- Draft → review → publish → rollback; perbedaan catalog pusat vs outlet lokal untuk multi-outlet.
- Availability real-time dari outlet; konflik perubahan dan stale cache harus terlihat.

**Acceptance criteria:**

- Perubahan harga/availability/menu publish memiliki actor, version, timestamp, outlet scope, dan dapat ditelusuri ke Customer catalog.
- Customer hanya dapat memilih kombinasi modifier yang valid; order lama tetap mempertahankan snapshot nama/harga/item saat checkout.
- Item sold-out di portal tercermin ke Customer dan tidak bisa dipesan lewat race condition/cache lama.
- Upload tidak menyimpan file berbahaya; ukuran, MIME, dimensi, virus scan/CDN policy, alt text, dan fallback ditangani.
- Tidak ada field semu yang tampak tersimpan tetapi hilang ketika halaman direfresh.

### MWEB-PORTAL-P0-005 — Multi-outlet, organization profile, dan outlet switching

**Tujuan:** bisnis PT/F&B dapat mengelola beberapa outlet tanpa kebocoran data atau konfigurasi.

**Cakupan:**

- Business profile, legal entity, brand, outlet address/map, contact, timezone, currency, operating/holiday hours, delivery radius/capability, tax identity, payout account, dan verification state.
- Switcher outlet dengan last-used context yang aman, view semua outlet untuk role yang berhak, dan filter eksplisit pada setiap laporan/order/menu.
- Central catalog, outlet override, outlet-specific price/availability/promo, bulk action dengan confirmation, preview affected outlets, dan rollback.
- Outlet lifecycle: draft, pending review, active, paused, suspended, closed; alasan dan approver.

**Acceptance criteria:**

- Query, export, cache, notification, dan audit selalu menyertakan outlet/tenant scope.
- Staff hanya melihat outlet yang ditugaskan; owner/manager dapat melihat agregat sesuai permission.
- Tidak ada tindakan bulk irreversible tanpa preview, idempotency key, progress, partial failure report, dan rollback/retry path.
- Customer melihat outlet aktif yang benar untuk area dan jam yang benar; Courier menerima pickup address dan order scope yang benar.

### MWEB-PORTAL-P0-006 — Identity, staff, RBAC/ABAC, dan audit pengguna

**Tujuan:** bisnis dapat mengelola owner, manager, kasir, kitchen, finance, dan role custom tanpa berbagi password.

**Cakupan:**

- Invite by email/phone, acceptance, MFA/step-up untuk finance dan data sensitif, login/session/device management, suspend/revoke, reset, dan recovery.
- Role minimum: owner, business admin, outlet manager, cashier/order operator, kitchen, finance, analyst, support-read-only; custom role harus berbasis capability yang terdaftar.
- Scope business/outlet dan permission read/write/approve/export/refund/payout/staff/integration.
- Separation of duties: orang yang membuat payout account/refund besar tidak otomatis menjadi approver tunggal.
- Audit viewer, export audit yang terkontrol, retention, reason code, dan alert aktivitas berisiko.

**Acceptance criteria:**

- Backend menolak akses yang tidak diizinkan walaupun request dibuat manual; UI permission test dan API authorization test sama-sama lulus.
- Invite token sekali pakai, expiry, revoke, anti-enumeration, rate limit, dan email/phone verification aman.
- Semua aksi staff sensitif dapat ditelusuri; perubahan permission tidak menghapus history.
- Portal menampilkan siapa yang mengubah order/menu/finance, bukan hanya "sistem".

### MWEB-PORTAL-P0-007 — Finance, settlement, payout, invoice, dan rekonsiliasi

**Tujuan:** merchant dapat memahami dan mengendalikan uang tanpa angka yang berbeda dari ledger atau payment provider.

**Cakupan:**

- Gross sales, item subtotal, delivery/service fee, commission, promo merchant/platform, tax, adjustment, refund, chargeback/dispute, net payable, holding, available, payout schedule, dan bank status.
- Order detail → transaction/ledger → settlement batch → payout/withdrawal → bank/provider reference.
- Statements harian/mingguan/bulanan, invoice/tax document, CSV/XLS export, filter outlet/payment/settlement status, dan timezone.
- Bank account onboarding/change dengan verification, maker-checker/step-up, cooldown, masking, dan fraud/risk alert.
- Reconciliation worker, mismatch queue, retry, provider webhook/polling, UNKNOWN state, manual review, dan immutable history.

**Acceptance criteria:**

- Portal tidak menampilkan `berhasil` untuk payout/payment hanya karena request HTTP 200; status provider dan ledger harus authoritative.
- Setiap nominal dapat direkonsiliasi ke order IDs dan settlement IDs; total halaman, export, dan API konsisten.
- Refund, partial refund, adjustment, tax, commission, dan promo funding terpisah jelas serta tidak menduplikasi ledger entry.
- Payout account dan invoice sensitif dimasking; export membutuhkan permission dan audit.
- Mismatch menghasilkan alert/ticket dan tidak diam-diam dikoreksi oleh frontend.

### MWEB-PORTAL-P0-008 — Customer/courier communication, issues, refund, review, dan quality

**Tujuan:** merchant dapat menyelesaikan masalah order dengan customer dan kurir melalui alur yang tercatat.

**Cakupan:**

- Order issue center: item hilang/salah/rusak, keterlambatan, customer tidak menerima, courier gagal pickup, payment mismatch, suspected fraud, dan safety incident.
- Template dan in-app messaging yang privacy-safe; lampiran/bukti dengan expiry, content validation, moderation, dan PII redaction.
- Request customer approval untuk perubahan; refund/credit/compensation sesuai threshold dan permission; escalation ke Admin/support.
- Review/rating, reply merchant, appeal quality score, response SLA, dan link feedback ke order tanpa membocorkan identitas.
- Policy engine untuk siapa yang boleh membatalkan, refund, reply, atau menutup issue.

**Acceptance criteria:**

- Setiap issue memiliki owner, status, SLA, evidence, audit, resolution code, dan escalation state.
- Customer dan courier menerima update yang konsisten; tidak ada channel yang menyatakan delivered ketika order belum authoritative.
- Refund/compensation tidak dapat dibuat dua kali untuk issue yang sama dan masuk ke settlement/reconciliation.
- Rating/review tidak dapat dihapus merchant; reply dapat dimoderasi dan tetap diaudit.

### MWEB-PORTAL-P0-009 — Realtime, notification, resilience, observability, dan recovery

**Tujuan:** operasi toko tetap aman ketika koneksi, tab, browser, worker, atau provider bermasalah.

**Cakupan:**

- Event contract/order notification, websocket/SSE, polling fallback, deduplication, sequence/version, dead-letter/replay policy, dan stale-data banner.
- Browser permission, notification preference per role/outlet, sound policy, quiet hours, escalation untuk order SLA, dan delivery receipt.
- Offline/read-only mode yang tidak mengklaim write success; retry queue hanya untuk command idempotent.
- Structured logs, metric latency/error/stale/event lag, trace correlation, alert, runbook, dan PII/secret redaction.
- Incident banner/status, graceful degradation, replay/backfill, and rollback path.

**Acceptance criteria:**

- Simulasi disconnect, duplicate event, event terlambat, refresh, multiple tabs, worker restart, dan provider timeout menghasilkan state akhir yang benar.
- Merchant tahu apakah data live, stale, atau sedang disinkronkan; UI tidak menampilkan angka yang tampak live tanpa freshness.
- SLO/SLA order notification, accept latency, command error, and data freshness dicatat dan memiliki alert.
- Recovery test membuktikan order tidak hilang, tidak terima dua kali, dan tidak membuat settlement ganda.

### MWEB-PORTAL-P0-010 — Cross-system production readiness gate

**Tujuan:** menyatakan Portal Mitra siap digunakan bisnis hanya setelah capability dan risiko utama terbukti.

**Gates minimum:**

- Browser E2E: login/MFA, role restriction, multi-outlet, open/pause/auto-accept, order food lengkap, item unavailable/substitution, courier handoff, cancel/refund, review/issue, menu publish, promo, report, settlement, staff, export, dan logout/session expiry.
- Cross-app E2E: Customer order → backend/database → Merchant Web/Android → Courier → Customer; Admin dapat melihat/audit status tanpa menjadi source of truth kedua.
- Data correctness: DB constraints, migration/backfill, ledger/settlement reconciliation, event replay, idempotency, timezone/currency, PII masking, dan retention.
- Security: tenant isolation, RBAC/ABAC, CSRF/XSS/upload controls, rate limit, MFA/step-up, secret scanning, dependency/container scan, audit immutability, dan abuse cases.
- Quality: responsive desktop/tablet/mobile, keyboard/focus/contrast/zoom/reduced motion, Indonesian copy, loading/empty/error/retry, performance budget, and real browser compatibility.
- Operations: observability dashboard, on-call owner, runbook, backup/restore, rollback, feature flag kill switch, staged rollout, support readiness, and incident communication.

**Acceptance criteria:**

- Tidak ada checklist P0 yang berstatus `NOT_RUN`, `PARTIAL`, atau hanya dibuktikan mock sebelum release gate.
- Semua evidence disimpan per TASK-ID; hasil staging dibedakan dari public production dan tidak disebut production-ready tanpa runtime proof.
- Owner produk, backend, mobile, web, security, finance, support, dan operations menandatangani capability matrix yang benar-benar diuji.

## P1 — Scale operasi, growth, dan efisiensi merchant

### MWEB-PORTAL-P1-001 — Promo, campaign, ads, dan funding transparency

- Buat promo fixed/percentage/free item/free delivery/bundle sesuai provider dan market; eligibility, period, quota, budget, outlet, menu, funding owner, stacking/exclusion, approval, pause/stop, dan abuse limit.
- Tampilkan preview harga customer, merchant contribution, platform contribution, redemption, incremental order/revenue, biaya campaign, dan settlement impact.
- Sinkronkan campaign ke Customer catalog dan order pricing; rollback/expiry harus deterministik.

**Acceptance criteria:** promo tidak boleh tampil aktif di portal bila tidak ada eligibility/price calculation authoritative; laporan promo dapat direkonsiliasi ke order dan settlement. Rujukan pola: [GrabMerchant — mengatur promosi](https://merchant.grab.com/id-id/guides/tingkatkan-penjualan/mengatur-promosi-di-aplikasi-grabmerchant).

### MWEB-PORTAL-P1-002 — Reports, analytics, customer insight, dan export governance

- Laporan sales/order/payment/promo/customer/menu/outlet/staff; gross-to-net, AOV, repeat rate, peak hour, prep time, acceptance/cancel, out-of-stock, delivery performance, rating, dan payout.
- Filter date/outlet/channel/status/payment dengan timezone; drill-down sampai order/settlement ID; compare periods; saved view; CSV/XLS export; scheduled report bila tersedia.
- Customer insight harus aggregate dan privacy-safe: cohort, repeat, favorite category, churn risk hanya bila ada dasar data dan policy.
- Data freshness, last calculated time, late event, restatement, export permission, watermark, dan audit.

**Acceptance criteria:** angka dashboard, detail, export, dan finance statement memiliki definisi metric yang sama; tidak ada insight dari sample/mock. Rujukan pola laporan: [GoFood Merchant — membaca laporan dashboard](https://gofoodmerchant.co.id/biztips/topics/manajemen-operasional/operasional-semua-wajib-tahu/begini-cara-membaca-laporan-dashboard-gofood-merchant-dengan-mudah).

### MWEB-PORTAL-P1-003 — POS/KDS/printer, payment, webhook, dan integration center

- Daftar integrasi dengan status supported/beta/planned/deprecated, capability, market, owner, setup guide, health, last sync, version, dan revoke.
- POS/KDS/printer: menu/order sync, printer test, routing kitchen, retry, duplicate protection, conflict resolution, offline queue, and reconciliation.
- Webhook/API: signing, timestamp/replay protection, idempotency, versioning, delivery attempts, dead-letter, rotate secret, scope, and event replay.
- Payment/provider integration tidak boleh menyamarkan `pending`, `unknown`, atau `failed` menjadi paid.

**Acceptance criteria:** integrasi dapat di-connect, diuji, diputus, dan dipulihkan dengan audit; setiap klaim di landing/portal memiliki adapter nyata atau label planned.

### MWEB-PORTAL-P1-004 — Food compliance, quality, safety, dan document center

- Legal/business document, food permit, halal/food safety, tax/NPWP, bank verification, owner identity, expiry, reviewer, rejection reason, resubmission, and audit.
- Quality score dari order/review/cancel/prep/refund/safety signal; threshold, warning, appeal, enforcement, and support handoff.
- Document storage secure: encryption/access scope, virus scan, size/MIME check, retention, delete/revoke, and no raw URL leakage.

**Acceptance criteria:** merchant memahami alasan status pending/rejected/suspended; Admin dan Merchant melihat state yang sama; expired document tidak diam-diam tetap dianggap valid.

### MWEB-PORTAL-P1-005 — Help center, training, support, dan escalation

- Contextual help dari setiap feature, onboarding checklist, merchant academy, release notes, status page, chat/ticket, SLA, attachment, internal note separation, and escalation to Admin.
- Support agent hanya mendapat data yang dibutuhkan; merchant dapat melihat ticket state, owner, next action, dan expected response tanpa janji palsu.
- Incident/maintenance announcement per market/outlet/capability dan in-app acknowledgement.

**Acceptance criteria:** setiap P0 failure punya jalur self-service dan escalation; ticket dapat ditelusuri ke correlation ID/order/settlement tanpa mengekspos secret atau PII berlebihan.

### MWEB-PORTAL-P1-006 — Merchant growth, CRM, retention, dan controlled experimentation

- Insight untuk menu pricing, opening hours, prep capacity, repeat customer, promo efficiency, and out-of-stock; rekomendasi selalu diberi sumber data dan confidence/context.
- Segmentasi hanya memakai consent/policy dan data aggregate; campaign audience, suppression, frequency cap, opt-out, dan audit.
- Experiments dengan feature flag, stable assignment, guardrail metrics, kill switch, and no impact to financial/order truth.

**Acceptance criteria:** rekomendasi tidak tampil sebagai fakta tanpa data; opt-out dihormati; eksperimen tidak merusak pricing, permission, order, atau settlement.

## P2 — Enterprise F&B dan ecosystem maturity

### MWEB-PORTAL-P2-001 — Enterprise multi-brand/multi-region control plane

- Hierarchy group → brand → legal entity → outlet, cross-brand role scope, central catalog, market/currency/tax/timezone policy, regional admin, and approval workflow.
- Bulk operations dengan dry-run, affected-object preview, progress, partial failure, rollback, change window, and approval.
- Data residency, retention, export/delete request, and tenant boundary tests per region.

**Acceptance criteria:** satu user dapat bekerja lintas brand hanya dengan scope yang disetujui; agregat tidak mencampur legal entity/market; setiap bulk change dapat direplay dan diaudit.

### MWEB-PORTAL-P2-002 — Inventory, waste, procurement, dan kitchen capacity

- Ingredient/menu mapping, stock count, low-stock, waste reason, prep capacity, kitchen throttling, sold-out forecast, purchasing handoff, and audit.
- Stock/availability harus mencegah oversell dengan concurrency control; customer-facing availability harus memiliki freshness.

**Acceptance criteria:** inventory hanya dipromosikan menjadi capability bila ada authoritative inventory source, reservation/adjustment rules, reconciliation, dan outlet-level audit; jika belum, jangan tampilkan sebagai fitur aktif.

### MWEB-PORTAL-P2-003 — Advanced finance, tax, and accounting ecosystem

- Accounting export/API, tax reports per market, invoice lifecycle, credit/chargeback, payout forecasting, multi-bank, approval matrix, and period close.
- Immutable period close, restatement policy, reconciliation exception queue, and audit package untuk finance.

**Acceptance criteria:** export accounting memiliki schema/version, totals reconcile ke ledger, retry aman, dan kegagalan integrasi tidak mengubah financial truth.

### MWEB-PORTAL-P2-004 — Public API, partner ecosystem, and deprecation discipline

- Developer portal, scoped API keys/OAuth, sandbox/fixtures yang jelas bukan production proof, rate limit/quotas, webhook subscriptions, versioning, changelog, support, and revoke.
- Partner certification, security review, data-processing boundary, incident contact, and deprecation/migration window.

**Acceptance criteria:** tidak ada partner yang dapat membaca tenant lain; secret tidak muncul di UI/log; API version dan webhook replay dapat diuji; partner capability matrix selalu up to date.

### Keputusan scope eksekusi 2026-10-05 — Enterprise P2 dikerjakan lebih dahulu

Empat capability enterprise berikut menjadi fokus implementasi feature-first setelah
baseline P0/P1 yang menjadi dependensinya dapat dipakai oleh capability tersebut:

1. `MWEB-PORTAL-P2-001` — control plane multi-brand/multi-region.
2. `MWEB-PORTAL-P2-002` — inventory, waste, procurement, dan kitchen capacity.
3. `MWEB-PORTAL-P2-003` — accounting export/API, tax, dan finance ecosystem.
4. `MWEB-PORTAL-P2-004` — public API dan partner ecosystem.

Urutan kerja lokal yang dipakai adalah: model ownership dan tenant/market policy →
inventory/catalog projection → accounting export yang membaca ledger secara
read-only → public API/partner boundary. Setiap capability tetap harus memakai
source of truth server-side, authorization, audit, idempotency, observability,
migration/rollback yang relevan, dan evidence per TASK-ID. Implementasi lokal tidak
boleh disebut production-ready sebelum gate verifikasi yang diwajibkan task-nya
terpenuhi.

#### Deferred — bukan selesai dan bukan PASS

Item berikut sengaja dicatat sebagai `DEFERRED / NOT STARTED` karena kontrak payment
gateway masih akan diganti dan provider production belum diputuskan:

1. kredensial Xendit nyata;
2. vault payout nyata dan webhook provider;
3. connect/disconnect provider POS eksternal;
4. UAT/E2E lintas Customer → Merchant → Kurir.

Pekerjaan lokal seperti interface, adapter boundary, validation, idempotency,
recovery, audit, fixture contract test, dan status `planned/unconfigured` boleh
disiapkan bila menjadi dependency capability, tetapi tidak boleh dianggap sebagai
bukti provider live, payout live, POS eksternal live, atau UAT lintas aplikasi.

#### Kondisi re-entry deferred

Deferred item dibuka kembali setelah payment gateway production dipilih dan
contract-nya tersedia, secret/provider access dikonfigurasi melalui secret manager,
vault payout serta webhook signing siap, provider POS yang didukung disetujui, dan
lingkungan UAT lintas aplikasi memiliki akun/seed serta data reset yang aman.

### Ketergantungan dan urutan eksekusi portal

`MWEB-P0-006` + `MWEB-P0-007` → `MWEB-PORTAL-P0-001` → `MWEB-PORTAL-P0-002..P0-009` → `MWEB-PORTAL-P0-010` → `MWEB-PORTAL-P1-001..P1-006` → `MWEB-PORTAL-P2-001..P2-004`.

P0 tidak boleh dianggap selesai hanya karena route sudah ada. Sebelum task dianggap complete, mapping harus menunjukkan: route/UI, API contract, service ownership, table/event/ledger source, migration/seed bila ada, authorization, observability, tests, browser E2E, cross-app E2E, staging evidence, rollback, dan owner operasional.

### Benchmark dan pemeliharaan standar

Review benchmark minimal tiap kuartal atau ketika provider utama mengubah capability. Rujukan tambahan untuk order modification, campaign, dan promo reporting:

- [GrabMerchant — ubah pesanan](https://merchant.grab.com/id-id/guides/getting-started/fitur-ubah-pesanan-di-aplikasi-grabmerchant)
- [GrabMerchant — promo](https://merchant.grab.com/id-id/guides/tingkatkan-penjualan/mengatur-promosi-di-aplikasi-grabmerchant)
- [GoFood Merchant — laporan iklan dan diskon](https://gofoodmerchant.co.id/biztips/topics/manajemen-operasional/evaluasi-agar-resto-berkembang/kini-laporan-iklan-and-diskon-di-portal-go-food-merchant)

Rujukan eksternal membantu menetapkan baseline capability, tetapi bukan bukti implementasi LANCAR. Bukti completion tetap harus berasal dari repository, database, runtime staging, contract test, dan E2E cross-app yang benar-benar dijalankan.

---

## Definition of Done program

- Semua task P0 selesai dan diverifikasi sebelum P1 dianggap eligible.
- Semua data transaksi, onboarding, dokumen, status, dan pencairan tetap server-authoritative.
- Tidak ada mock, angka hardcode, testimonial palsu, atau status sukses palsu pada production path.
- Web, portal, Android Merchant, dan backend menggunakan istilah status yang konsisten.
- Verification mencakup build/lint/test, browser E2E, accessibility, responsive, security/privacy, Docker rebuild, dan staging smoke test.
- Untuk portal authenticated, verification juga wajib mencakup tenant isolation, RBAC/ABAC, order lifecycle customer–merchant–courier, catalog propagation, ledger-to-payout reconciliation, staff audit, realtime recovery, provider UNKNOWN state, dan production release gate `MWEB-PORTAL-P0-010`.
- Setiap deployment staging dibedakan jelas dari bukti runtime public/staging yang benar-benar terverifikasi.
- Task evidence dicatat setelah implementasi; dokumen ini sendiri hanya merupakan rencana dan belum menjadi bukti capability selesai.
