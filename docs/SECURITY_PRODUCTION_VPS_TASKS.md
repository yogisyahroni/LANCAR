# Security Production VPS Task List

Tanggal: 2026-05-25
Branch acuan: `staging`
Sumber pembanding: `C:/Users/yogis/Downloads/securitylancar.md`

Dokumen ini adalah backlog hardening keamanan TEMBUS untuk target awal production di VPS. Fokusnya praktis: aman untuk startup tahap awal, tetap realistis untuk VPS, dan bisa naik kelas ke KMS/HSM/cloud secret manager nanti tanpa bongkar arsitektur besar.

## Ringkasan Status

### Sudah Tertangani atau Audit Lama

- OTP hardcoded bypass pada auth-service tidak ditemukan lagi di implementasi saat ini. OTP sudah memakai alur generator dan feature flag sebelumnya.
- `.env` tidak terlihat sebagai file tracked di Git pada branch saat ini, dan pola `.gitignore` / `.dockerignore` sudah menutup file environment.
- CI staging sudah memiliki container SBOM, secret audit, dan vulnerability gate. Run terakhir sudah hijau untuk matrix container security.

### Masih Perlu Dikerjakan

- Beberapa service masih percaya header internal seperti `x-user-id`, `x-user-role`, dan `x-totp-verified`.
- Compose development masih memiliki default credential yang tidak layak production.
- Beberapa runtime masih punya fallback secret seperti `tembus_secret_key_change_me` atau `guest:guest`.
- API gateway masih mengizinkan header internal dari browser melalui CORS.
- Perlu matriks auth endpoint supaya tidak ada route sensitif yang public tanpa sengaja.
- Docs, metrics, upload, CSRF, webhook, dan brute-force protection masih perlu hardening tambahan.

## P0 - Wajib Sebelum Production VPS

### SEC-P0-01 Harden Internal Auth Header Trust

Risiko: user bisa memalsukan role/admin context jika service internal dapat diakses langsung atau gateway meneruskan header berbahaya dari client.

Evidence awal:

- `backend/admin-service/src/middlewares.ts`
- `backend/api-gateway/src/index.ts`

Task:

- [x] Gateway harus strip semua incoming `x-user-id`, `x-user-role`, `x-totp-verified`, dan header internal lain dari client sebelum request diproses.
- [x] Header internal hanya boleh dibuat oleh gateway setelah JWT/session valid.
- [x] Admin-service tidak boleh percaya header internal tanpa bukti dari gateway, misalnya `x-internal-auth` HMAC/shared secret khusus internal.
- [x] `totp_verified` harus default `false`, bukan `true`.
- [x] Hapus `x-user-id`, `x-user-role`, dan `x-totp-verified` dari `Access-Control-Allow-Headers`.
- [x] Tambahkan test direct-call ke admin-service dengan forged `x-user-role: super_admin` dan pastikan ditolak.
- [x] Tambahkan test gateway-call dengan token valid dan pastikan context user tetap diteruskan dengan benar.

Acceptance criteria:

- Direct request ke admin-service tidak bisa menaikkan privilege hanya dengan header.
- Browser tidak bisa mengirim header internal lewat CORS.
- Semua admin route tetap berjalan melalui gateway dengan token valid.

### SEC-P0-02 Production Docker Compose Hardening

Risiko: credential default terbawa ke production, database/cache/broker terbuka ke internet, dan service internal bisa diakses publik.

Evidence awal:

- `docker-compose.yml`

Task:

- [x] Buat `docker-compose.prod.yml` khusus VPS production.
- [x] Jangan gunakan default password seperti `1234`, `changeme`, kosong, atau `guest:guest`.
- [x] Semua secret production wajib berasal dari environment file server atau GitHub Actions Secrets saat deploy.
- [x] Database, Redis, RabbitMQ, dan service internal hanya berada di private Docker network.
- [x] Hanya reverse proxy/API gateway/frontend yang expose port publik.
- [x] Tambahkan healthcheck untuk Postgres, Redis, RabbitMQ, dan service utama.
- [x] Pastikan volume database persistent dan backup-friendly.

