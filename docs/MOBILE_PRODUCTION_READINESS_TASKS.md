# Mobile Production Readiness Tasks

Status: Draft execution plan
Scope: Courier Android app and Customer Android app
Constraint: Do not upgrade `targetSdk` yet. Keep current SDK target until device testing is complete.

## Goal

Prepare both mobile apps for production-grade testing and Play Console readiness without changing the current target SDK. The focus is release safety, environment correctness, secret handling, network posture, Firebase reliability, and operational documentation.

## Current Baseline

- CI can inject Firebase config from GitHub Actions Secrets.
- CI can build signed release AABs using keystore secrets.
- Courier and Customer release signing are separated.
- Debug builds remain available for development testing.
- Release AAB generation is not yet the same as full Play Console production readiness.

## Non-Goal For This Phase

- Do not upgrade `compileSdk` or `targetSdk`.
- Do not publish directly to Play Console production.
- Do not rotate courier signing keys unless current courier CI fails.
- Do not commit `google-services.json`, `.jks`, passwords, or any generated local secret files.

## Priority Legend

- P0: Must be handled before production or external tester rollout.
- P1: Strongly recommended before Play Console internal testing.
- P2: Operational hardening and review readiness.

---

## MOB-P0-01 Production API And Env Fail-Fast

Status: Completed

### Problem

Release builds must not silently fall back to placeholder or staging URLs. A production mobile app pointed at the wrong API can create real user confusion, data split, bad notifications, and support noise.

### Tasks

- [x] Require explicit API base URL for release builds.
- [x] Keep debug/local fallback for development only.
- [x] Make CI fail early if release API URL is empty or invalid.
- [x] Use a single GitHub Actions variable for mobile release API URL:
  - `MOBILE_API_BASE_URL`
- [x] Remove fallback to staging/default URLs for release AAB builds.
- [x] Validate URL format in CI before Gradle build starts.
- [x] Validate release `BASE_URL` again inside Gradle before release tasks execute.

### Acceptance Criteria

- [x] `bundleRelease` fails if `MOBILE_API_BASE_URL` is missing for release workflow.
- [x] Debug app can still use emulator/local development URL.
- [x] Release `BuildConfig.BASE_URL` is never empty.
- [x] No hardcoded production API URL is required inside Kotlin source.

### Verification

- [x] Run courier `bundleRelease` with `BASE_URL` set.
- [x] Run customer `bundleRelease` with `BASE_URL` set.
- [x] Run negative test with release API URL unset and confirm Gradle fails with clear error.

---

## MOB-P0-02 Release Network Security Hardening

Status: Completed

### Problem

Release builds must not allow plaintext HTTP or debug-only network behavior. Development can allow local emulator endpoints, but production should only use HTTPS.

### Tasks

- [x] Review both apps' `network_security_config.xml`.
- [x] Ensure release does not allow cleartext traffic.
- [x] Allow local HTTP only in debug if needed.
- [x] Confirm release API host must use HTTPS through CI and Gradle validation.
- [x] Ensure sensitive endpoints are not reachable over non-TLS URLs from release config.
- [x] Remove placeholder certificate pinning from P0 release network config; strict pinning remains MOB-P1-01 after final production TLS is confirmed.

### Acceptance Criteria

- [x] Release app rejects plaintext HTTP.
- [x] Debug app can still test local services if needed.
- [x] Network security config is app-specific and does not rely on accidental defaults.
- [x] No release resource accidentally permits broad cleartext traffic.

### Verification

- [x] Inspect source release/debug network resources.
- [x] Build release AAB for both apps.
- [ ] Optionally test on device by attempting an HTTP API base URL and confirming failure.

---

## MOB-P0-03 Token Storage Audit And Encryption

Status: Completed

### Problem

Production mobile apps must not store access tokens, refresh tokens, OTP state, session identifiers, or user credentials in plain SharedPreferences, files, logs, or Room tables without encryption.

### Tasks

- [x] Audit courier token/session storage.
- [x] Audit customer token/session storage.
- [x] Identify all reads/writes for:
  - access token
  - refresh token
  - device token
  - Firebase token
  - user ID/session ID
  - OTP/session verification state
