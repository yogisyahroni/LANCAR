---
task_id: MOBILE-OPT-2026-001
status: BLOCKED

reality_2026_003: PARTIAL
reality_2026_011: PASS

implementation_ref: WORKTREE

tests: PASS
integration: PASS
e2e: PARTIAL

migration: N/A
migration_na_reason: "Tidak ada perubahan schema persistent; OrderDao hanya menambah projection query status."

observability: PARTIAL
security_privacy: PARTIAL
rollback_recovery: NOT_RUN

task_scope_external_proof_required: true
external_runtime_validation: PARTIAL

release_readiness: PARTIAL
release_followups: "Production signing/provider-key cutover, authenticated active-order E2E, battery/data benchmark, dan full crash/ANR qualification."

unproven_requirements: "Authenticated customer/courier flow, tombol fallback Google Maps end-to-end, baseline-vs-post battery/network/cold-start/memory/jank, process-death/offline/reconnect/provider-failure qualification, and production release signing."
known_blockers: "Authenticated customer/courier active-order validation and baseline-vs-post runtime measurements require an authorized UAT session/device state that is not available in this execution environment."

locally_actionable_remaining: NONE

blocker_resolution_attempts: "Inspected repository contracts, ran customer/courier debug and release builds, full lint, backend tests, release APK/AAB builds, baseline release builds from HEAD in a temporary worktree, used the connected Android device for courier launch smoke, attempted customer install/launch, checked the Android emulator, and audited mobile route-provider references."
unblock_condition: "A valid UAT customer/courier session with an active order is available on the authorized emulator/device, or the owner supplies an approved test fixture/session."

owner_action_required: true
owner_action_summary: "Owner must authorize/provide a non-production authenticated UAT session and comparable baseline device/build for active-order and battery/network qualification; no credentials should be pasted into chat or evidence."
verification_after_unblock: "Run booking/review/tracking, offer/active-job, Google Maps fallback, offline/reconnect, process-death, battery/data, and logcat crash/ANR scenarios on release-configured builds."

dependency_chain_blocked: false
next_eligible_task: NONE

updated_at: 2026-10-07
---

# Evidence — MOBILE-OPT-2026-001

## Acceptance Criteria Source

Original requirements evaluated from `task-mobile-optimization-2026.md`:

- Keep TomTom/backend authoritative for route, distance, ETA, price, traffic, and polyline; Google Maps remains external navigation fallback.
- Separate maps-config refresh from tracking polling and honor TTL/stale fallback.
- Audit native/dependency weight and preserve safe release App Bundle/ABI/shrink configuration.
- Apply courier location policy by operational stage and reduce customer polling without sacrificing active freshness.
- Provide release size evidence and verification evidence before checking items.

The remaining runtime acceptance criteria are intentionally still unchecked in the task checklist.

## Scope Implemented

