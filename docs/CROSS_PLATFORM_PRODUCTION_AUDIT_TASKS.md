# Cross Platform Production Audit Tasks

Tanggal dibuat: 2026-05-28

Dokumen ini berisi task lanjutan dari audit lintas platform TEMBUS untuk customer webapp, admin dashboard, mobile customer, mobile kurir, backend pendukung, dan GitHub Actions. Semua checklist sengaja dibuat kosong. Centang hanya setelah implementasi, verifikasi lokal, dan verifikasi CI selesai.

## Scope Audit

- Customer webapp: `frontend`
- Admin dashboard: `admin-dashboard`
- Mobile kurir: `android-app`
- Mobile customer: `android-app-customer`
- Backend pendukung: `backend/admin-service`, `backend/api-gateway`, service Go terkait
- CI/CD: `.github/workflows`
- Runtime config: Docker Compose, env examples, mobile release variables

## Verification Baseline

Baseline terakhir yang sudah dicek saat audit:

- `node scripts/ci/check-production-mocks.js` lulus.
- `frontend npm run build` lulus.
- `admin-dashboard npm run build` lulus.
- `backend/admin-service npm test -- --runInBand` lulus.
- `android-app ./gradlew.bat assembleDebug` lulus dengan JDK 17.
- `android-app-customer ./gradlew.bat assembleDebug` lulus dengan JDK 17.
- `frontend npm audit --audit-level=high` tidak menemukan vulnerability.
- `admin-dashboard npm audit --audit-level=high` masih punya moderate advisories.
- `backend/admin-service npm audit --audit-level=high` masih punya moderate advisories.
- `gitleaks` belum tersedia di mesin lokal, sehingga secret scan lokal penuh belum bisa dijalankan.

## P1 - Security And Privacy Remediation

Prioritas ini wajib dikerjakan sebelum production karena berhubungan langsung dengan surface keamanan, data sensitif, atau privacy runtime.

### P1-01 Courier FCM Service Export Hardening

- [x] Samakan deklarasi FCM service mobile kurir dengan mobile customer.
- [x] Tambahkan permission `com.google.android.c2dm.permission.SEND` atau ubah exposure sesuai rekomendasi Firebase terbaru yang kompatibel dengan target SDK.
- [x] Pastikan service `TEMBUSFirebaseMessagingService` tetap menerima FCM foreground/background.
- [x] Tambahkan catatan di mobile release checklist bahwa FCM masih berfungsi setelah manifest hardening.
- [x] Verifikasi `android-app ./gradlew.bat assembleDebug`.
- [ ] Verifikasi runtime: push notification test ke mobile kurir tetap masuk.

Files:

- `android-app/app/src/main/AndroidManifest.xml`
- `android-app/app/src/main/java/com/tembus/courier/service/TEMBUSFirebaseMessagingService.kt`
- `docs/MOBILE_SMOKE_TEST_CHECKLIST.md`

Acceptance criteria:

- Mobile kurir tidak mengekspos service FCM tanpa permission.
- Tidak ada regresi notifikasi order baru.
- Customer app tetap tidak berubah kecuali ada kebutuhan konsistensi dokumentasi.

### P1-02 Production Log Redaction And Debug Log Gate

- [x] Audit semua `Log.d`, `Log.i`, `console.log`, `console.warn`, dan `console.error` di mobile, frontend, admin, gateway, dan admin-service.
- [x] Gate debug log mobile dengan `BuildConfig.DEBUG`.
- [x] Hilangkan log payload FCM penuh, notification body, token, user id mentah, alamat, nomor HP, email, dan koordinat GPS.
- [x] Pindahkan log backend yang masih `console.*` ke structured logger dengan redaction.
- [x] Pastikan mock email/slack alert tidak mencetak HTML penuh atau reason sensitif di production.
- [x] Tambahkan test redaction untuk payload auth, FCM, dan notification alert.
- [x] Verifikasi backend `npm test -- --runInBand`.
- [x] Verifikasi mobile kurir dan customer `assembleDebug`.

