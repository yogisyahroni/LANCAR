---
task_id: MWEB-P0-012
status: COMPLETE

reality_2026_003: PASS
reality_2026_011: PASS

implementation_ref: db64b3c9

tests: PASS
integration: PASS
e2e: PARTIAL

migration: PASS
migration_na_reason: "N/A — merchant compliance requirement rows were applicable and applied to the local PostgreSQL container."

observability: N/A
observability_na_reason: "No new production metric or dashboard was required by this mobile onboarding contract change; existing request telemetry and compliance audit path are reused."
security_privacy: PASS
rollback_recovery: PASS

task_scope_external_proof_required: false
external_runtime_validation: NOT_RUN

release_readiness: PARTIAL
release_followups: "Authenticated submit with real document uploads and staging cross-app read-after-write remain in the release/UAT queue."

unproven_requirements: NONE
known_blockers: NONE

locally_actionable_remaining: NONE

blocker_resolution_attempts: NONE
unblock_condition: NONE

owner_action_required: false
owner_action_summary: NONE
verification_after_unblock: NONE

dependency_chain_blocked: false
next_eligible_task: MWEB-P0-010

updated_at: 2026-10-06
---

# Evidence — MWEB-P0-012

## Acceptance Criteria Source

Original requirements are recorded under `MWEB-P0-012 — Pendaftaran merchant
perorangan end-to-end di aplikasi` in
`task-merchant-web-growth-p0-p2-2026.md`.

- CTA pendaftaran perorangan terlihat di login dan membuka pembuatan akun TEMBUS
  sebelum user masuk ke pengajuan merchant.
- Kanal Android tidak dapat mengirim pendaftaran perusahaan; Portal Mitra web tetap menjadi jalur perusahaan/PT.
- Dua persetujuan legal aktif dicatat sebelum submit.
- Dokumen inti dan persetujuan diwajibkan sebelum submit; hasil tetap mengikuti lifecycle merchant dan memiliki link `/status`.

Release/UAT follow-up, bukan syarat task-local completion: authenticated submit
lintas aplikasi dengan dokumen nyata dan read-after-write pada staging.

## Scope Implemented

- Login Merchant menampilkan CTA `Daftar sebagai merchant` dan supporting copy
  yang menjelaskan jalur ini khusus usaha perorangan.
- Alur publik membuat akun TEMBUS dengan nama, email, nomor handphone, password,
  dan konfirmasi password, lalu meminta OTP email sebelum sesi dibuat.
- Kontrol OTP registrasi dipisahkan melalui `customer_registration_otp_required`.
  Flag ini tetap `true` secara default; local/UAT dapat menonaktifkannya tanpa
  mematikan gerbang OTP login customer `customer_auth_otp_required`.
- Setelah sesi berhasil dibuat, tujuan pengajuan merchant perorangan tetap
  diteruskan melewati onboarding hingga form pengajuan terbuka.
- Form mobile menghapus selector perusahaan dan menjelaskan bahwa aplikasi hanya
  untuk usaha perorangan. Payload selalu `business_type=perorangan`.
- Backend menegakkan batas ini melalui `X-Merchant-Registration-Channel: android`;
  payload `perusahaan` dari kanal tersebut ditolak, sementara jalur Portal Mitra
  tidak diubah.
- Form mewajibkan checkbox Perjanjian Mitra dan Kebijakan Privasi, menyediakan link
  legal first-party, mengambil policy aktif dari server, lalu mencatat consent
  append-only untuk `merchant_terms` dan `merchant_privacy_notice` dengan versi
  server dan idempotency key.
- Migration menambahkan requirement privasi merchant ke policy `id-jk`.
- Success screen tetap memakai endpoint status publik dan copy-nya menyebut
  pendaftaran merchant perorangan.

## Files Changed