Acceptance criteria:

- `docker compose -f docker-compose.prod.yml config` tidak menampilkan default secret lemah.
- Port database/cache/broker tidak dipublish ke host publik.
- Deployment staging/production tetap bisa jalan via GitHub Actions Secrets.

### SEC-P0-03 Runtime Secret Validation and Fail Fast

Risiko: aplikasi tetap start dengan secret default atau credential development.

Evidence awal:

- `backend/admin-service/src/controllers/courierAuth.controller.ts`
- `backend/order-service/cmd/api/main.go`

Task:

- [x] Hapus fallback `JWT_SECRET || 'tembus_secret_key_change_me'`.
- [x] Hapus fallback RabbitMQ `amqp://guest:guest@localhost:5672/` pada mode production.
- [x] Tambahkan validasi startup untuk semua secret penting: JWT, DB, Redis, RabbitMQ, Firebase, Midtrans, Maps, dan encryption key jika ada.
- [x] Production harus fail-fast jika secret kosong, terlalu pendek, atau memakai nilai development.
- [x] Development tetap boleh memakai `.env.local` / `.env.development`, tetapi diberi label jelas dan tidak boleh masuk image.

Acceptance criteria:

- Service gagal start di production jika secret wajib tidak ada.
- Service tidak lagi punya fallback hardcoded yang aman hanya untuk development.
- Test/unit check memastikan validator menolak secret default.

### SEC-P0-04 CORS and Public Header Surface Cleanup

Risiko: browser client bisa mengirim header internal, memperbesar dampak header spoofing.

Evidence awal:

- `backend/api-gateway/src/index.ts`

Task:

- [x] Allowlist origin production secara eksplisit.
- [x] Pisahkan CORS development dan production.
- [x] Hapus header internal dari allowed headers publik.
- [x] Pastikan credentialed requests hanya aktif untuk origin yang valid.
- [x] Tambahkan test CORS preflight untuk header internal dan pastikan ditolak.

Acceptance criteria:

- Origin tidak dikenal ditolak di production.
- Header internal tidak bisa dikirim dari browser.

## P1 - High Priority Setelah P0

### SEC-P1-01 Gateway Route Auth Matrix

Risiko: endpoint sensitif public tanpa sengaja karena route proxy tidak diberi middleware auth.

Task:

- [x] Buat matriks endpoint: public, authenticated customer, authenticated courier, admin, internal-only.
- [x] Audit route gateway untuk `/api/v1/orders`, `/api/v1/couriers`, `/api/v1/tracking`, `/api/v1/pricing/estimate`, dan route service lain.
- [x] Terapkan middleware auth sesuai matriks.
- [x] Tambahkan test akses anonymous untuk endpoint sensitif dan pastikan 401/403.
- [x] Dokumentasikan endpoint yang memang sengaja public, misalnya public tracking link atau maps autocomplete jika dipakai.

Acceptance criteria:

- Tidak ada route mutasi order/courier/admin yang public tanpa alasan.
- Public endpoint punya rate limit dan payload validation.

### SEC-P1-02 Protect Docs and Metrics

Risiko: dokumentasi API dan metrics bisa membocorkan struktur internal, route, environment, atau performa service.

Task:

- [x] Lindungi `/docs/*` di production dengan basic auth, admin auth, atau nonaktifkan di production.
- [x] Lindungi `/metrics` agar hanya bisa diakses dari internal network atau monitoring IP allowlist.
- [x] Pastikan Swagger/OpenAPI tidak memuat contoh secret/token production.

Acceptance criteria:

- `/docs/*` dan `/metrics` tidak public di production.
- Monitoring tetap bisa scrape metrics dari jaringan yang diizinkan.