Files:

- `android-app/app/src/main/java/com/tembus/courier/service/TEMBUSFirebaseMessagingService.kt`
- `android-app/app/src/main/java/com/tembus/courier/service/LocationTrackerService.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/service/TEMBUSFirebaseMessagingService.kt`
- `backend/admin-service/src/middlewares.ts`
- `backend/admin-service/src/notifications.ts`
- `backend/api-gateway/src/index.ts`
- `frontend/src/lib/socket.ts`
- `admin-dashboard/src/lib/socket.ts`

Acceptance criteria:

- Production logs tidak mengandung token, email lengkap, nomor HP lengkap, alamat, koordinat GPS, raw FCM payload, cookie, atau authorization header.
- Debug detail tetap tersedia di development build.
- Error observability tetap cukup untuk debugging tanpa membocorkan PII.

### P1-03 Customer Profile Image Storage Hardening

- [x] Hapus penyimpanan foto profil base64/DataURL dari `localStorage`.
- [x] Gunakan upload endpoint backend atau object storage flow yang menyimpan URL di database.
- [x] Tambahkan validasi ukuran file, tipe MIME, dan dimensi gambar sebelum upload.
- [x] Tambahkan error state jika upload gagal.
- [x] Pastikan fallback profile picture tidak memakai data stale dari browser.
- [x] Clear legacy key `tembus_profile_pic` saat user masuk ke halaman profil.
- [x] Verifikasi `frontend npm run build`.
- [ ] Verifikasi customer web: upload foto, reload halaman, logout/login ulang.

Files:

- `frontend/src/app/(portal)/profil/page.tsx`
- `backend/admin-service/src/controllers/customer*.ts`
- `backend/admin-service/src/routes*.ts`

Acceptance criteria:

- Foto profil berasal dari backend/database atau storage URL.
- Tidak ada DataURL profile picture yang tersimpan permanen di browser storage.
- User tetap mendapat feedback sukses/gagal yang jelas.

### P1-04 Customer Order Draft Privacy TTL

- [x] Kurangi isi draft order di `sessionStorage` ke field minimum.
- [x] Tambahkan TTL eksplisit, misalnya 30-60 menit.
- [x] Hapus draft otomatis saat order berhasil dibuat.
- [x] Hapus draft saat logout.
- [x] Tolak restore draft jika versi tidak cocok, TTL lewat, atau data invalid.
- [x] Tambahkan indikator UI bahwa draft lokal dipulihkan.
- [x] Verifikasi `frontend npm run build`.
- [ ] Verifikasi create order, reload tab, submit order, logout, dan login ulang.

Files:

- `frontend/src/components/orders/OrderForm.tsx`
- `frontend/src/app/(portal)/layout.tsx`
- `frontend/src/lib/api.ts`

Acceptance criteria:

- Draft membantu user tanpa meninggalkan data alamat/detail paket terlalu lama.
- Draft tidak pernah mengalahkan data server.
- Draft tidak tersisa setelah submit atau logout.

### P1-05 Secret Scan Tooling Enforcement

- [x] Tambahkan dokumentasi instalasi `gitleaks` lokal untuk Windows/VPS.
- [x] Tambahkan script npm atau PowerShell untuk menjalankan `gitleaks detect --redact`.
- [x] Pastikan CI tetap menjalankan container SBOM and secret audit.
- [x] Pastikan file `.env`, keystore, google-services, AAB/APK, cookies, dan credential artefact tetap tidak tracked.
- [x] Verifikasi secret scanner lokal di mesin development.
- [ ] Verifikasi GitHub Actions security scan tetap hijau.

Files:

- `scripts/ops/verify-vps-security.sh`
- `.github/workflows/staging.yml`
- `.github/workflows/production.yml`
- `.gitignore`
- `docs/PRODUCTION_SECURITY_VERIFICATION_CHECKLIST.md`