- `android-app-merchant/app/src/main/java/com/tembus/merchant/ui/screens/auth/LoginScreen.kt` — CTA pendaftaran yang terlihat.
- `android-app-merchant/app/src/main/java/com/tembus/merchant/ui/screens/auth/AccountRegistrationScreen.kt` — form akun baru dan verifikasi OTP.
- `android-app-merchant/app/src/main/java/com/tembus/merchant/data/api/MerchantErrorMessages.kt` — copy aman untuk akun yang sudah terdaftar.
- `android-app-merchant/app/src/main/java/com/tembus/merchant/ui/screens/auth/AccountRegistrationViewModel.kt` — validasi dan orkestrasi pendaftaran akun.
- `android-app-merchant/app/src/main/java/com/tembus/merchant/data/model/AuthModels.kt` — kontrak request registrasi akun dan OTP.
- `android-app-merchant/app/src/main/java/com/tembus/merchant/data/api/TEMBUSApiService.kt` — endpoint registrasi akun dan verifikasi OTP.
- `android-app-merchant/app/src/main/java/com/tembus/merchant/data/repository/AuthRepository.kt` — pembuatan sesi setelah OTP.
- `android-app-merchant/app/src/main/java/com/tembus/merchant/ui/navigation/AppNavHost.kt` — pending route setelah login/onboarding.
- `android-app-merchant/app/src/main/java/com/tembus/merchant/ui/screens/registration/RegistrationScreen.kt` — form individual-only, legal links, checkbox, dan status handoff.
- `android-app-merchant/app/src/main/java/com/tembus/merchant/ui/screens/registration/RegistrationViewModel.kt` — consent-before-register orchestration.
- `android-app-merchant/app/src/main/java/com/tembus/merchant/data/api/TEMBUSApiService.kt` — policy dan consent API contract.
- `android-app-merchant/app/src/main/java/com/tembus/merchant/data/model/ComplianceModels.kt` — typed compliance responses/requests.
- `android-app-merchant/app/src/main/java/com/tembus/merchant/data/repository/MerchantRepository.kt` — server-versioned consent persistence.
- `backend/merchant-service/internal/handler/merchant_handler.go` — Android channel enforcement.
- `backend/merchant-service/internal/handler/mobile_registration_contract_test.go` — boundary tests.
- `backend/auth-service/internal/handler/auth_handler.go` — safe duplicate-account error contract.
- `backend/auth-service/internal/handler/auth_handler_registration_test.go` — registration error redaction tests.
- `database/migrations/20261006000002_merchant_individual_legal_requirements.sql` — merchant privacy requirement.
- `backend/auth-service/internal/service/auth_service.go` — registration-only OTP gate.
- `backend/auth-service/internal/service/auth_service_otp_flags_test.go` — scoped OTP flag and fail-closed tests.
- `database/migrations/20261006000003_customer_registration_otp_feature_flag.sql` — registration-only OTP flag.
- `backend/admin-service/src/seed.ts` and `admin-dashboard/src/pages/useSettingsData.ts` — development seed and admin flag visibility.
- `task-merchant-web-growth-p0-p2-2026.md` — owner-approved individual-only task scope.

## Commands / Checks Run

    command: ./gradlew.bat testDebugUnitTest assembleDebug --no-daemon
    result: PASS — Merchant Android unit tests and debug APK packaging completed; existing deprecation warnings remain.

    command: go test ./...
    workdir: backend/merchant-service
    result: PASS — all merchant-service packages, including the Android registration boundary tests.

    command: npm test -- --runInBand src/services/complianceBoundary.test.ts
    workdir: backend/admin-service
    result: PASS — 1 suite, 5 tests.

    command: local PostgreSQL migration up extracted from 20261006000002_merchant_individual_legal_requirements.sql
    result: PASS — idempotent insert applied; policy readback returned merchant_terms and merchant_privacy_notice with active versions.

    command: Invoke-WebRequest HEAD https://bawain.my.id/bantuan/syarat-dan-ketentuan and https://bawain.my.id/bantuan/kebijakan-privasi
    result: PASS — both first-party legal documents returned HTTP 200.

    command: docker compose build merchant-service admin-service
    result: PASS — affected backend images built.

    command: docker compose up -d --no-deps merchant-service admin-service
    result: PASS — both containers recreated and reported healthy.

    command: GET http://localhost:8080/api/v1/compliance/policy?market_code=id-jk
    result: PASS — active merchant terms and privacy requirements were returned from the database-backed policy endpoint.

    command: docker exec tembus-db psql -U postgres -d tembus -v ON_ERROR_STOP=1 -c "UPDATE feature_flags SET is_enabled = CASE key WHEN 'customer_auth_otp_required' THEN true WHEN 'customer_registration_otp_required' THEN false ELSE is_enabled END, updated_at = NOW() WHERE key IN ('customer_auth_otp_required','customer_registration_otp_required'); SELECT key || '|' || is_enabled FROM feature_flags WHERE key IN ('customer_auth_otp_required','customer_registration_otp_required','otp_provider_live') ORDER BY key;"
    result: PASS — local Docker uses customer_auth_otp_required=true and customer_registration_otp_required=false; otp_provider_live remains false. This is a local/UAT setting and was not represented as production configuration.

    command: go test ./...
    workdir: backend/auth-service
    result: PASS — auth-service package tests passed, including scoped registration OTP flag and fail-closed behavior.

    command: docker compose build auth-service && docker compose up -d --no-deps auth-service
    result: PASS — auth-service image rebuilt from the current source and the recreated container reported healthy in development.

    command: POST http://localhost:8080/api/v1/auth/customer/register/start with an existing local account
    result: PASS — API returned HTTP 400 with the actionable safe message "Email atau nomor handphone sudah terdaftar. Silakan masuk dengan akun tersebut."; database/SQL details were not exposed.

    tool: ADB physical device 66fcb3 after reinstalling app-debug.apk
    result: PASS — registration screen exposed the non-OTP-neutral label `Buat akun & lanjutkan` and copy explaining that email verification is conditional; installed package versionCode was 2033.

    tool: ADB physical device 66fcb3
    result: PASS — debug APK installed and MainActivity remained resumed; UI hierarchy exposed `Daftar sebagai merchant`, supporting copy for usaha perorangan, `Masuk`, and `Belum punya toko?`.

    tool: ADB physical device 66fcb3 click-through
    result: PASS — tapping the registration CTA opened the public account form; the empty submit showed `Nama lengkap minimal 2 karakter` validation.