- Customer maps-provider config is no longer requested on every tracking poll. Successful responses follow server TTL; failed requests use a bounded retry delay and preserve the last known config.
- Customer tracking uses adaptive polling: slower while searching/no courier location, active freshness while a courier is visible, and a terminal backoff. Snapshot refreshes are serialized and tracking restart leaves the previous realtime room/job.
- Courier GPS uses a stage-aware profile derived from a small Room status projection: idle/pending offer is balanced-power with a larger distance filter; pickup/transit is more responsive; low battery still applies a conservative cap. Idle SOS watchdog polling is reduced to one minute while SOS remains responsive at three seconds.
- Courier location uploads coalesce small GPS jitter and force a bounded 60-second heartbeat, preventing repeated tiny samples from creating unnecessary local/network work.
- Courier navigation is explicitly an external Google Maps/Waze/browser hand-off; it does not calculate route, ETA, price, or distance. TomTom runtime map references remain in both apps.
- Placeholder map primitives were reduced to compatibility shims; active rendering remains in `RuntimeMapRenderer` and no call sites invoke the old no-op composables.
- Courier login now uses `MaterialTheme.colorScheme.background` for the scroll root and gives the login sheet a viewport-aware minimum height (`heightIn`), so the panel reaches the bottom instead of exposing a dangling footer background on tall devices while remaining scrollable on compact/IME layouts.
- Courier login now uses the user-provided complete portrait artwork as the backdrop, with a restrained green scrim and translucent native Compose login sheet; the form, password visibility, login, recovery, registration, and OTP interactions remain native and accessible.
- The login sheet transparency is tuned to `0.86f` so the courier artwork remains visible while the form retains readable contrast; the registration CTA now consistently says `Daftar sebagai mitra`.
- Courier Profile/Settings now exposes a Material 3 Light/Dark theme switch. With no explicit choice, the app follows the system theme; once selected, the choice is applied immediately at the root theme and persisted across process restarts.
- Courier duty controls now render the permission/security modal tree that was previously missing from `MainScreenRuntime`; both the header power action and the primary `Aktifkan kerja` button now surface the location permission step instead of appearing unresponsive. The duty button text is constrained to one line with a smaller adaptive label style.
- Courier hotspot insight now consumes the server hotspot snapshot as its only source: the UI no longer hardcodes a zone, order count, or the claim `prioritas area aktif`. It displays the server-provided zone, active/recent order metrics, demand intensity, estimate/source, and freshness, and suppresses the insight when evidence metadata or a demand signal is absent.
- Customer home location controls now share one permission flow: tapping either `Pilih area` or the `LOKASI ANDA` row opens an in-app location rationale, then the Android fine/coarse permission prompt. After approval, the current GPS position is requested and the area label is reverse-geocoded; missing GPS/geocoder results are surfaced as an explicit message instead of silently leaving a misleading location.
- Customer Account now exposes `Pengaturan Aplikasi` with a Material 3 Light/Dark switch. With no explicit choice, the app follows the system theme; once selected, the choice is applied immediately at the root customer theme and persisted across process restarts. Status-bar icons, dynamic campaign colors, and the auth logo consume the same explicit theme state.
- Release configuration was audited and local release APK/AAB artifacts were produced with minification/resource shrink and ABI split settings intact.

## Files Changed

