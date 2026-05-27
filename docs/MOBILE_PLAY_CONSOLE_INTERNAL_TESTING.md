# Mobile Play Console Internal Testing Preparation

Status: Ready for Play Console execution
Last updated: 2026-05-26
Scope: TEMBUS Courier Android app and TEMBUS Customer Android app

This guide prepares both Android apps for Google Play internal testing. It assumes CI already produces signed release AAB artifacts and that Firebase config/signing secrets are injected through GitHub Actions.

Official references:

- Google Play Console internal testing: https://support.google.com/googleplay/android-developer/answer/9845334
- Google Play release rollout: https://support.google.com/googleplay/android-developer/answer/9859348
- Internal app sharing certificate behavior: https://support.google.com/googleplay/android-developer/answer/9844679

## App Inventory

| App | Play Console app name | Package name | CI working dir | Release artifact |
| --- | --- | --- | --- | --- |
| Courier | TEMBUS Courier | `com.lancar.courier` | `android-app` | `Courier-App-release-aab-<run_number>` |
| Customer | TEMBUS Customer | `com.lancar.customer` | `android-app-customer` | `Customer-App-release-aab-<run_number>` |

Do not swap the two AABs. Play Console will reject package-name mismatches, but swapping files wastes review/debug time and can cause wrong tester notes.

## Before Upload

Complete this once per app before creating the first internal test release.

| Item | Courier | Customer | Notes |
| --- | --- | --- | --- |
| App entry exists in Play Console | [ ] | [ ] | Create separate apps for courier and customer. |
| Package name matches Gradle `applicationId` | [ ] | [ ] | Courier: `com.lancar.courier`; Customer: `com.lancar.customer`. |
| Play App Signing enabled | [ ] | [ ] | Required for modern AAB publishing. |
| App category selected | [ ] | [ ] | Suggested: Business/Productivity or Maps/Navigation depending final store positioning. |
| Privacy policy URL configured | [ ] | [ ] | Use the hosted URL for `frontend/public/privacy/tembus-mobile.html`. |
| Data Safety form completed | [ ] | [ ] | Use `docs/MOBILE_PRIVACY_POLICY_AND_DATA_SAFETY_PACK.md`. |
| Release AAB downloaded from CI artifact | [ ] | [ ] | Use latest green Mobile Apps CI/CD run. |
| Firebase release fingerprints updated | [ ] | [ ] | Add Play App Signing SHA-1/SHA-256 and upload-key SHA-1/SHA-256 if Firebase requires them. |

## Internal Tester List

Create one reusable tester email list in Play Console:

Name: `TEMBUS Internal QA`

Recommended tester groups:

- Founder/admin account
- Courier operations tester
- Customer operations tester
- QA device owner
- Support/ops representative

Rules:

- Use Google accounts only.
- Keep at least one physical Android device on Android 13 or lower if that is still the current compatibility target for field testing.
- Keep one device with fresh install and one device with update-from-previous-build behavior.

## Upload Steps

Run these steps separately for Courier and Customer.

1. Open Play Console.
2. Select the correct app.
3. Go to `Testing > Internal testing`.
4. Open `Releases`.
5. Create a new release.
6. Upload the matching `.aab`:
   - Courier: `android-app/app/build/outputs/bundle/release/app-release.aab`
   - Customer: `android-app-customer/app/build/outputs/bundle/release/app-release.aab`
7. Confirm Play Console accepts the AAB.
8. Add release name:
   - `1.0.<github_run_number>-internal`
9. Add release notes:
   - `Internal QA build for production readiness validation. Do not use for public rollout.`
10. Review warnings.
11. Start rollout to internal testing.
12. Copy the tester opt-in link.
13. Install through Google Play on tester devices.

## Release Notes Template

Use this as the release note body for both apps until production release notes are written.

```text
TEMBUS internal testing build.

Validation scope:
- Production API and Firebase configuration
- Login and OTP behavior
- Notification delivery
- Location permission and tracking behavior
- Order workflow smoke test
- Logout and token cleanup

This build is for internal testing only.
```

## Smoke Test Matrix

Record every test result before promoting beyond internal testing.

| Area | Courier | Customer | Expected result |
| --- | --- | --- | --- |
| Install from Play link | [ ] | [ ] | App installs from Google Play, not side-loaded APK. |
| First launch | [ ] | [ ] | No Firebase startup crash. |
| Login | [ ] | [ ] | Valid account can login. Invalid account is rejected cleanly. |
| OTP behavior | [ ] | [ ] | Follows current admin feature flag configuration. |
| FCM token registration | [ ] | [ ] | Backend receives token after login/permission grant. |
| Push notification | [ ] | [ ] | Test notification arrives on device. |
| Location permission | [ ] | [ ] | Permission prompt text matches actual use. Denial is handled. |
| Background location | [ ] | [ ] | Only requested where the app needs live tracking. |
| Map/API calls | [ ] | [ ] | Maps render and API calls hit production/staging URL expected for this build. |
| Order flow | [ ] | [ ] | Critical order path works end to end. |
| Payment/payout surface | [ ] | [ ] | Sensitive screen blocks screenshots in release builds. |
| Logout | [ ] | [ ] | Session tokens are cleared and app returns to auth flow. |
| App update | [ ] | [ ] | Update from previous internal version preserves safe state. |

## Tester Result Template

```text
App:
Version:
Version code:
Tester:
Device:
Android version:
Install source: Google Play internal testing
Test date:

Result:
- PASS / FAIL

Issues:
- <issue id or description>

Notes:
- <short notes>
```

## Firebase Fingerprint Follow-up

After the first Play Console upload, copy these fingerprints into the matching Firebase Android app if Firebase features require certificate-bound auth or API key restrictions:

- Upload key SHA-1
- Upload key SHA-256
- App signing key SHA-1
- App signing key SHA-256

Do this separately for:

- `com.lancar.courier`
- `com.lancar.customer`

If Google Maps API keys are restricted by package name and certificate fingerprint, update those restrictions too.

## Promotion Gate

Do not move to closed testing, open testing, or production until every item below is true:

- [ ] Courier internal release is active.
- [ ] Customer internal release is active.
- [ ] Both apps install through Google Play.
- [ ] Both apps launch without Firebase startup crash.
- [ ] Both apps pass smoke test on at least one physical device.
- [ ] Firebase push notification works on Play-installed build.
- [ ] Location tracking behavior is validated against the privacy/data safety disclosure.
- [ ] Privacy policy URL is public and accessible without login.
- [ ] Data Safety form is submitted and matches actual behavior.
- [ ] Any Play Console policy warnings are resolved or documented.

## Rollback

If an internal test build is broken:

1. Stop rollout for the internal testing release if Play Console allows it.
2. Upload the previous known-good AAB with a higher version code.
3. Add release notes: `Rollback internal QA build after failed validation.`
4. Notify testers to update from Google Play.
5. Keep the failed version code and failure reason in the tester result log.
