# Production Mobile Release Runbook

Status: Ready for operator use
Last updated: 2026-05-26
Scope: TEMBUS Courier Android app and TEMBUS Customer Android app

This runbook explains how to produce, verify, download, and upload production-ready mobile AAB artifacts. It is intentionally explicit because the two apps have separate package names, Firebase configs, and signing keys.

## Release Inventory

| App | Package name | Source dir | Local AAB path | CI artifact |
| --- | --- | --- | --- | --- |
| Courier | `com.tembus.courier` | `android-app` | `android-app/app/build/outputs/bundle/release/app-release.aab` | `Courier-App-release-aab-<run_number>` |
| Customer | `com.tembus.customer` | `android-app-customer` | `android-app-customer/app/build/outputs/bundle/release/app-release.aab` | `Customer-App-release-aab-<run_number>` |

## Non-Negotiable Rules

- Do not commit `.jks`, `google-services.json`, `.env`, generated signing env files, or downloaded Play Console artifacts.
- Do not reuse a Courier AAB for Customer or a Customer AAB for Courier.
- Do not publish straight to production before internal testing passes.
- Do not enable strict certificate pinning until production TLS and backup pin are confirmed.
- Do not lose the original release keystore. Losing it can block future updates unless Play App Signing recovery is available and accepted.

## Required GitHub Actions Secrets

Add these under `Settings > Secrets and variables > Actions > Secrets`.

| Secret | App | Expected value |
| --- | --- | --- |
| `COURIER_GOOGLE_SERVICES_JSON` | Courier | Full raw JSON or base64-encoded `google-services.json` for `com.tembus.courier`. |
| `CUSTOMER_GOOGLE_SERVICES_JSON` | Customer | Full raw JSON or base64-encoded `google-services.json` for `com.tembus.customer`. |
| `COURIER_RELEASE_KEYSTORE_BASE64` | Courier | Base64 of Courier release `.jks`. |
| `COURIER_RELEASE_KEYSTORE_PASSWORD` | Courier | Courier keystore password. |
| `COURIER_RELEASE_KEY_ALIAS` | Courier | Courier key alias, for example `tembus-courier-release`. |
| `COURIER_RELEASE_KEY_PASSWORD` | Courier | Courier key password. |
| `CUSTOMER_RELEASE_KEYSTORE_BASE64` | Customer | Base64 of Customer release `.jks`. |
| `CUSTOMER_RELEASE_KEYSTORE_PASSWORD` | Customer | Customer keystore password. |
| `CUSTOMER_RELEASE_KEY_ALIAS` | Customer | Customer key alias, for example `tembus-customer-release`. |
| `CUSTOMER_RELEASE_KEY_PASSWORD` | Customer | Customer key password. |

## TEMBUS Firebase Secret Rotation

Use this when the Android package name changes, Firebase project changes, or a new `google-services.json` is downloaded. For the TEMBUS package migration, keep the secret names exactly the same and replace only their values.

Current production package IDs:

- Courier: `com.tembus.courier`
- Customer: `com.tembus.customer`

Files from Firebase:

- Courier Firebase JSON: `C:\Users\yogis\Downloads\com.tembus.courier.json`
- Customer Firebase JSON: `C:\Users\yogis\Downloads\com.tembus.customer.json`

Do not commit those JSON files. Store them only in GitHub Actions Secrets.

1. Copy Courier Firebase JSON to clipboard as base64:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("$env:USERPROFILE\Downloads\com.tembus.courier.json")) | Set-Clipboard
```

2. Open GitHub repository settings:

`Settings > Secrets and variables > Actions > Repository secrets`

3. Edit `COURIER_GOOGLE_SERVICES_JSON`.

4. Replace the whole value with the clipboard content, then save.

5. Copy Customer Firebase JSON to clipboard as base64:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("$env:USERPROFILE\Downloads\com.tembus.customer.json")) | Set-Clipboard
```

6. Edit `CUSTOMER_GOOGLE_SERVICES_JSON`.

7. Replace the whole value with the clipboard content, then save.

8. Re-run `Mobile Apps CI/CD`.

The workflow validates the package name before build. If a Courier JSON contains `com.tembus.customer`, or an old `com.tembus.*` JSON is pasted, the CI fails before Gradle runs.