- `android-app-customer/app/src/main/java/com/tembus/customer/data/policy/MapsConfigRefreshPolicy.kt` — TTL/retry policy.
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/tracking/TrackingPollingPolicy.kt` — adaptive tracking intervals.
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/tracking/TrackingViewModel.kt` — serialized polling/realtime refresh and config cache.
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/service/ServiceTrackingViewModel.kt` — stale-only config refresh.
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/components/maps/MapPrimitives.kt` — compatibility shim isolation.
- `android-app/app/src/main/java/com/tembus/courier/data/policy/CourierLocationPolicy.kt` — stage-based GPS policy.
- `android-app/app/src/main/java/com/tembus/courier/data/db/OrderDao.kt` — small status-only projection for the service.
- `android-app/app/src/main/java/com/tembus/courier/service/LocationTrackerService.kt` — stage-aware request rebuild and idle watchdog reduction.
- `android-app/app/src/main/java/com/tembus/courier/util/NavigationHelper.kt` — explicit external fallback semantics.
- `android-app/app/src/main/java/com/tembus/courier/ui/screens/auth/LoginScreen.kt` — viewport-aware login sheet and theme-aware root background.
- `android-app/app/src/main/res/drawable-nodpi/courier_login_background.png` — complete user-provided courier login artwork used as the portrait backdrop.
- `android-app/app/src/main/java/com/tembus/courier/ui/theme/CourierThemeState.kt` — persisted theme preference and composition-local controller.
- `android-app/app/src/main/java/com/tembus/courier/ui/screens/CourierThemePickerCard.kt` — Profile/Settings Light/Dark switch card.
- `android-app/app/src/main/java/com/tembus/courier/ui/MainActivity.kt` — root theme selection and preference wiring.
- `android-app/app/src/main/java/com/tembus/courier/ui/screens/ProfileScreens.kt` — theme card placement in the Account/Profile screen.
- `android-app/app/src/main/java/com/tembus/courier/ui/localization/CourierText.kt` — English labels for the theme card.
- `android-app/app/src/main/java/com/tembus/courier/ui/screens/MainScreenRuntime.kt` — renders the extracted modal/dialog tree for duty and operational actions.
- `android-app/app/src/main/java/com/tembus/courier/ui/screens/CourierStandbyRadarCockpit.kt` — one-line duty CTA layout and compact adaptive button content.
- `android-app/app/src/main/java/com/tembus/courier/data/model/Models.kt` — nullable hotspot evidence metadata and server-signal guards; no fabricated source defaults.
- `android-app/app/src/main/java/com/tembus/courier/ui/screens/CourierHotspotPresentation.kt` — shared source/freshness/intensity presentation mapping.
- `android-app/app/src/main/java/com/tembus/courier/ui/screens/OnDemandOfferScreens.kt` — consistent server/source/freshness display for the other hotspot surface.
- `android-app/app/src/test/java/com/tembus/courier/data/model/CourierHotspotTest.kt` — guards against missing server evidence and zero-signal opportunity claims.
- `android-app/app/src/main/java/com/tembus/courier/ui/components/maps/MapPrimitives.kt` — compatibility shim isolation.
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/main/DashboardHomeComponents.kt` — makes both customer location entry points accessible/clickable and renders location failure feedback.
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/main/DashboardScreen.kt` — in-app rationale, Android location permission launcher, current-location refresh, reverse-geocoding, and explicit failure states.
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/theme/CustomerThemeState.kt` — persistent customer theme preference and composition-local controller.
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/MainActivity.kt` — root customer theme selection and preference wiring.
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/profile/ProfileScreen.kt` — Account settings entry and Material 3 Light/Dark switch.
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/auth/LoginScreen.kt` — auth logo follows the explicit customer theme.
- `android-app-customer/app/src/main/java/com/tembus/customer/ui/experience/components/DynamicHeaderBanner.kt` and `DynamicPromoCard.kt` — campaign colors follow the explicit customer theme.
- `android-app-customer/app/src/test/.../TrackingSnapshotPolicyTest.kt` and `ServiceTrackingPolicyTest.kt` — customer policy tests.
- `android-app/app/src/test/.../CourierLocationPolicyTest.kt` — courier stage/profile tests.
- `task-mobile-optimization-2026.md` and `TASKS.md` — checklist/evidence tracking.

## 2026-10-07 — Update and tunnel reliability follow-up

- Courier update confirmation now opens the validated GitHub Releases page directly instead of downloading an APK inside the app process, removing the timeout-prone download/installer path while preserving explicit user choice of the Courier APK.
- The GitHub release resolver uses the release page URL (`html_url`) and still requires the Courier APK asset to exist before showing an update.
- Backend release fallback and the mobile release policy migration now point legacy `TEMBUS/releases` destinations to `LANCAR/releases`; custom non-legacy destinations are preserved. The local Docker database migration updated the three Android policies and wrote audit records.
- Cloudflared has a reproducible PowerShell start script with IPv4 edge selection and explicit `1.1.1.1:53` / `8.8.8.8:53` resolver flags. The active tunnel passed Cloudflare pre-checks and the public API health check returned HTTP 200.

### Follow-up verification

    command: android-app\gradlew.bat :app:testDebugUnitTest :app:assembleDebug :app:lintDebug --no-daemon
    result: PASS — BUILD SUCCESSFUL; courier APK installed and launched on adb device 66fcb3 with no fatal exception marker.

    command: backend/admin-service: npm test -- --runInBand src/services/mobileReleasePolicy.test.ts && npm run build
    result: PASS — 7 tests passed and TypeScript build passed.

    command: docker compose build admin-service; docker compose up -d admin-service
    result: PASS — local admin container healthy; latest-version response returned `https://github.com/yogisyahroni/LANCAR/releases` and all three Android policy destinations were migrated and audited.

    command: scripts/start-bawain-api-tunnel.ps1 runtime verification
    result: PASS — active connector registered four Cloudflare edges; DNS/UDP/TCP/API pre-checks passed; `https://api.bawain.my.id/health` returned HTTP 200.

    limitation: GitHub Release creation and staging deployment remain release follow-up until the scoped commit is pushed and the staging workflow completes. No production/staging success is claimed here.