### SEC-P1-03 Upload Security Hardening

Risiko: upload file berbahaya, spoofed MIME, path abuse, atau file terlalu besar dapat masuk ke sistem.

Evidence awal:

- Admin-service upload middleware berbasis multer memory storage.
- Auth-service local storage memakai extension dari filename.

Task:

- [x] Validasi MIME berdasarkan magic bytes, bukan hanya extension atau client header.
- [x] Allowlist jenis file yang benar-benar dibutuhkan.
- [x] Generate filename server-side, jangan percaya original filename.
- [x] Batasi ukuran file per endpoint.
- [x] Simpan upload di object storage/private path, bukan public path mentah.
- [ ] Tambahkan antivirus scan jika nanti upload dokumen pengguna makin kritikal.

Acceptance criteria:

- File executable/script dengan extension palsu ditolak.
- File valid tetap bisa diupload dan diakses sesuai permission.

### SEC-P1-04 CSRF Protection for Cookie Sessions

Risiko: endpoint yang memakai cookie auth bisa dipanggil dari origin berbahaya jika tidak ada CSRF defense.

Evidence awal:

- Customer auth memakai cookie `httpOnly`, `secure` saat production, dan `sameSite:lax`.

Task:

- [x] Tambahkan CSRF token atau origin/referer validation untuk state-changing routes berbasis cookie.
- [x] Pastikan `SameSite` production sesuai kebutuhan flow. Gunakan `Strict` jika tidak butuh cross-site redirect.
- [x] Tambahkan test POST/PUT/DELETE tanpa CSRF token dan pastikan ditolak.

Acceptance criteria:

- Mutation route berbasis cookie tidak bisa dipanggil cross-site tanpa token/origin valid.

## P2 - Medium Priority

### SEC-P2-01 Generic Error Mapper and Log Redaction

Risiko: error message internal bocor ke client, termasuk query, stack, atau detail dependency.

Task:

- [x] Ganti response `error.message` mentah menjadi error code generik.
- [x] Log detail error hanya di server dengan redaction.
- [x] Redact email, phone, token, password, OTP, API key, dan card/payment identifiers.
- [x] Standarkan error envelope untuk Node dan Go service.

Acceptance criteria:

- Client menerima pesan aman.
- Server log tetap cukup detail untuk debugging tanpa bocor secret/PII.

### SEC-P2-02 Abuse Protection for Public Maps and Pricing Endpoint

Risiko: endpoint maps/pricing dapat disalahgunakan untuk scraping, biaya API membengkak, atau brute-force lokasi.

Task:

- [x] Tambahkan rate limit per IP/device/user.
- [x] Tambahkan cache untuk query maps yang sering.
- [x] Validasi panjang input, koordinat, radius, dan bounding box.
- [x] Tambahkan observability untuk spike request.

Acceptance criteria:

- Public maps/pricing endpoint tidak bisa dipakai unlimited.
- Query invalid cepat ditolak sebelum memanggil provider eksternal.

### SEC-P2-03 Webhook Hardening

Risiko: webhook palsu dapat memicu perubahan status pembayaran/order.

Task:

- [x] Validasi signature provider untuk semua webhook.
- [x] Tambahkan idempotency key/event id agar event retry tidak double-process.
- [x] Simpan raw webhook audit minimal: provider, event id, timestamp, status verifikasi.
- [x] Return generic response tanpa membocorkan detail validasi.

Acceptance criteria:

- Webhook tanpa signature valid ditolak.
- Event duplicate tidak memicu side effect kedua.

### SEC-P2-04 Brute Force and Account Lockout

Risiko: login, OTP, reset password, dan admin auth bisa diserang brute force.

Task:

- [x] Tambahkan Redis-backed rate limit untuk login, OTP request, OTP verify, reset password, dan admin auth.
- [x] Tambahkan progressive delay atau temporary lockout untuk percobaan gagal berulang.
- [x] Audit log untuk attempt mencurigakan.
- [x] Pastikan development mode tetap nyaman tetapi production strict.