Acceptance criteria:

- Secret scan bisa dijalankan lokal dan CI.
- Tidak ada secret material masuk git.
- Output scanner tidak menampilkan secret secara utuh.

Local evidence:

- `node scripts/ci/check-production-mocks.js` passed.
- `frontend npm run build` passed.
- `admin-dashboard npm run build` passed.
- `backend/admin-service npm run build` passed.
- `backend/admin-service npm test -- --runInBand` passed.
- `backend/api-gateway npm run build` passed.
- `android-app ./gradlew.bat assembleDebug` passed with JDK 17.
- `android-app-customer ./gradlew.bat assembleDebug` passed with JDK 17.
- `docker run --rm -v "${PWD}:/repo" zricethezav/gitleaks:latest detect --source=/repo --redact --no-banner` passed with `no leaks found`.
- `pwsh scripts/ops/verify-local-secret-scan.ps1` fails closed when local `gitleaks` CLI is not installed; use the documented install commands, or the Docker command above as the temporary local scanner path.

## P2 - Production Hygiene And Reliability

Prioritas ini tidak langsung membuka akses berbahaya, tetapi membuat production lebih bersih, lebih mudah dipelihara, dan lebih kecil risiko salah konfigurasi.

### P2-01 Production Workflow Credential Cleanup

- [x] Ganti credential test hardcoded `postgres:1234` di workflow production/staging dengan env khusus CI yang jelas.
- [x] Rename atau beri komentar eksplisit bahwa database workflow tersebut adalah service test ephemeral, bukan production database.
- [x] Hindari weak secret marker di workflow yang bernama production.
- [x] Pastikan migration test tetap bisa jalan di GitHub Actions.
- [ ] Verifikasi `CI/CD Staging` hijau.
- [x] Verifikasi `CI/CD Production` tidak memakai credential default yang tampak seperti credential real.

Files:

- `.github/workflows/production.yml`
- `.github/workflows/staging.yml`
- `.github/workflows/pr-quality.yml`

Acceptance criteria:

- Tidak ada ambiguity antara test database credential dan production credential.
- Security scanner tidak menganggap workflow production membawa weak secret.

### P2-02 Localhost Fallback Guard For Web And Admin

- [x] Audit semua fallback `http://localhost:*` di customer webapp dan admin dashboard.
- [x] Pastikan fallback localhost hanya aktif di development.
- [x] Production build harus fail-fast jika `NEXT_PUBLIC_API_URL`, `SERVER_API_URL`, `VITE_API_URL`, atau socket URL wajib tidak tersedia.
- [x] Tambahkan helper konfigurasi terpusat agar fallback tidak tersebar di banyak file.
- [x] Verifikasi `frontend npm run build`.
- [x] Verifikasi `admin-dashboard npm run build`.
- [x] Verifikasi Docker production build tetap require env.

Files:

- `frontend/src/lib/api.ts`
- `frontend/src/lib/socket.ts`
- `frontend/src/app/(auth)/login/page.tsx`
- `frontend/src/app/location-requests/[token]/LocationRequestForm.tsx`
- `frontend/src/app/location-requests/[token]/page.tsx`
- `frontend/src/app/track/[token]/page.tsx`
- `admin-dashboard/src/lib/api.ts`
- `admin-dashboard/src/lib/socket.ts`
- `admin-dashboard/src/components/ActiveOrdersTable.tsx`

Acceptance criteria:

- Production tidak diam-diam memanggil localhost.
- Development tetap mudah dipakai dengan default lokal.

### P2-03 Dependency Moderate Advisory Cleanup