## Commands / Checks Run

    command: android-app-customer\gradlew.bat :app:testDebugUnitTest :app:assembleDebug --no-daemon
    result: PASS — 55 actionable tasks, warnings only.

    command: android-app\gradlew.bat :app:testDebugUnitTest :app:assembleDebug --no-daemon
    result: PASS — 55 actionable tasks, warnings only, including CourierLocationPolicyTest and LocationUploadPolicyTest.

    command: android-app\gradlew.bat :app:testDebugUnitTest :app:assembleDebug --no-daemon (after courier login sheet layout fix)
    result: PASS — 55 actionable tasks; existing Kotlin/deprecation warnings only.

    command: android-app\gradlew.bat :app:lint --no-daemon (after courier login sheet layout fix)
    result: PASS — 36 actionable tasks; existing Kotlin/deprecation warnings only.

    command: android-app-customer\gradlew.bat :app:lint --no-daemon
    result: PASS — 36 actionable tasks; existing Kotlin/deprecation warnings only.

    command: android-app-customer\gradlew.bat :app:testDebugUnitTest :app:assembleDebug --no-daemon (after customer location permission flow fix)
    result: PASS — 55 actionable tasks; existing Kotlin/deprecation warnings only.

    command: android-app-customer\gradlew.bat :app:lint --no-daemon (after customer location permission flow fix)
    result: PASS — 36 actionable tasks; existing Kotlin/deprecation warnings only.

    command: android-app-customer\gradlew.bat :app:testDebugUnitTest :app:assembleDebug --no-daemon (after customer theme toggle)
    result: PASS — 55 actionable tasks; existing Kotlin/deprecation warnings only.

    command: android-app-customer\gradlew.bat :app:lint --no-daemon (after customer theme toggle)
    result: PASS — 36 actionable tasks; existing Kotlin/deprecation warnings only.

    command: android-app\gradlew.bat :app:lint --no-daemon
    result: PASS — 36 actionable tasks; existing Kotlin/deprecation warnings only.

    command: android-app\gradlew.bat :app:testDebugUnitTest :app:assembleDebug --no-daemon (after courier theme switch)
    result: PASS — 55 actionable tasks; existing Kotlin/deprecation warnings only.

    command: android-app\gradlew.bat :app:lint --no-daemon (after courier theme switch)
    result: PASS — 36 actionable tasks; existing Kotlin/deprecation warnings only.

    command: android-app\gradlew.bat :app:testDebugUnitTest :app:assembleDebug --no-daemon (after duty control/modal wiring fix)
    result: PASS — 55 actionable tasks; existing Kotlin/deprecation warnings only.

    command: android-app\gradlew.bat :app:testDebugUnitTest :app:assembleDebug --no-daemon (after server-backed hotspot insight fix)
    result: PASS — 55 actionable tasks; existing Kotlin/deprecation warnings only.

    command: android-app\gradlew.bat :app:lint --no-daemon (after server-backed hotspot insight fix)
    result: PASS — 36 actionable tasks; existing Kotlin/deprecation warnings only.

    command: android-app\gradlew.bat :app:testDebugUnitTest --no-daemon (after hotspot evidence guard test)
    result: PASS — 36 actionable tasks; existing Kotlin/deprecation warnings only.

    command: backend\admin-service: npx jest --runInBand --forceExit src/courierGrowthContract.test.ts
    result: PASS — 1 suite, 3 tests; server hotspot response still requires estimate, source, freshness, score and recent-order fields.

    command: android-app-customer\gradlew.bat :app:assembleRelease :app:bundleRelease --no-daemon
    result: PASS — local release artifacts built with synthetic local provider config and debug keystore for measurement only.

    command: android-app\gradlew.bat :app:assembleRelease :app:bundleRelease --no-daemon
    result: PASS — final stage-aware release artifacts built with synthetic local provider config and debug keystore for measurement only.

    command: backend\integration-gateway: go test ./...
    result: PASS — baseline run on 2026-10-06.

    command: backend\routing-service: go test ./...
    result: PASS — baseline run on 2026-10-06.

    command: rg -n -i "routes.googleapis|directions api|distance matrix|google.*(route|eta)|route.*google|eta.*google" android-app-customer android-app
    result: PASS — no mobile Google routing/ETA API reference found; Google Maps references are external intents only.

    command: git diff --check
    result: PASS — only existing CRLF normalization warnings were reported.