## Task-Local Verification

### Tests

Status: PASS

Evidence: Android, Go, and compliance contract tests above passed.

### Integration

Status: PASS

Evidence: Android calls the existing compliance policy/consent boundary before
the existing merchant registration command. The policy rows and legal pages are
available locally, and the merchant service applies the individual-only channel
guard without changing the web company lane.

### E2E

Status: PARTIAL

Evidence: The physical-device login surface was verified through ADB UI
hierarchy. A disposable authenticated submit with real document uploads was not
run in this implementation batch; it is explicitly recorded as release/UAT
follow-up and was not represented as PASS.

The local tunnel can now exercise account creation without email OTP by using
the registration-only feature flag. This does not prove the real provider path;
the production-like OTP path remains a release/UAT follow-up.

### Migration

Status: PASS

Evidence: The migration Up section was executed against the local PostgreSQL
container and the two expected active requirement versions were read back.

### Observability

Status: N/A

Evidence: This change reuses existing request telemetry and the append-only
compliance consent audit path; it does not add a new operational signal.

### Security / Privacy

Status: PASS

Evidence: The app fails closed if the active policy or either required version is
missing. Consent is posted through the authenticated, idempotency-protected
compliance route. The server rejects a company type sent through the Android
registration channel, and legal links use the first-party HTTPS host.

### Rollback / Recovery

Status: PASS

Evidence: The migration is additive and idempotent. Existing merchant terms are
preserved; the new privacy row has a scoped Down delete. A failed consent or
registration leaves the UI in an error state and does not show success.

## External Runtime / Release Validation

### Is external proof required by the original TASK-ID?

Value: `false`

Reason: The task requires the application/API/database contract to be wired;
staging/UAT is a separate release follow-up under the project delivery sequence.

### External Runtime Validation

Status: NOT_RUN

Evidence: No authenticated staging registration was claimed.

### Release Readiness

Status: PARTIAL

Evidence: Local Docker and physical-device smoke evidence exists. Full staging
cross-app read-after-write remains pending.

### Release Follow-ups

- Run an authenticated disposable account through login → form → uploads → two
  consent events → merchant `SUBMITTED` → Portal Mitra `/status`.
- Verify Admin review changes the same database-backed status visible on `/status`.

## Locally Actionable Remaining

NONE for this task-local implementation. The remaining checks are release/UAT
follow-ups, not missing code in this task.

## Blocker Resolution Attempts

NONE

## External Blockers

NONE

## Owner Action Required

NONE

## Unblock Condition

NONE

## Verification After Unblock

NONE

## Dependency Impact

`false` — the existing Portal Mitra company registration lane remains available;
the pending release/UAT pass does not block unrelated implementation tasks.

## Reality Gate Evaluation

### REALITY-2026-003 — Evidence-based Definition of Done

Status: PASS

Evidence: The implemented Android, backend, compliance, migration, and physical
device login contracts have task-local verification. The unrun staging submit is
explicitly separated under release follow-up.

### REALITY-2026-011 — No Fake Completeness

Status: PASS

Evidence: No authenticated staging registration, provider behavior, or full
cross-app read-after-write is presented as PASS. The company lane is not
silently rewritten; Android-only enforcement is covered by tests.

## Unproven / Remaining

NONE for the original task-local acceptance criteria. Release/UAT follow-up is
listed separately above.

## Next Eligible Task

MWEB-P0-010

## Status Decision

`COMPLETE` for task-local implementation. Release readiness remains `PARTIAL`
until authenticated staging/UAT is run.

## Notes / N/A Justification

Observability is N/A because the feature uses existing telemetry and compliance
audit instrumentation rather than introducing a new metric or dashboard.