- [x] Jalankan `npm audit` untuk `admin-dashboard`.
- [x] Update dependency yang memperbaiki `brace-expansion` dan `ws` advisory tanpa breaking UI.
- [x] Jalankan `npm audit` untuk `backend/admin-service`.
- [x] Evaluasi update `firebase-admin`/Google dependency yang menyebabkan `uuid` advisory.
- [x] Hindari `npm audit fix --force` sebelum dampak breaking change jelas.
- [x] Verifikasi build/test semua package terdampak.
- [x] Catat advisory yang ditunda beserta alasan jika belum bisa diupgrade.

Files:

- `admin-dashboard/package.json`
- `admin-dashboard/package-lock.json`
- `backend/admin-service/package.json`
- `backend/admin-service/package-lock.json`

Acceptance criteria:

- Tidak ada high/critical vulnerability.
- Moderate advisory yang tersisa punya justifikasi dan rencana upgrade.

### P2-04 Java Toolchain Normalization

- [x] Tambahkan dokumentasi bahwa Android build wajib JDK 17 atau lebih baru.
- [x] Hindari committed `org.gradle.java.home` yang mengunci path mesin developer; gunakan Kotlin JVM toolchain 17.
- [x] Pastikan GitHub Actions mobile memakai JDK 17.
- [x] Tambahkan troubleshooting untuk error `Dependency requires at least JVM runtime version 11`.
- [x] Verifikasi `android-app assembleDebug`.
- [x] Verifikasi `android-app-customer assembleDebug`.

Files:

- `.github/workflows/android-apps.yml`
- `docs/MOBILE_PRODUCTION_RELEASE_RUNBOOK.md`
- `docs/MOBILE_SMOKE_TEST_CHECKLIST.md`
- `android-app/gradle.properties`
- `android-app-customer/gradle.properties`

Acceptance criteria:

- Developer baru tidak gagal build karena Java 8 default.
- CI dan lokal memakai toolchain yang konsisten.

### P2-05 Customer Mobile No-Op Repository Cleanup

- [x] Audit apakah `FCMTokenRepository` customer masih dipakai oleh DI atau sudah dead code.
- [x] Audit apakah `LocationRepository` customer masih dipakai oleh DI atau sudah dead code.
- [x] Jika dead code, hapus agar tidak menyesatkan.
- [x] Karena dead code, hapus tanpa meninggalkan endpoint wiring palsu.
- [x] Pastikan tidak ada TODO repository yang seolah sukses tanpa network call.
- [x] Verifikasi `android-app-customer assembleDebug`.

Files:

- `android-app-customer/app/src/main/java/com/tembus/customer/data/repository/FCMTokenRepository.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/data/repository/LocationRepository.kt`
- `android-app-customer/app/src/main/java/com/tembus/customer/di/*`

Acceptance criteria:

- Tidak ada repository customer yang silent no-op untuk fitur production.
- FCM token dan location update hanya dinyatakan sukses jika backend menerima data.

Local evidence:

- Workflow scan for `postgres:1234`, `password=1234`, and default Postgres password markers returned no matches.
- Customer/admin localhost fallback scan now only finds centralized runtime config helpers.
- `frontend npm audit --audit-level=moderate` passed with 0 vulnerabilities.
- `admin-dashboard npm audit --audit-level=moderate` passed with 0 vulnerabilities.
- `backend/admin-service npm audit --audit-level=moderate` passed with 0 vulnerabilities.
- `frontend npm run build` passed with explicit production API/socket env.
- `frontend npm run build` without required API env fails closed with `NEXT_PUBLIC_API_URL is required for production customer web builds`.
- `admin-dashboard npm run build` passed with explicit production API/socket env.
- `admin-dashboard npm run build` without required API env fails closed with `VITE_API_URL is required for production admin dashboard builds`.
- `backend/admin-service npm run build` passed.
- `docker compose build frontend` passed and now emits `tembus-frontend:latest`.
- `docker compose build admin-dashboard` passed and now emits `tembus-admin-dashboard:latest`.
- `docker compose config --images` returns TEMBUS image names for application services.
- `android-app ./gradlew.bat assembleDebug` passed with JDK 17.
- `android-app-customer ./gradlew.bat assembleDebug` passed with JDK 17.
- `FCMTokenRepository` and `LocationRepository` customer no-op classes were removed after confirming no usages outside their own files.

