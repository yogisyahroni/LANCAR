---
task_id: CUSTOMER-ONBOARDING-2026-001
status: COMPLETE

reality_2026_003: PASS
reality_2026_011: PASS

implementation_ref: PENDING — refreshed Canva asset commit

tests: PASS
integration: PASS
e2e: PASS

migration: N/A
migration_na_reason: "Onboarding-only change; no persistent database schema or stored server data changed."

observability: N/A
observability_na_reason: "This change only selects packaged artwork and local onboarding navigation; no new server/runtime signal is required."

security_privacy: PASS
security_privacy_evidence: "Canva artwork is packaged as local resources; no credentials, user data, or remote asset URL was added."

rollback_recovery: N/A
rollback_recovery_na_reason: "The previous onboarding implementation remains recoverable through the preceding Git commit; no transactional or server state changed."

task_scope_external_proof_required: false
external_runtime_validation: NOT_RUN

release_readiness: PARTIAL
release_followups: "Push to origin/staging and CI/release validation remain separate from local task verification."

unproven_requirements: NONE
known_blockers: NONE

locally_actionable_remaining: NONE
blocker_resolution_attempts: NONE
unblock_condition: NONE

owner_action_required: false
owner_action_summary: NONE
verification_after_unblock: NONE

dependency_chain_blocked: false
next_eligible_task: NONE

updated_at: 2026-10-03
---

# Evidence — CUSTOMER-ONBOARDING-2026-001

## Acceptance Criteria Source

Original user request:

- Use the onboarding design from the supplied Canva link directly in the customer app; do not recreate the artwork.
- Support the approved light and dark variants, with the variant following the device system theme.
- Keep the onboarding flow usable on the active customer emulator.

These are the task requirements. Staging deployment and CI are tracked below as release follow-up, not silently treated as local proof.

## Scope Implemented

- Exported the supplied Canva design directly into eight PNG resources: four light pages and four dark pages.
- Added the same resource names under `drawable-nodpi` and `drawable-night-nodpi`; Android selects the correct Canva page from system night mode.
- Replaced the previous three-page Compose artwork/layout with a four-page full-frame Canva pager.
- Preserved swipe navigation and added transparent semantic hit targets for the controls already painted in Canva: `Lewati`, `Lanjut`, and `Mulai Sekarang`.
- Changed first-run preference behavior so a fresh debug install does not bypass onboarding.

## Files Changed

- `android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/onboarding/OnboardingScreen.kt` — full-frame Canva pager, accessibility semantics, and navigation hit targets.
- `android-app-customer/app/src/main/java/com/tembus/customer/data/onboarding/OnboardingPreferences.kt` — fresh installs show onboarding in debug builds as well.
- `android-app-customer/app/src/main/res/drawable-nodpi/img_customer_onboarding_canva_{1..4}.png` — direct Canva light exports.
- `android-app-customer/app/src/main/res/drawable-night-nodpi/img_customer_onboarding_canva_{1..4}.png` — direct Canva dark exports.

## Commands / Checks Run

    command: .\gradlew.bat :app:assembleDebug --no-daemon
    result: PASS — BUILD SUCCESSFUL

    command: .\gradlew.bat :app:testDebugUnitTest --no-daemon
    result: PASS — BUILD SUCCESSFUL

    command: git diff --check
    result: PASS

    tool: adb install -r -d + emulator-5554
    result: PASS — debug APK installed and MainActivity resumed.

    tool: Canva browser export via the supplied Canva design
    result: PASS — the refreshed eight-page export from `C:\Users\yogis\Downloads\onboarding customer terbaru` was inspected before import; dark pages no longer contain a page-level mock status bar or white canvas margins.

    tool: adb install -r -d + emulator-5554 + dark-mode onboarding flow
    result: PASS — updated APK installed, dark onboarding page 1 and page 4 rendered, and UIAutomator exposed `Lanjut` then `Mulai sekarang`.

## Task-Local Verification

### Tests

Status: PASS

Evidence: `:app:testDebugUnitTest --no-daemon` completed successfully after the final source change.

### Integration

Status: PASS

Evidence: Android resource qualifiers selected the light set with `cmd uimode night no` and the dark set with `cmd uimode night yes` on the same installed customer APK.

### E2E

Status: PASS

Evidence: On `emulator-5554`, the refreshed APK opened the new dark Canva page 1; the screen has only the device status bar and no embedded `9:41` mock status bar. Tapping the transparent `Lanjut` target advanced through pages 2–4, and UIAutomator exposed `Mulai sekarang` on page 4. The final page has no white top margin. No `AndroidRuntime:E` fatal exception was present in the inspected logcat output.

### Migration

Status: N/A

Evidence: No database, migration, or backend contract changed.

### Observability

Status: N/A

Evidence: No new server-side or asynchronous runtime behavior was introduced.

### Security / Privacy

Status: PASS

Evidence: The imported Canva files are static packaged assets. No secret, credential, user identifier, or external asset URL was added to source or logs.

### Rollback / Recovery

Status: N/A

Evidence: Git commit `748e0a44` is scoped to customer onboarding assets/flow; reverting that commit restores the prior onboarding implementation without data migration.

## External Runtime / Release Validation

### Is external proof required by the original task?

Value: `false`

Reason: The requested behavior is a packaged Android UI flow and was proven on the active emulator. The user did not require an authenticated staging runtime check as part of the Canva import itself.

### External Runtime Validation

Status: NOT_RUN

Evidence: No remote staging runtime claim is made by this evidence.

### Release Readiness

Status: PARTIAL

Evidence: The implementation is committed locally. Push to `origin/staging` and the resulting CI/release status are tracked separately.

### Release Follow-ups

- Push commit `748e0a44` to `origin/staging`.
- Check the customer Android CI/release pipeline after the push.
    - The refreshed Canva export is now imported locally; push this asset update to `origin/staging` and check the resulting customer Android CI/release pipeline.

## Locally Actionable Remaining

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

`false` — no dependent task is technically blocked by this local onboarding implementation.

## Reality Gate Evaluation

### REALITY-2026-003 — Evidence-based Definition of Done

Status: PASS

Evidence:

- Implementation: direct Canva assets are present in both Android theme resource sets.
- Tests: Gradle unit tests pass.
- Integration: resource qualifier selection is verified in light and dark emulator modes.
- E2E: onboarding navigation and completion are verified on `emulator-5554`.
- Migration: justified N/A because there is no persistence/schema change.
- External proof: not required by this UI task.

### REALITY-2026-011 — No Fake Completeness

Status: PASS

The evidence records actual commands, actual emulator state, and actual limitations. It does not claim staging deployment, CI success, or provider behavior. Canva artwork is used as imported resources rather than represented by a newly drawn mock.

## Unproven / Remaining

NONE for the original onboarding task. Staging/CI is release follow-up only.

## Next Eligible Task

NONE

## Status Decision

Original task requirements are implemented and verified locally; status is `COMPLETE`. Release readiness remains `PARTIAL` until the staging push and CI result are observed.