- [x] Replace plain SharedPreferences with encrypted storage where applicable.
- [x] Use Android Keystore-backed encryption if available in the current dependency stack.
- [x] Ensure logout clears encrypted session material.
- [x] Ensure account lockout or auth failure clears invalid tokens.
- [x] Remove raw FCM/device token values from app logs.
- [x] Migrate legacy fallback device IDs into EncryptedSharedPreferences.

### Acceptance Criteria

- [x] No sensitive auth token is stored in plain text preferences.
- [x] Logout clears local sensitive session state.
- [x] Token refresh failure clears invalid credentials.
- [x] No token values are printed in logs.
- [x] Courier and customer fallback device identifiers are stored in encrypted preferences.

### Verification

- [x] Search source for token storage keys.
- [x] Search source for token-like values printed to logs.
- [x] Run courier `assembleDebug`.
- [x] Run customer `assembleDebug`.
- [x] Run courier `bundleRelease`.
- [x] Run customer `bundleRelease`.
- [ ] Install app, login, logout, then verify sensitive local state is cleared where practical.

---

## MOB-P0-04 Sensitive Screen Screenshot Protection

Status: Completed

### Problem

Screens containing OTP, payment, wallet, payout, personal identity, or sensitive courier/customer data should block screenshots and app switcher previews in production.

### Tasks

- [x] Identify sensitive screens in both mobile apps:
  - OTP
  - login credential entry
  - payment
  - wallet/payout
  - user profile with phone/email/address
  - courier payout or bank/account data
- [x] Apply `WindowManager.LayoutParams.FLAG_SECURE` on those screens.
- [x] Remove or disable flag when leaving sensitive screens if the app has non-sensitive flows that should remain screenshot-friendly.
- [x] Avoid blocking screenshots globally unless UX impact is acceptable.
- [x] Keep screenshot protection disabled in debug builds so local development and testing screenshots remain usable.

### Acceptance Criteria

- [x] Android screenshots are blocked on sensitive screens in release builds.
- [x] Recent-apps preview does not expose sensitive data on protected release screens.
- [x] Non-sensitive screens remain unaffected unless explicitly decided otherwise.
- [x] Debug builds remain screenshot-friendly for development.

### Verification

- [x] Run courier `assembleDebug`.
- [x] Run customer `assembleDebug`.
- [x] Run courier `bundleRelease`.
- [x] Run customer `bundleRelease`.
- [ ] Test on physical device or emulator.
- [ ] Attempt screenshot on sensitive screen.
- [ ] Switch app to background and inspect recent-app preview.

---

## MOB-P0-05 Firebase And FCM Production Validation

Status: Code Completed - external Firebase console and device validation pending

### Problem

Firebase config errors can cause notification failure, Crashlytics gaps, or startup issues. The CI config must guard package name correctness and production Firebase usage.

### Tasks

- [x] Keep `google-services.json` out of Git.
- [x] Continue injecting Firebase configs through:
  - `COURIER_GOOGLE_SERVICES_JSON`
  - `CUSTOMER_GOOGLE_SERVICES_JSON`
- [x] Validate package name in CI:
  - courier: `com.lancar.courier`
  - customer: `com.lancar.customer`
- [x] Support both raw JSON and base64 Firebase secrets.
- [x] Validate multi-client `google-services.json` files by matching expected package instead of trusting the first client.
- [x] Validate `project_info.project_id`, `project_info.project_number`, `mobilesdk_app_id`, and Android API key presence.
- [x] Reject obvious dummy or placeholder Firebase config values.
- [x] Write generated `google-services.json` only inside the CI workspace.
- [x] Document required Firebase SHA fingerprints for release upload keys.
- [x] Document Play App Signing fingerprint follow-up.
- [ ] Verify FCM registration in release build on a device/internal testing install.
- [ ] Verify Crashlytics report ingestion from a controlled non-production release crash.

### Acceptance Criteria

- [x] CI fails if Firebase package name is wrong.
- [x] CI fails if Firebase JSON is missing, malformed, dummy, or missing required Android client fields.
- [ ] Release app can obtain FCM token.
- [ ] Release app receives test push notification.
- [ ] Crashlytics can receive release crash reports.
- [x] No Firebase config file is tracked by Git.

