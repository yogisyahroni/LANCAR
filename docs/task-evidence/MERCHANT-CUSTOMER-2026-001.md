---
task_id: MERCHANT-CUSTOMER-2026-001
status: COMPLETE

reality_2026_003: PASS
reality_2026_011: PASS

implementation_ref: "a1b876a0"

tests: PASS
integration: PASS
e2e: PASS

migration: PASS
migration_na_reason: "Reuses the already implemented merchant_profile_details migration; no new schema change was introduced."

observability: N/A
security_privacy: PASS
rollback_recovery: N/A

task_scope_external_proof_required: false
external_runtime_validation: NOT_RUN

release_readiness: PARTIAL
release_followups: "Deploy the already-pushed profile migration and rebuilt order-service to staging, then run an authenticated customer detail smoke with a real merchant banner URL."

unproven_requirements: NONE
known_blockers: NONE

locally_actionable_remaining: NONE
blocker_resolution_attempts: "Inspected merchant profile ownership, rebuilt the local order-service image, authenticated as a local customer, exercised the merchant detail endpoint with a temporary database banner value, restored the fixture, built the customer APK, installed it, and checked runtime logs."
unblock_condition: NONE

owner_action_required: false
owner_action_summary: NONE
verification_after_unblock: NONE

dependency_chain_blocked: false
next_eligible_task: NONE

updated_at: 2026-10-03
---

# Evidence — Merchant banner to customer food detail

## Acceptance Criteria Source

User-requested scope:

- Banner yang diubah/disimpan dari Merchant App harus tampil ketika customer membuka halaman penjual food.
- Data harus bersumber dari database dan mengalir end to end melalui backend ke customer app; tidak boleh memakai mock atau hardcode.
- Record lama tanpa banner tetap memiliki fallback visual yang tidak menghasilkan layar rusak.

## Scope Implemented

- `order-service` membaca `banner_url` dan `logo_url` dari `merchant_profile_details` pada detail merchant food.
- Kontrak `FoodMerchantInfo` dan model `FoodMerchant` customer membawa kedua field tersebut.
- Customer merchant detail memakai `banner_url` sebagai hero utama, lalu fallback ke `image_url`, foto menu pertama, dan placeholder commerce yang sudah ada.
- Safe area, deskripsi gambar, dan fallback existing tetap dipertahankan; perubahan tidak membuat data media lokal/mock.

## Files Changed

- `backend/order-service/internal/domain/order_food.go` — kontrak JSON media profil publik.
- `backend/order-service/internal/repository/food_repository.go` — projection database dan scan `banner_url`/`logo_url`.
- `backend/order-service/internal/repository/food_repository_media_test.go` — regression test query/pemetaan media.
- `android-app-customer/app/src/main/java/com/tembus/customer/data/model/FoodModels.kt` — decode media profil.
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/food/MerchantDetailScreen.kt` — prioritas hero banner dan fallback.
- `android-app-customer/app/src/test/java/com/tembus/customer/ui/designsystem/commerce/TembusCommerceModelTest.kt` — test decode payload media.

## Commands / Checks Run

    command: cd backend/order-service; go test ./...
    result: PASS

    command: cd android-app-customer; .\gradlew.bat :app:assembleDebug --no-daemon
    result: PASS — APK debug customer berhasil dibuat.

    command: cd android-app-customer; .\gradlew.bat :app:testDebugUnitTest --no-daemon
    result: PASS

    command: docker compose build order-service; docker compose up -d --no-deps order-service
    result: PASS — image dibangun dari source perubahan dan container healthy.

    command: authenticated local HTTP smoke pada GET /api/v1/food/merchants/{id}
    result: PASS — setelah fixture lokal diberi banner URL sementara, response detail mengembalikan URL tersebut; fixture dipulihkan ke NULL setelah smoke.

    command: adb install -r -d app\build\outputs\apk\debug\app-debug.apk; adb shell monkey -p com.tembus.customer 1
    result: PASS — APK terpasang di `emulator-5554`, `MainActivity` aktif.

    command: adb logcat -d -s AndroidRuntime:E
    result: PASS — tidak ada `FATAL EXCEPTION` untuk `com.tembus.customer` pada launch.

    command: git diff --check
    result: PASS

## Task-Local Verification

### Tests

Status: `PASS`

Evidence: order-service full Go test dan customer Gradle unit test lulus, termasuk regression test projection dan decode `banner_url`/`logo_url`.

### Integration

Status: `PASS`

Evidence: order-service image lokal dibangun ulang, container healthy, lalu endpoint detail terautentikasi membaca URL banner dari tabel PostgreSQL yang sama dengan profile merchant. Nilai fixture sementara dipulihkan setelah smoke.

### E2E

Status: `PASS`

Evidence: customer debug APK terpasang dan `MainActivity` aktif di `emulator-5554` tanpa fatal exception. Payload media juga dibuktikan melalui endpoint detail customer-facing. Staging UI smoke masih follow-up release dan tidak diklaim sebagai PASS di sini.

### Migration

Status: `PASS`

Evidence: tidak ada migration baru; implementasi menggunakan tabel `merchant_profile_details` yang sudah dibuat oleh `20261003000001_merchant_public_profile.sql` dan keberadaan tabel/row terverifikasi pada database lokal order-service.

### Observability

Status: `N/A`

Evidence: perubahan hanya menambah projection data publik dan fallback UI; tidak menambah worker atau jalur observability baru.

### Security / Privacy

Status: `PASS`

Evidence: hanya URL media publik yang diproyeksikan; smoke memakai akun fixture lokal dan tidak menyimpan token/credential pada source atau evidence.

### Rollback / Recovery

Status: `N/A`

Evidence: tidak ada perubahan schema baru atau destructive migration pada task ini; fallback customer mempertahankan perilaku record lama.

## Reality Gate Evaluation

- `REALITY-2026-003`: `PASS` — implementasi, unit/regression test, database-backed HTTP smoke, APK build/install, dan runtime log tersedia.
- `REALITY-2026-011`: `PASS` — staging belum diklaim live; status release readiness dipisahkan dari task-local completion.

## Release Follow-up

- Branch `staging` perlu menerima commit ini dan deployment pipeline perlu membangun order-service terbaru.
- Migration profil publik harus sudah diterapkan pada database staging sebelum container order-service baru dijalankan.
- Setelah deploy, jalankan authenticated customer smoke memakai URL banner nyata dari merchant profile. Hasil staging tidak otomatis mengikuti hasil local smoke.