### Release size snapshot (baseline vs post-change)

    baseline source: HEAD ce278e55, temporary worktree, local debug keystore and synthetic provider key; measurement-only.
    customer baseline APK: 165,869,628 bytes (158.19 MiB)
    customer post-change APK: 165,951,568 bytes (158.26 MiB); delta +81,940 bytes (+0.05 MiB)
    customer baseline AAB: 103,699,125 bytes (98.90 MiB)
    customer post-change AAB: 103,813,069 bytes (99.00 MiB); delta +113,944 bytes (+0.11 MiB)

    courier baseline APK: 375,710,033 bytes (358.31 MiB)
    courier post-change APK: 375,710,061 bytes (358.31 MiB); delta +28 bytes
    courier baseline AAB: 182,871,562 bytes (174.40 MiB)
    courier post-change AAB: 182,861,805 bytes (174.39 MiB); delta -9,757 bytes

The size comparison shows no material binary-size reduction; this is an explicit trade-off. The optimization target is runtime/network/GPS/battery behavior. A per-ABI native inventory was captured for the post-change artifacts and courier baseline; the customer APK/AAB baseline is captured above, but customer per-ABI baseline inventory remains part of the external qualification follow-up.

    customer post-change native payload: arm64-v8a 106.82 MiB; armeabi-v7a 9.67 MiB
    courier post-change native payload: arm64-v8a 125.53 MiB; armeabi-v7a 21.30 MiB; x86 36.75 MiB; x86_64 135.88 MiB