### Verification

- [x] Add reusable CI validator: `scripts/mobile/validate_google_services.py`.
- [x] Run local Firebase validator for courier config.
- [x] Run local Firebase validator for customer config.
- [x] Run `git diff --check`.
- [ ] Run CI mobile workflow.
- [ ] Install release/internal build on test device.
- [ ] Send Firebase test notification.
- [ ] Trigger controlled non-production crash only in internal testing if needed.

### Operator Guide

See `docs/MOBILE_FIREBASE_FCM_PRODUCTION_VALIDATION.md`.

---

## MOB-P1-01 Certificate Pinning Readiness

Status: Completed

### Problem

Certificate pinning protects against some MitM attacks, but incorrect pinning can lock out all production users. It must be prepared carefully.

### Tasks

- [x] Keep `API_CERT_SHA256_PIN_PRIMARY` and `API_CERT_SHA256_PIN_BACKUP` configurable.
- [x] Add `API_CERT_PINNING_REQUIRED` so strict pinning can be enabled only after production TLS is final.
- [x] Do not hardcode pins directly in Kotlin source.
- [x] Remove hardcoded fallback API hostnames from runtime pinning logic.
- [x] Require primary and backup pins only when strict pinning is enabled.
- [x] Validate pin format in Gradle before release build when strict pinning is enabled.
- [x] Document how to rotate primary and backup pins.
- [x] Ensure staging/dev can operate without strict pinning if the backend certificate is not stable yet.

### Acceptance Criteria

- [x] Production pin values can be supplied through environment or CI variables.
- [x] Backup pin exists before strict pinning is enabled.
- [x] App does not crash on missing pin in debug/staging mode.
- [x] Production strict mode behavior is documented.
- [x] Release build fails fast if strict pinning is enabled without valid primary and backup pins.

### Verification

- [x] Build staging/debug without pins.
- [x] Validate Gradle and Kotlin compile path through courier debug build.
- [x] Validate Gradle and Kotlin compile path through customer debug build.
- [ ] Build release with production/staging pins supplied.
- [ ] Test certificate rotation scenario in staging before enabling strict production pinning.

### Operator Guide

See `docs/MOBILE_CERTIFICATE_PINNING_READINESS.md`.

---

## MOB-P1-02 Release AAB Verification Gate

Status: Completed

### Problem

Producing an AAB is not enough. CI should verify that the file exists, is signed, and has sane metadata before attaching it to a release.

### Tasks

- [x] After `bundleRelease`, verify the AAB exists.
- [x] Verify file size is greater than a minimum threshold.
- [x] Verify AAB zip integrity and required bundle entries.
- [x] Verify signature with `jarsigner -verify`.
- [x] Upload AAB artifact separately for courier and customer.
- [x] Keep debug APK upload for development convenience.
- [x] Ensure artifact names include app name and run number.
- [x] Run the verification gate before uploading release artifacts.

### Acceptance Criteria

- [x] CI fails if release AAB is missing.
- [x] CI fails if AAB is too small or malformed.
- [x] CI fails if AAB signature verification fails.
- [x] CI artifacts clearly separate courier and customer outputs.
- [x] Release upload includes AAB, not only debug APK.

### Verification

- [x] Add reusable verifier: `scripts/mobile/verify_release_aab.py`.
- [x] Verify existing courier release AAB locally.
- [x] Verify existing customer release AAB locally.
- [ ] Run GitHub Actions mobile workflow after GitHub Actions incident clears.
- [ ] Confirm artifacts:
  - `Courier-App-release-aab-<run_number>`
  - `Customer-App-release-aab-<run_number>`
- [ ] Download artifact and inspect locally if needed.

---

## MOB-P1-03 Play Console Internal Testing Preparation

Status: Preparation Completed - Play Console execution pending

### Problem

Local APK testing and CI AAB generation do not guarantee Play Console acceptance. Internal testing must validate Play signing, app metadata, data safety, and installation through Google Play.

### Tasks

- [x] Document app identity and package names:
  - courier: `com.lancar.courier`
  - customer: `com.lancar.customer`