Implementation notes:

- Admin-service memakai `bruteForceProtection` untuk admin web login, courier login, dan courier OTP verify. Production memakai Redis dan fail-closed jika proteksi auth tidak tersedia; development/test punya fallback memori supaya local flow tidak terganggu.
- Auth-service memakai `AuthAbuseProtector` Redis untuk customer password login, OTP request, OTP verify, dan 2FA completion.
- Reset password belum memiliki endpoint aktif yang ditemukan di codebase saat task ini dikerjakan. Scope `password_reset` sudah disiapkan di helper agar endpoint reset password nanti wajib memakai proteksi yang sama.
- Default production: identifier lockout setelah 5 kegagalan, IP lockout setelah 30 kegagalan, base lockout 15 menit, progressive sampai 60 menit. Bisa diatur via `AUTH_BRUTE_FORCE_*`.

Acceptance criteria:

- Percobaan brute force OTP/login ditolak setelah threshold.
- User legitimate masih bisa recovery dengan alur yang jelas.

## P3 - Hygiene and Operational Hardening

### SEC-P3-01 Remove Tracked Binaries

Risiko: binary build artifact memperbesar repo, bisa menyimpan secret lama, dan membuat audit supply-chain sulit.

Evidence awal:

- `backend/auth-service/auth-api`
- `backend/auth-service/auth-service.exe`
- `backend/auth-service/auth_service_test.exe`
- `backend/auth-service/gosec-report`
- `backend/order-service/gosec-report`
- `backend/payment-service/payment-api`

Task:

- [x] Hapus binary build artifact dari Git.
- [x] Tambahkan pola ignore untuk output binary Go/Windows.
- [x] Pastikan CI membangun binary dari source, bukan memakai artifact tracked.

Implementation notes:

- Tracked artifact yang dihapus: `backend/auth-service/auth-api`, `backend/auth-service/auth-service.exe`, `backend/auth-service/auth_service_test.exe`, `backend/payment-service/payment-api`, dan generated reports `backend/auth-service/gosec-report` serta `backend/order-service/gosec-report`.
- Root `.gitignore` sekarang menutup output Go service root seperti `*.exe`, `*-api`, `main`, `api`, dan `gosec-report`.
- `backend/auth-service/.dockerignore` ikut menutup binary lokal agar artifact tidak masuk Docker build context/SBOM container.

Acceptance criteria:

- `git ls-files` tidak lagi menampilkan binary build artifact.

### SEC-P3-02 Structured Logging and Audit Trail

Risiko: investigasi incident sulit jika log tidak konsisten atau tidak punya actor/resource/action.

Task:

- [x] Standardisasi structured JSON logging per service.
- [x] Tambahkan audit trail untuk create/update/delete resource penting.
- [x] Tambahkan request id / trace id antar service.
- [x] Pastikan log tidak menyimpan OTP, password, token, API key, atau payment secret.

Implementation notes:

- Admin-service sekarang menulis log JSON ter-redact lewat `security/logRedaction`, membawa `service`, `timestamp`, `level`, `message`, dan metadata aman.
- Admin-service memakai request context berbasis `X-Correlation-ID` dan `X-Request-ID`; dua header ini dikembalikan ke client dan tersedia untuk error/audit.
- Admin-service menulis audit trail generik untuk mutation authenticated yang sukses ke `audit_logs` dengan actor, action, target, request id, correlation id, method, path, status, role, IP, user-agent, dan bentuk payload tanpa nilai sensitif.
- API gateway sekarang men-set dan meneruskan `X-Correlation-ID` / `X-Request-ID`, menggunakan pino redaction untuk authorization/cookie/set-cookie, dan menghapus debug log cookie.
- Order-service, payment-service, routing-service, dan auth-service memakai request log JSON dengan redaction dasar dan propagation request/correlation id.
- Payment-service menulis mutation audit log terstruktur untuk wallet topup/deposit/withdraw berbasis actor dari header gateway.