The universal APK contains all configured ABIs and is not the Play download size. The AAB retains ABI split configuration. Native TomTom/ML/SQLCipher payloads were retained because the runtime map, location, security, and persistence code references them; no unused provider module was removed without proof.

    tool: adb connected device 66fcb3
    result: PASS — latest courier debug APK installed and launched; no fatal exception, ANR, UnsatisfiedLinkError, SIGSEGV, or fatal-signal marker in the launch window.

    tool: adb screenshot after courier login sheet layout fix
    result: PASS — the dark-mode login sheet now reaches the bottom of the device viewport; no white/black dangling block remains below the panel. Screenshot was used for local verification and was not committed.

    tool: adb screenshot after complete courier artwork integration on device 66fcb3
    result: PASS — the supplied artwork logo, tagline, and courier illustration render behind the native login sheet; the current debug APK launched without fatal/ANR/native-link markers. Screenshot was used for local verification and was not committed.

    tool: adb screenshot after translucent sheet and CTA copy update on device 66fcb3
    result: PASS — the artwork is more visible through the 0.86 alpha login sheet, form contrast remains readable, the CTA reads `Daftar sebagai mitra`, and the sheet still reaches the bottom. Screenshot was used for local verification and was not committed.

    tool: adb UIAutomator on device 66fcb3 — courier Profile/Settings theme switch
    result: PASS — `Tema aplikasi` initially reported `Mode terang aktif` with the switch unchecked; tapping the switch changed the live UI to `Mode gelap aktif` with the switch checked. The dark-mode screenshot shows the card and the rest of the Profile screen using the dark semantic palette.

    tool: adb force-stop/relaunch plus UIAutomator on device 66fcb3 — theme preference persistence
    result: PASS — after force-stopping and reopening the app, then opening Akun/Profile, the theme card still reported `Mode gelap aktif` with the switch checked. The preference file contained only the boolean theme choice; no credential or provider secret was involved.

    tool: adb UIAutomator on device 66fcb3 — courier duty controls after modal wiring fix
    result: PASS — tapping the lower `Aktifkan kerja` button opened `Aktifkan Lokasi`; tapping the header power control opened the same dialog. Selecting `Izinkan lokasi` then reached the Android runtime permission prompt, proving the action path is now visible and connected. The compact button label was reported as one line in UIAutomator, and the launch/tap window had no fatal/ANR/native-link marker.

    tool: adb UIAutomator and screenshot on device 66fcb3 — server-backed courier hotspot insight
    result: PASS — the live card rendered `Peluang order di JAKARTA TIMUR`, `69 order aktif`, `Permintaan tinggi`, `Estimasi server`, `Sumber server`, and `Data terbaru`; the old static `prioritas area aktif` text was absent. The values were obtained from the authenticated `/api/v1/courier/on-demand/hotspots` response path, not from UI constants.

    tool: adb UIAutomator on device 66fcb3 — customer location permission flow
    result: PASS — with location permission denied, both `Pilih area` and `LOKASI ANDA` exposed accessible clickable nodes. Tapping `Pilih area` opened `Aktifkan lokasi`; `Izinkan lokasi` opened the Android prompt `Izinkan Tembus mengakses lokasi perangkat ini?`. After selecting `Saat aplikasi digunakan`, the customer UI refreshed to `Pasar Baru, Kecamatan Sawah Besar` and `Sawah Besar`. The last 800 logcat lines contained no customer fatal/ANR/native-fatal marker.

    tool: adb UIAutomator on device 66fcb3 — customer Account theme toggle
    result: PASS — `Akun` now exposes `Pengaturan Aplikasi` with `Tema aplikasi`. The switch changed the live UI from `Mode gelap aktif` (`checked=true`) to `Mode terang aktif` (`checked=false`), and after force-stop/relaunch the light choice remained selected. The reverse toggle path was exercised before relaunch; the debug preference store afterward contained only `dark_theme=true`. No customer fatal/ANR marker was present in the last 800 logcat lines.

    tool: Android emulator smoke before final device became unavailable
    result: PARTIAL — customer and courier debug APK launch smoke had passed earlier; full authenticated tracking/offer/fallback flow was not run.

## Task-Local Verification

### Tests

Status: PASS

Evidence: Customer and courier unit suites pass. New tests cover maps TTL/backoff, adaptive tracking intervals, courier stage resolution, and active-vs-idle GPS profiles.

### Integration

Status: PASS

Evidence: Existing gateway and routing service tests pass. Mobile static audit finds TomTom runtime map usage and route snapshot fields; no Google route/ETA API usage exists in either mobile module.

### E2E

Status: PARTIAL

Evidence: Release/debug launch smoke was executed. Authenticated booking/tracking, offer/active-job, offline/reconnect, and external Maps click flows remain unproven.

### Migration

Status: N/A

Evidence: No persistent schema change. The new Room query is a projection over the existing `orders` table.

### Observability

Status: PARTIAL

Evidence: Existing logcat review covered fatal/ANR/native-link markers during courier launch. Full active-order network, battery, and provider-failure telemetry review remains pending.

### Security / Privacy

Status: PARTIAL

Evidence: Release measurements used a local Android debug keystore and synthetic provider key only; no secret was committed or placed in evidence. Production signing/provider-key handling remains unverified.

### Rollback / Recovery

Status: NOT_RUN

Evidence: No process-death/offline/reconnect recovery drill was executed in an authenticated active-order session.

## External Runtime / Release Validation

### Is external proof required by the original TASK-ID?

Value: `true`

Reason: The original checklist explicitly requires emulator booking/tracking/offer flows and battery/network measurements. Local compilation alone cannot prove those scenarios.

### External Runtime Validation

Status: PARTIAL

Evidence: A connected Android device was available and courier launch smoke passed. The device was not in an authenticated active-order state, and the customer debug install could not replace an existing differently signed package, so full flow validation was not claimed.

### Release Readiness

Status: PARTIAL

Evidence: Local release APK/AAB builds pass. Artifacts are measurement-only because they use the local Android debug keystore and synthetic provider key; they are not production-signed release evidence.

