---
task_id: MERCHANT-UI-2026-001
status: COMPLETE

reality_2026_003: PASS
reality_2026_011: PASS

implementation_ref: "b6ceba70"

tests: PASS
integration: PASS
e2e: PASS

migration: PASS
migration_na_reason: N/A

observability: N/A
security_privacy: PASS
rollback_recovery: PASS

task_scope_external_proof_required: false
external_runtime_validation: NOT_RUN

release_readiness: PARTIAL
release_followups: "Push staging branch, apply 20261003000001_merchant_public_profile.sql in the staging database, then run an authenticated staging smoke for edit, reload, and image upload."

unproven_requirements: NONE
known_blockers: NONE

locally_actionable_remaining: NONE
blocker_resolution_attempts: "Inspected the Figma screen, existing merchant branch/profile contracts, local PostgreSQL, Android emulator, and runtime logs; implemented and reverified the full local flow."
unblock_condition: NONE

owner_action_required: false
owner_action_summary: NONE
verification_after_unblock: NONE

dependency_chain_blocked: false
next_eligible_task: NONE

updated_at: 2026-10-03
---

# Evidence — Merchant public profile editor

## Acceptance Criteria Source

User-requested scope:

- Edit profile merchant harus mengikuti layout Figma node `2-2414`, termasuk safe area, header, banner, foto toko, status usaha, informasi dasar, kategori, deskripsi, alamat, jam operasional, dan tombol simpan.
- Semua data yang dapat diedit harus bersumber dari database dan tersimpan kembali melalui API; tidak memakai mock atau hardcode sebagai sumber data.
- Jika metadata profil belum tersedia, aplikasi harus menampilkan empty state yang jelas dan menyediakan alur pengisian.

## Scope Implemented

- Menambahkan tabel `merchant_profile_details` untuk deskripsi singkat, maksimal lima kategori utama, banner, dan logo toko; migrasi mengisi record kosong untuk merchant lama tanpa membuat data tampilan palsu.
- Menggunakan `merchant_branches` sebagai sumber nama outlet/cabang dan alamat cabang utama.
- Memperluas GET/PATCH profil merchant dengan validasi server-side untuk panjang nama, alamat, deskripsi, kategori, dan URL aset.
- Menambahkan UI Compose yang mengikuti Figma: header `Ubah Profil Toko`, banner dan logo kosong/terisi, status aktif, nama resmi terkunci untuk merchant terverifikasi, outlet editable, kategori chips, deskripsi 200 karakter, alamat, jam operasional, dan simpan.
- Menggunakan endpoint upload foto yang sudah ada; hasil URL upload disimpan pada profil merchant, bukan disimpan sebagai state lokal saja.
- Menghapus copy teknis dari layar baru; UI menggunakan bahasa pengguna seperti “Informasi toko” dan empty state yang jelas.

## Files Changed

- `database/migrations/20261003000001_merchant_public_profile.sql` — tabel metadata publik profil dan seed record kosong.
- `backend/merchant-service/internal/domain/merchant.go` — kontrak response metadata profil/cabang.
- `backend/merchant-service/internal/domain/requests.go` — kontrak PATCH profil.
- `backend/merchant-service/internal/repository/postgres_merchant_repository.go` — projection branch/profile serta update transaksional.
- `backend/merchant-service/internal/service/merchant_service.go` — validasi dan normalisasi input profil.
- `android-app-merchant/app/src/main/java/com/tembus/merchant/data/model/MerchantModels.kt` — model response/request baru.
- `android-app-merchant/app/src/main/java/com/tembus/merchant/ui/screens/profile/ProfileViewModel.kt` — upload dan simpan profil.
- `android-app-merchant/app/src/main/java/com/tembus/merchant/ui/screens/profile/MerchantZipSupportScreens.kt` — implementasi halaman edit profil sesuai Figma.

## Commands / Checks Run

    command: cd backend/merchant-service; go test ./...
    result: PASS

    command: cd android-app-merchant; .\\gradlew.bat :app:assembleDebug :app:testDebugUnitTest --no-daemon
    result: PASS — APK debug berhasil dibuat dan unit test selesai.

    command: git diff --check
    result: PASS

    command: adb -s emulator-5554 install -r app\\build\\outputs\\apk\\debug\\app-debug.apk
    result: PASS — APK terpasang.

    tool: Android emulator `emulator-5554`
    result: PASS — aplikasi dibuka, halaman Profile dibuka, halaman `Ubah Profil Toko` tampil, halaman discroll hingga tombol simpan, lalu simpan berhasil menampilkan `Profil toko berhasil disimpan`.

    command: local merchant-service HTTP smoke on port 18085 with local PostgreSQL
    result: PASS — GET profile mengembalikan `branch_id`, `branch_code`, `outlet_name`, `short_description`, dan `primary_categories: []`; PATCH menyimpan perubahan dan GET berikutnya membaca nilai yang tersimpan.

    command: psql local PostgreSQL profile projection query
    result: PASS — row merchant tersimpan pada `merchant_profile_details`, kategori kosong dikembalikan sebagai array kosong, dan foreign-key merchant aktif.

    command: local migration down/up and constraint check for `20261003000001_merchant_public_profile.sql`
    result: PASS — tabel dijatuhkan dan dibuat ulang pada database lokal, record merchant lama diseed ulang, index dibuat, dan constraint menolak enam kategori.

    command: adb -s emulator-5554 logcat -d -t 600
    result: PASS — tidak ada `FATAL EXCEPTION` atau crash `com.tembus.merchant` pada launch dan save flow.

## Task-Local Verification

### Tests

Status: `PASS`

Evidence: Go tests merchant-service dan Gradle unit tests Android selesai tanpa error.

### Integration

Status: `PASS`

Evidence: Handler/service/repository lokal memakai PostgreSQL nyata. Data cabang utama dan metadata publik dibaca dari database; PATCH mengubah data melalui transaksi repository.

### E2E

Status: `PASS`

Evidence: Emulator membuka aplikasi, masuk ke Profile, membuka edit profil, menampilkan empty state tanpa mock, scroll ke bagian bawah, dan menjalankan aksi simpan tanpa crash.

### Migration

Status: `PASS`

Evidence: Down/up lokal dan constraint maksimal lima kategori terverifikasi. Deployment migration ke staging masih merupakan follow-up release.

### Observability

Status: `N/A`

Evidence: Perubahan ini tidak menambah jalur observability baru; request PATCH tetap memakai audit/request logging merchant-service yang sudah ada.

### Security / Privacy

Status: `PASS`

Evidence: Validasi ukuran teks, batas kategori, batas URL, dan scheme HTTP/HTTPS dilakukan server-side. Tidak ada credential atau data rahasia baru di source/evidence.

### Rollback / Recovery

Status: `PASS`

Evidence: Down migration berhasil menghapus tabel metadata profil pada database lokal dan up migration berhasil membuat ulang tabel beserta seed record merchant lama.

## Reality Gate Evaluation

- `REALITY-2026-003`: `PASS` — bukti UI emulator, API, database, migration, dan runtime log tersedia.
- `REALITY-2026-011`: `PASS` — tidak ada klaim staging/production; status release readiness dipisahkan dan masih menunggu deployment migration serta smoke staging.

## Unproven / Remaining

- Belum ada verifikasi staging setelah branch dan migration ini dideploy. Ini bukan blocker task-local; menjadi follow-up release readiness.
- Upload banner/logo belum dibuktikan dengan file gambar aktual pada staging. Endpoint dan penyimpanan URL sudah terhubung pada aplikasi dan API lokal.
