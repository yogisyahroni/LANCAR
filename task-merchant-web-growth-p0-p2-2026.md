# Merchant Web — P0–P2 Growth, Trust & Operational Readiness

Status: Planned
Created: 2026-10-03
Baseline: `staging`
Target: `merchant-web` pada `https://merchant.bawain.my.id/`
Audience: perusahaan/PT dan merchant bisnis; pendaftaran perorangan diarahkan ke Merchant Android

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
- Pindahkan access/refresh token dari `localStorage` ke mekanisme browser yang disetujui security, idealnya secure HttpOnly SameSite cookie atau equivalent yang dibuktikan aman.
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

## Definition of Done program

- Semua task P0 selesai dan diverifikasi sebelum P1 dianggap eligible.
- Semua data transaksi, onboarding, dokumen, status, dan pencairan tetap server-authoritative.
- Tidak ada mock, angka hardcode, testimonial palsu, atau status sukses palsu pada production path.
- Web, portal, Android Merchant, dan backend menggunakan istilah status yang konsisten.
- Verification mencakup build/lint/test, browser E2E, accessibility, responsive, security/privacy, Docker rebuild, dan staging smoke test.
- Setiap deployment staging dibedakan jelas dari bukti runtime public/staging yang benar-benar terverifikasi.
- Task evidence dicatat setelah implementasi; dokumen ini sendiri hanya merupakan rencana dan belum menjadi bukti capability selesai.
