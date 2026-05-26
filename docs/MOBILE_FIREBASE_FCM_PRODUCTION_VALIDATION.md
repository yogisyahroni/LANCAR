# Mobile Firebase and FCM Production Validation

Scope: Courier Android app and Customer Android app.

This guide keeps Firebase config out of Git while making CI fail fast when the wrong or dummy config is supplied.

## GitHub Secrets

Required repository secrets:

- `COURIER_GOOGLE_SERVICES_JSON`
- `CUSTOMER_GOOGLE_SERVICES_JSON`

Each value can be either:

- the full raw `google-services.json` content, or
- a base64-encoded version of the full file content.

Recommended approach: use base64 because it avoids copy/paste issues with JSON formatting in GitHub text fields.

PowerShell command:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("$env:USERPROFILE\Downloads\google-services.json")) | Set-Clipboard
```

Paste the clipboard value into the matching GitHub secret.

## Package Names

Firebase Android app package names must be exactly:

- Courier: `com.lancar.courier`
- Customer: `com.lancar.customer`

The GitHub Actions mobile workflow validates those package names before Gradle starts. If the Firebase file contains multiple Android clients, CI selects the matching client instead of blindly trusting the first client entry.

## Firebase Console Setup

For each Firebase project/app:

1. Open Firebase Console.
2. Select the correct project.
3. Go to Project settings.
4. Open the Android app entry.
5. Confirm package name:
   - Courier: `com.lancar.courier`
   - Customer: `com.lancar.customer`
6. Add the release upload key fingerprints:
   - SHA-1
   - SHA-256
7. Download a fresh `google-services.json`.
8. Update the matching GitHub secret with the fresh file.

## Get Release Key SHA Fingerprints

Run these locally for the release keystores you created.

Courier:

```powershell
keytool -list -v `
  -keystore "$env:USERPROFILE\Downloads\lancar-courier-release-v3.jks" `
  -alias lancar-courier-release
```

Customer:

```powershell
keytool -list -v `
  -keystore "$env:USERPROFILE\Downloads\lancar-customer-release-v3.jks" `
  -alias lancar-customer-release
```

When prompted, enter the keystore password. Copy both `SHA1` and `SHA256` values into Firebase Console.

## Play App Signing Note

Before Play Console upload, Firebase only needs the upload key fingerprints used by CI.

After Play App Signing is enabled, Google Play also has an App signing key. Add both of these to Firebase:

- Upload certificate SHA-1 and SHA-256
- App signing certificate SHA-1 and SHA-256

Without the Play App Signing certificate in Firebase, a Play-installed build can behave differently from a locally installed release build.

## CI Validation

The workflow uses:

```text
scripts/mobile/validate_google_services.py
```

It validates:

- JSON can be parsed from raw JSON or base64.
- `project_info.project_id` exists and is not dummy.
- `project_info.project_number` exists.
- matching Android client exists for the expected package.
- `mobilesdk_app_id` exists and is not dummy.
- Firebase Android API key exists and looks like a real Firebase key.
- generated `app/google-services.json` is written only inside the CI workspace.

It does not print API keys or full Firebase app IDs.

## FCM Smoke Test

After CI produces signed AABs and the apps are installed through internal testing or a controlled release build:

1. Install the Courier app.
2. Login as a courier test account.
3. Confirm the app reaches a screen that triggers FCM token registration.
4. Send a Firebase test notification from Firebase Console.
5. Confirm notification is received while app is backgrounded.
6. Repeat the same process for the Customer app.

Record:

- app name
- app version
- device model
- Android version
- Firebase project
- push sent timestamp
- push received timestamp
- result

## Crashlytics Smoke Test

Only do this on internal testing or staging accounts.

1. Install the release/internal build.
2. Trigger a controlled non-production crash if a debug-only crash trigger exists.
3. Reopen the app so Crashlytics can upload the report.
4. Confirm the issue appears in Firebase Crashlytics.
5. Confirm the build version matches the CI release version.

Do not add a public production crash trigger.

## Files That Must Stay Out Of Git

These must not be committed:

- `android-app/app/google-services.json`
- `android-app-customer/app/google-services.json`
- `*.jks`
- `*.keystore`
- `*.p12`
- `.ci-release-signing.env`

The repository already ignores `**/google-services.json`; keep using GitHub Secrets for CI.