Acceptance criteria:

- Write operation penting punya audit log.
- Log aman untuk dikirim ke centralized logging.

### SEC-P3-03 VPS Security Runbook

Risiko: konfigurasi server manual mudah drift dan susah diulang saat incident.

Task:

- [x] Buat runbook setup VPS: user non-root, SSH key-only, firewall, fail2ban, Docker, backup.
- [x] Dokumentasikan lokasi secret production di server.
- [x] Dokumentasikan cara rotate secret.
- [x] Dokumentasikan restore database dari backup.
- [x] Dokumentasikan checklist deploy dan rollback.

Implementation notes:

- Runbook operasional tersedia di `docs/VPS_SECURITY_RUNBOOK.md`.
- Lokasi secret production distandarkan ke `/opt/tembus/secrets/.env.production` dengan permission `600` atau `640`; secret tidak perlu dan tidak boleh ditaruh di repo.
- Runbook mencakup hardening VPS awal, setup Docker, firewall, fail2ban, reverse proxy/TLS, deploy Compose, migration, backup PostgreSQL, restore, secret rotation, rollback, troubleshooting, dan escalation.
- Script verifikasi tersedia di `scripts/ops/verify-vps-security.sh` untuk menjalankan gate keamanan VPS tanpa mencetak isi secret.

Acceptance criteria:

- VPS baru bisa dipersiapkan ulang dari dokumen tanpa menebak langkah.
- Secret tidak perlu ditaruh di repo.

## Panduan Secret untuk Tahap VPS

Untuk fase startup dengan VPS, pendekatan yang disarankan:

- GitHub Actions Secrets untuk secret CI/CD dan deploy.
- File environment production hanya berada di VPS, misalnya `/opt/tembus/secrets/.env.production`, permission ketat, tidak masuk Git, tidak masuk Docker image.
- Docker Compose production membaca secret dari environment server, bukan hardcoded di YAML.
- Database menyimpan data bisnis, bukan tempat utama menyimpan application secret seperti JWT secret, DB password, provider API key, atau encryption master key.
- Jika nanti masuk cloud managed service, naikkan ke AWS KMS, Azure Key Vault, Google Cloud KMS, atau Vault.

## Verification Checklist

- [x] `git log --all --full-history -- .env` kosong.
- [x] `gitleaks detect --source . --redact` tidak menemukan secret.
- [ ] `trivy fs --severity HIGH,CRITICAL --exit-code 1 .` tidak menemukan high/critical yang wajib diblok. Local Docker scan timeout di workspace besar; tetap wajib lewat GitHub Actions container security matrix atau source checkout VPS tanpa `node_modules`.
- [x] `docker compose --env-file /opt/tembus/secrets/.env.production -f docker-compose.prod.yml config` tidak menampilkan default secret. Diverifikasi lokal dengan temporary strong dummy env.
- [ ] `ENV_FILE=/opt/tembus/secrets/.env.production API_BASE_URL=https://api.example.com ./scripts/ops/verify-vps-security.sh` berhasil di VPS.
- [x] Direct-call ke service internal tidak bisa spoof admin role.
- [x] Gateway route auth matrix punya test anonymous/authorized.
- [ ] CI staging tetap hijau setelah hardening.
- [ ] Commit penghapusan tracked `google-services.json` dan binary artifact sudah masuk branch deployment.
- [ ] Firebase Android API keys yang pernah masuk Git history sudah di-rotate atau minimal di-restrict by package name + SHA-1/SHA-256 certificate fingerprint di Google Cloud Console.

Detail checklist final dan evidence lokal tersedia di `docs/PRODUCTION_SECURITY_VERIFICATION_CHECKLIST.md`.