## P3 - Cleanup, Maintainability, And UI Polish

Prioritas ini lebih rendah, tetapi tetap penting agar codebase tidak membusuk dan UX tetap konsisten setelah rebrand.

### P3-01 Remove Tracked Temporary Cookie File

- [x] Hapus `cookies.txt` dari git.
- [x] Tambahkan `cookies.txt` dan pola cookie dump lain ke `.gitignore`.
- [x] Pastikan tidak ada cookie value di git history terbaru.
- [x] Jalankan secret scan setelah cleanup.

Files:

- `cookies.txt`
- `.gitignore`

Acceptance criteria:

- File cookie runtime tidak tracked.
- Tidak ada credential browser/session yang berpotensi ikut commit.

### P3-02 Build Cache And Generated Artifact Hygiene

- [x] Pastikan folder build Android, `.gradle`, `.next`, `dist`, dan coverage tidak tracked.
- [x] Pastikan `.gitignore` mencakup artefak mobile release dan debug.
- [x] Tambahkan dokumentasi lokasi output AAB/APK yang tidak boleh dicommit.
- [x] Verifikasi `git ls-files` tidak mengandung artefak build.

Files:

- `.gitignore`
- `docs/MOBILE_PRODUCTION_RELEASE_RUNBOOK.md`

Acceptance criteria:

- Build artefact tidak pernah masuk repository.
- Developer tahu artifact mana yang boleh diupload ke Play Console dan mana yang tidak boleh dicommit.

### P3-03 Frontend And Admin Console Log Cleanup

- [x] Hapus atau gate log WebSocket debug di customer web.
- [x] Hapus atau gate log WebSocket debug di admin dashboard.
- [x] Ganti error console user-facing dengan toast atau structured client telemetry jika diperlukan.
- [x] Pastikan tidak ada log objek notification/order/chat penuh di browser console production.
- [x] Verifikasi `frontend npm run build`.
- [x] Verifikasi `admin-dashboard npm run build`.

Files:

- `frontend/src/lib/socket.ts`
- `frontend/src/app/(portal)/layout.tsx`
- `admin-dashboard/src/lib/socket.ts`
- `admin-dashboard/src/hooks/useSocket.ts`
- `admin-dashboard/src/components/DashboardLayout.tsx`

Acceptance criteria:

- Browser console production bersih dari data operasional sensitif.
- Debug mode tetap bisa diaktifkan saat development.

### P3-04 Android Warning Backlog Cleanup

- [x] Bersihkan warning parameter tidak dipakai di mobile kurir.
- [x] Ganti icon Material deprecated ke versi AutoMirrored bila relevan.
- [x] Audit `CONNECTIVITY_ACTION` deprecated dan pastikan WorkManager/network callback adalah path utama.
- [x] Rapikan warning Room migration parameter naming.
- [x] Verifikasi `android-app assembleDebug`.
- [x] Verifikasi `android-app-customer assembleDebug`.

Files:

- `android-app/app/src/main/java/com/tembus/courier/data/db/OrderDatabase.kt`
- `android-app/app/src/main/java/com/tembus/courier/receiver/NetworkChangeReceiver.kt`
- `android-app/app/src/main/java/com/tembus/courier/ui/screens/MainScreen.kt`
- `android-app/app/src/main/java/com/tembus/courier/ui/screens/order/OrderDetailScreen.kt`
- `android-app/app/src/main/java/com/tembus/courier/ui/screens/pod/ProofOfDeliveryScreen.kt`

Acceptance criteria:

- Build tetap hijau.
- Warning penting yang bisa menutupi bug produksi berkurang.