### Release Follow-ups

- Repeat release size measurement against a previous production-signed baseline.
- Run authenticated customer/courier active-order scenarios, including Google Maps fallback.
- Measure cold start, memory, jank, battery, and data usage across idle, active, background, poor network, reconnect, and process death.
- Validate production signing and real TomTom/Firebase/provider configuration in the release environment.

## Locally Actionable Remaining

NONE. The remaining work requires an authorized authenticated UAT session/device state and a comparable runtime measurement environment.

## Blocker Resolution Attempts

Repository inspection, static provider audit, debug unit/build verification, release APK/AAB builds, connected-device courier launch, and customer install/launch attempt were completed. The customer install attempt reported `INSTALL_FAILED_UPDATE_INCOMPATIBLE` because the installed package uses a different signing key; the existing app was not uninstalled to avoid deleting device data.

## External Blockers

The implementation and local verification are complete, but full task validation requires an authorized authenticated customer/courier UAT session with an active order. The available physical device was not authenticated, the Android emulator became unavailable, and the customer debug APK could not replace the installed package because of a signing-key mismatch without uninstalling user data. Battery, network, process-death, reconnect, provider-failure, and external Google Maps click behavior therefore cannot be truthfully claimed as PASS from this environment.

## Owner Action Required

### Why Owner Action Is Required

Local code, tests, release builds, static audits, and launch smoke are complete. The remaining acceptance criteria require an authenticated active-order session and device-level runtime measurements that are controlled by the UAT environment/account.

### What The Owner Must Do

1. Authorize a non-production customer and courier UAT account/session with a reproducible active order.
2. Provide access to the authorized emulator/device, or install the test-signed builds without deleting existing user data.
3. Provide or identify a comparable pre-change release build for cold-start, memory, jank, battery, and network comparison.

### Where It Must Be Configured

Use the approved UAT/staging environment and device only. Do not add credentials or production provider keys to the repository, task evidence, screenshots, or logs.

### Security Handling

The local release measurements used only a synthetic TomTom key and a local debug keystore. Secrets must remain in the approved environment/secret manager and must not be pasted into chat or committed.

### What The Agent Needs Afterwards

A working authenticated session/device state and the baseline build identifier are sufficient; no secret needs to be shared in plaintext.

## Unblock Condition

An authorized authenticated UAT session with an active order is available on the emulator/device, plus a comparable baseline build for battery/performance comparison.

## Verification After Unblock

Run the exact release test matrix described under Release Follow-ups, capture logcat/performance evidence, then update the unchecked checklist items and rerun `python scripts/tasks/validate_task_evidence.py`.

## Dependency Impact

false — no downstream task is being advanced based on this partial evidence.

## Reality Gate Evaluation

### REALITY-2026-003 — Evidence-based Definition of Done

Status: PARTIAL

Evidence: Implementation, unit tests, backend tests, release builds, static provider audit, full lint, coalescing policy tests, and limited launch smoke are real. Authenticated E2E, performance measurements, recovery, and production signing remain unproven.

### REALITY-2026-011 — No Fake Completeness

Status: PASS

Evidence: The checklist only checks the requirements supported by actual evidence. Debug APKs are not presented as production download sizes, synthetic keys are identified, and TomTom remains the authoritative route/ETA path while Google is limited to external navigation fallback.

## Unproven / Remaining

- Baseline-vs-post cold-start, memory, jank, battery, and network comparison; release artifact size comparison is captured above.
- Full customer/courier authenticated E2E and Google Maps fallback click.
- Crash/ANR/recovery matrix.
- Network/battery data measurements.

## Next Eligible Task

NONE — resume this task after the unblock condition is satisfied.

## Status Decision

Local implementation and all locally actionable verification are complete. The task is `BLOCKED` only on external authenticated UAT/device access and comparable runtime measurement conditions; no dependent task is advanced.

## Notes / N/A Justification

Migration is N/A because no schema or stored-data contract changed. All runtime and performance gaps remain explicit rather than being relabeled N/A.