Signing secrets do not need to change for the TEMBUS package rename unless you intentionally create new upload keys. Keep the release keystore secrets as they are when the keystore, alias, and passwords are still valid.

## Required GitHub Actions Variables

Add these under `Settings > Secrets and variables > Actions > Variables`.

| Variable | Required for release | Value |
| --- | --- | --- |
| `MOBILE_API_BASE_URL` | Yes | Absolute HTTPS API base URL, for example `https://api.tembus.id/`. |
| `API_CERT_PINNING_REQUIRED` | Optional until final TLS | `true` only after primary and backup pins are ready. |
| `API_CERT_SHA256_PIN_PRIMARY` | Required only when pinning is enabled | OkHttp pin format: `sha256/<base64>`. |
| `API_CERT_SHA256_PIN_BACKUP` | Required only when pinning is enabled | Different backup pin in OkHttp format. |

## Generate Release Keystores

Use a separate keystore for Courier and Customer. Keep the files outside the repository.

Courier:

```powershell
keytool -genkeypair `
  -v `
  -keystore "$env:USERPROFILE\Downloads\tembus-courier-release.jks" `
  -alias tembus-courier-release `
  -keyalg RSA `
  -keysize 2048 `
  -validity 10000
```

Customer:

```powershell
keytool -genkeypair `
  -v `
  -keystore "$env:USERPROFILE\Downloads\tembus-customer-release.jks" `
  -alias tembus-customer-release `
  -keyalg RSA `
  -keysize 2048 `
  -validity 10000
```

Record these values in a password manager:

- Keystore path
- Keystore password
- Key alias
- Key password
- Creation date
- Owner
- SHA-1 fingerprint
- SHA-256 fingerprint

## Export Keystore Base64 For GitHub Secrets

Courier:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("$env:USERPROFILE\Downloads\tembus-courier-release.jks")) | Set-Clipboard
```

Paste into:

```text
COURIER_RELEASE_KEYSTORE_BASE64
```

Customer:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("$env:USERPROFILE\Downloads\tembus-customer-release.jks")) | Set-Clipboard
```

Paste into:

```text
CUSTOMER_RELEASE_KEYSTORE_BASE64
```

If GitHub Actions says the keystore is invalid, generate a fresh keystore, verify it locally with `keytool -list`, then replace the matching base64 secret.

## Verify Keystore Locally

Courier:

```powershell
keytool -list `
  -v `
  -keystore "$env:USERPROFILE\Downloads\tembus-courier-release.jks" `
  -alias tembus-courier-release
```

Customer:

```powershell
keytool -list `
  -v `
  -keystore "$env:USERPROFILE\Downloads\tembus-customer-release.jks" `
  -alias tembus-customer-release
```

Copy SHA-1 and SHA-256 fingerprints into Firebase and any Google Maps API key restrictions when required.

## Local Release Build

Use JDK 17.

```powershell
$env:JAVA_HOME = "C:\Program Files\Java\jdk-17.0.12"
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
```

Courier:

```powershell
cd "E:\antigraviti google\SUDAH DEPLOY\TEMBUS\android-app"
$env:BASE_URL = "https://api.tembus.id/"
$env:RELEASE_KEYSTORE_PATH = "$env:USERPROFILE\Downloads\tembus-courier-release.jks"
$env:RELEASE_KEYSTORE_PASSWORD = "<courier-keystore-password>"
$env:RELEASE_KEY_ALIAS = "tembus-courier-release"
$env:RELEASE_KEY_PASSWORD = "<courier-key-password>"
.\gradlew.bat bundleRelease -PversionCode=<version-code> -PversionName="<version-name>"
```

Customer:

```powershell
cd "E:\antigraviti google\SUDAH DEPLOY\TEMBUS\android-app-customer"
$env:BASE_URL = "https://api.tembus.id/"
$env:RELEASE_KEYSTORE_PATH = "$env:USERPROFILE\Downloads\tembus-customer-release.jks"
$env:RELEASE_KEYSTORE_PASSWORD = "<customer-keystore-password>"
$env:RELEASE_KEY_ALIAS = "tembus-customer-release"
$env:RELEASE_KEY_PASSWORD = "<customer-key-password>"
.\gradlew.bat bundleRelease -PversionCode=<version-code> -PversionName="<version-name>"
```

## Local AAB Verification

Run from repo root:

```powershell
cd "E:\antigraviti google\SUDAH DEPLOY\TEMBUS"
python scripts\mobile\verify_release_aab.py --working-dir android-app --app-name Courier-App --min-size-mb 1
python scripts\mobile\verify_release_aab.py --working-dir android-app-customer --app-name Customer-App --min-size-mb 1
```

Expected result:

- AAB file exists.
- File size is sane.
- Bundle ZIP integrity passes.
- Required bundle entries exist.
- `jarsigner -verify` succeeds.

## Run Mobile CI

Preferred path:

1. Open GitHub.
2. Go to `Actions`.
3. Select `Mobile Apps CI/CD`.
4. Click `Run workflow`.
5. Select branch `staging`.
6. Run workflow.

If `workflow_dispatch` is delayed or queued, check GitHub Status before creating trigger commits.

CI must pass:

- `Build Courier-App`
- `Build Customer-App`

Expected release artifacts:

- `Courier-App-release-aab-<run_number>`
- `Customer-App-release-aab-<run_number>`

## Download AAB Artifacts

1. Open the green Mobile Apps CI/CD run.
2. Open `Artifacts`.
3. Download:
   - `Courier-App-release-aab-<run_number>`
   - `Customer-App-release-aab-<run_number>`
4. Extract each artifact ZIP.
5. Verify the `.aab` with:

```powershell
jarsigner -verify -certs -verbose "<path-to-app-release.aab>"
```

## Upload To Play Console Internal Testing

Use `docs/MOBILE_PLAY_CONSOLE_INTERNAL_TESTING.md` for detailed Play Console steps.

Short version:

1. Open the correct Play Console app.
2. Go to `Testing > Internal testing`.
3. Create a release.
4. Upload the matching AAB.
5. Add release notes.
6. Review warnings.
7. Roll out to internal testing.
8. Copy tester opt-in link.
9. Install from Google Play on test devices.

## Post-Upload Fingerprint Actions

After Play App Signing is active, update integrations with Play fingerprints:

- Firebase Android app SHA-1 and SHA-256.
- Google Maps API key restrictions.
- Any auth/provider that validates app certificate fingerprints.

Do this for both packages:

- `com.tembus.courier`
- `com.tembus.customer`

## Release Acceptance Gate

Do not proceed beyond internal testing until these are all true:

- [ ] Mobile CI is green for Courier and Customer.
- [ ] Release AAB verifier passes for both apps.
- [ ] AAB upload is accepted by Play Console for both apps.
- [ ] Internal testers install through Google Play.
- [ ] Smoke test checklist passes for both apps.
- [ ] Firebase push notification works for both apps.
- [ ] Crash/diagnostic ingestion is validated or explicitly deferred.
- [ ] Privacy policy URL is public and configured in Play Console.
- [ ] Data Safety form is submitted and matches app behavior.

## Rollback Procedure

If the internal release is broken:

1. Keep the failed build version code and issue summary.
2. Fix the code or configuration.
3. Build a new AAB with a higher version code.
4. Upload the new AAB to internal testing.
5. Tell testers to update from Google Play.
6. Keep failed build evidence in the release notes or QA log.

If a production release has already happened:

1. Stop or pause rollout if Play Console allows it.
2. Release a known-good build with a higher version code.
3. Disable dangerous server-side feature flags if the issue is backend/config driven.
4. Notify support with affected versions, symptoms, and mitigation steps.

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Firebase config prepare step fails | Secret is path text, malformed JSON, wrong app, or invalid base64 | Paste raw JSON or base64 content, not a local file path. |
| Release signing step fails | Wrong keystore password, alias, key password, or stale base64 | Verify with `keytool -list`, then update secrets. |
| `BASE_URL` release validation fails | Missing or non-HTTPS API URL | Set `MOBILE_API_BASE_URL` Actions variable to an HTTPS URL. |
| AAB verifier fails signature check | AAB is unsigned or wrong signing env | Rebuild with correct release signing secrets. |
| Play Console rejects package name | Wrong AAB uploaded to wrong app | Use Courier AAB for `com.tembus.courier`, Customer AAB for `com.tembus.customer`. |
| Testers cannot install | Tester email missing or not opted in | Add Gmail/Workspace account to internal tester list and share opt-in link. |
| GitHub Actions stays queued | GitHub Actions service degradation | Wait for GitHub Status recovery before retriggering. |