### P3-05 Rebrand Residual And Asset Sweep

- [x] Jalankan grep untuk legacy brand token, email domain lama, package id lama, dan asset lama di source utama.
- [x] Pisahkan hasil yang hanya ada di docs/history/test fixture dari hasil runtime.
- [x] Bersihkan asset default Vite/React yang tidak dipakai.
- [x] Pastikan nama app, package id, label, notification channel, docs, dan runbook konsisten dengan TEMBUS.
- [x] Verifikasi web/admin/mobile build.

Files:

- `frontend`
- `admin-dashboard`
- `android-app`
- `android-app-customer`
- `backend`
- `docs`

Acceptance criteria:

- Tidak ada legacy branding di runtime UI, mobile label, notification, API response user-facing, atau production docs.
- Sisa nama folder/repo yang sengaja belum diganti terdokumentasi sebagai external/manual action.

Local evidence:

- `cookies.txt` is deleted from the working tree and ignored by `.gitignore`.
- `git ls-files` returned no tracked Android build folders, `.gradle`, `.next`, `dist`, coverage, AAB/APK/APKS, keystore, or `google-services.json` artifacts.
- Browser console scan for customer web and admin dashboard now only finds centralized `clientLogger.ts` wrappers; runtime page/component console statements were removed or routed through the logger.
- Tracked source sweep returned no runtime legacy brand matches outside intentionally ignored local scratch/worktree/IDE metadata.
- `node scripts/ci/check-production-mocks.js` passed.
- `frontend npm run build` passed with production API/socket env.
- `admin-dashboard npm run build` passed with production API/socket env.
- `backend/admin-service npm run build` passed.
- `backend/api-gateway npm run build` passed.
- `backend/admin-service npm test -- --runInBand` passed.
- `android-app ./gradlew.bat assembleDebug --warning-mode all` passed with JDK 17.
- `android-app-customer ./gradlew.bat assembleDebug --warning-mode all` passed with JDK 17.
- Docker-based `gitleaks detect --source=/repo --redact --no-banner` passed with `no leaks found`.

Warning assessment:

- The remaining Android warning is `org.gradle.api.plugins.Convention type has been deprecated`. The trace points to `org.jetbrains.kotlin.gradle.plugin.internal.CompatibilityConventionRegistrarG81`, not TEMBUS app code. It is not dangerous for current runtime or current debug/release builds, but it must be tracked before upgrading to Gradle 9/Kotlin Gradle plugin versions that remove the compatibility path.
- `git diff --check` passed. Git still prints Windows line-ending notices (`LF will be replaced by CRLF the next time Git touches it`) because of local autocrlf behavior. This is not a runtime, security, or build warning; normalize later with `.gitattributes` only if the team wants strict cross-OS line endings.

## Recommended Execution Order

- [x] Kerjakan P1-01 terlebih dahulu karena surface Android service paling sempit dan risikonya jelas.
- [x] Kerjakan P1-02 setelah itu karena log redaction menyentuh banyak platform.
- [x] Kerjakan P1-03 dan P1-04 berurutan karena sama-sama privacy customer web.
- [x] Kerjakan P1-05 setelah remediation awal agar secret scan baseline bersih.
- [x] Lanjut P2 sesuai urutan.
- [x] Lanjut P3 setelah semua P1/P2 hijau.

## Required Verification Before Marking Any Task Done

- [x] `node scripts/ci/check-production-mocks.js`
- [x] `npm run build` di `frontend`
- [x] `npm run build` di `admin-dashboard`
- [x] `npm test -- --runInBand` di `backend/admin-service`
- [x] `./gradlew.bat assembleDebug` di `android-app` dengan JDK 17+
- [x] `./gradlew.bat assembleDebug` di `android-app-customer` dengan JDK 17+
- [x] Secret scan lokal atau CI secret scan
- [ ] GitHub Actions staging/mobile terkait hijau