- [x] Document required CI artifacts:
  - `Courier-App-release-aab-<run_number>`
  - `Customer-App-release-aab-<run_number>`
- [x] Document Play Console app entry setup for both apps.
- [x] Document Play App Signing requirement.
- [x] Document internal tester Gmail list setup.
- [x] Document AAB upload steps for internal testing track.
- [x] Document release note template.
- [x] Document Play-installed smoke test matrix.
- [x] Document Firebase fingerprint follow-up after Play upload.
- [x] Document rollback procedure for broken internal builds.
- [ ] Create Play Console app entries for courier and customer if not already created.
- [ ] Enable Play App Signing.
- [ ] Upload AAB to internal testing track.
- [ ] Add internal tester Gmail accounts.
- [ ] Install app from Play internal test link.
- [ ] Validate login, OTP, location, order flow, notification, and logout.
- [ ] Do not promote to production until internal testing is stable.

### Acceptance Criteria

- [x] Operator guide exists for internal testing execution.
- [x] App/package/artifact mapping is explicit for courier and customer.
- [x] Smoke test checklist exists for Play-installed builds.
- [x] Release notes and rollback procedure are documented.
- [ ] AAB upload is accepted by Play Console.
- [ ] Internal testers can install both apps.
- [ ] App launches without Firebase startup crash.
- [ ] Critical flows work from Play-installed build.

### Verification

- [x] Review Gradle application IDs.
- [x] Review mobile CI artifact names.
- [x] Review manifest-level app permissions that affect Play review.
- [ ] Play Console internal testing release status is active.
- [ ] Test device installs through Google Play.
- [ ] Smoke test checklist passes.

### Operator Guide

See `docs/MOBILE_PLAY_CONSOLE_INTERNAL_TESTING.md`.

---

## MOB-P1-04 Privacy Policy And Data Safety Pack

Status: Preparation Completed - public hosting and Play Console submission pending

### Problem

Apps collecting location, contact, account, order, payment, crash, or device data need accurate Play Console disclosure and a public privacy policy URL.

### Tasks

- [x] Create/update privacy policy page source:
  - `frontend/public/privacy/lancar-mobile.html`
- [x] Prepare Play Console Data Safety answer pack for both apps.
- [x] Identify data collected:
  - name
  - phone
  - email
  - address/location
  - order details
  - payment status
  - device identifiers
  - crash logs
  - notification tokens
- [x] Identify service providers and data sharing/processing surfaces:
  - Firebase/Google services
  - maps provider
  - payment provider
  - backend services
- [x] Document data deletion request path.
- [x] Document production retention guidance.
- [x] Document Play Console submission checklist.
- [x] Document privacy/data safety risk register.
- [ ] Deploy privacy policy to a public HTTPS URL.
- [ ] Submit Data Safety form in Play Console for courier.
- [ ] Submit Data Safety form in Play Console for customer.
- [ ] Confirm final Firebase/analytics/payment provider settings before Play submission.

### Acceptance Criteria

- [x] Privacy policy source exists in the frontend public directory.
- [x] Data Safety draft answers are mapped to actual mobile app behavior.
- [x] Location collection is disclosed accurately in the draft.
- [x] Crash/analytics collection is disclosed accurately in the draft when Firebase diagnostics are enabled.
- [x] Data deletion request path is documented.
- [ ] Public privacy policy URL exists after deployment.
- [ ] Data Safety answers are submitted in Play Console.

### Verification

- [x] Review app permissions against Data Safety form.
- [x] Review Firebase/analytics usage at code/config level.
- [x] Review backend data deletion support enough to identify manual deletion path and self-service gap.
- [ ] Open deployed privacy policy URL without login.
- [ ] Review final Firebase/analytics dashboard settings before submission.
- [ ] Review backend data flows for account deletion/data deletion support before public launch.

### Operator Guide

See `docs/MOBILE_PRIVACY_POLICY_AND_DATA_SAFETY_PACK.md`.

### Public Policy Source

See `frontend/public/privacy/lancar-mobile.html`.

---

## MOB-P2-01 Production Mobile Release Runbook

Status: Completed - live release execution pending

### Problem

Production release should be repeatable. Without a runbook, signing keys, secrets, and upload steps are easy to mix up.

### Tasks

- [x] Document how to generate keystore.
- [x] Document how to base64 encode keystore.
- [x] Document how to verify keystore locally with `keytool`.
- [x] Document required GitHub Actions Secrets.
- [x] Document required GitHub Actions Variables.
- [x] Document local release build commands.
- [x] Document local AAB verification command.
- [x] Document how to rerun mobile CI.
- [x] Document how to download AAB artifact.
- [x] Document Play Console upload steps.
- [x] Document post-upload Firebase/Maps fingerprint actions.
- [x] Document rollback approach.
- [x] Document common release troubleshooting cases.

### Acceptance Criteria

- [x] A new operator can reproduce the release process without guessing.
- [x] Secret names and expected values are documented.
- [x] Keystore handling warns not to commit or lose the files.
- [x] Courier and customer release paths are clearly separated.
- [x] Release acceptance gate is documented.

### Verification

- [x] Confirm runbook references current app IDs and artifact names.
- [x] Confirm existing local AAB paths are documented.
- [ ] Follow runbook once from clean terminal.
- [ ] Confirm CI produces signed AAB after GitHub Actions incident clears.
- [ ] Confirm Play Console internal testing accepts both AABs.

### Operator Guide

See `docs/MOBILE_PRODUCTION_RELEASE_RUNBOOK.md`.

---

## MOB-P2-02 Mobile Smoke Test Checklist

Status: Completed - physical device execution pending

### Problem

Before uploading to internal testing, both apps need a consistent smoke test checklist.

### Tasks

- [x] Create courier smoke tests:
  - install app
  - login
  - OTP if enabled
  - receive/accept order
  - location permission
  - map display
  - pickup/delivery proof flow
  - notification
  - logout
- [x] Create customer smoke tests:
  - install app
  - register/login
  - OTP if enabled
  - create order
  - map/address selection
  - payment or payment status flow
  - notification
  - order tracking
  - logout
- [x] Add test session header template.
- [x] Add pass/fail/blocked rules.
- [x] Add cross-app regression checks.
- [x] Add failure report template.
- [x] Add release decision table.

### Acceptance Criteria

- [x] Smoke checklist exists for courier.
- [x] Smoke checklist exists for customer.
- [x] Each item has pass/fail/result notes.
- [x] Checklist records app version, device model, Android version, backend environment, and OTP flag state.
- [x] Checklist includes release-only checks for screenshot protection, wrong backend guard, Firebase, notification, and Play install source.

### Verification

- [x] Confirm checklist document exists.
- [x] Confirm courier checklist covers install, login, OTP, order, location, notification, proof, payout, logout.
- [x] Confirm customer checklist covers install, login, OTP, order, address/map, payment, notification, tracking, logout.
- [ ] Run checklist on at least one physical Android device.
- [ ] Record app version, device model, Android version, and test result.
- [ ] Attach failed-flow evidence for every FAIL result.

### Operator Guide

See `docs/MOBILE_SMOKE_TEST_CHECKLIST.md`.

---

## Recommended Execution Order

1. MOB-P0-01 Production API And Env Fail-Fast
2. MOB-P0-02 Release Network Security Hardening
3. MOB-P0-03 Token Storage Audit And Encryption
4. MOB-P0-04 Sensitive Screen Screenshot Protection
5. MOB-P0-05 Firebase And FCM Production Validation
6. MOB-P1-02 Release AAB Verification Gate
7. MOB-P1-01 Certificate Pinning Readiness
8. MOB-P1-03 Play Console Internal Testing Preparation
9. MOB-P1-04 Privacy Policy And Data Safety Pack
10. MOB-P2-01 Production Mobile Release Runbook
11. MOB-P2-02 Mobile Smoke Test Checklist

## Production Blockers To Track

- Target SDK upgrade is intentionally deferred.
- Final production API domain must be confirmed.
- Production TLS certificate and pin rotation strategy must be confirmed before strict certificate pinning.
- Play Console app entries and Play App Signing must be configured manually.
- Firebase SHA-1/SHA-256 fingerprints must match upload keys used by CI.
- Privacy policy URL must be public before store review.
