# Production Security Verification Checklist

Tanggal verifikasi lokal: 2026-05-26
Scope: source tree, production Compose config, gateway/admin security tests, and VPS verification procedure.

## Gate Summary

| Gate | Status | Evidence |
|---|---|---|
| `.env` not tracked | Passed | `git ls-files -- .env` returned no files. |
| `.env` not in Git history | Passed | `git log --all --full-history -- .env --format='%H %s'` returned no commits. |
| Gitleaks history scan | Passed with controlled history ignore | Dockerized `gitleaks detect --source=/repo --redact --no-banner` returned `no leaks found`. Historical fingerprints are documented in `.gitleaksignore`; rotate/restrict provider keys before production. |
| Production Compose renders | Passed | Rendered with a temporary strong dummy env and scanned for weak placeholders. |
| Internal ports not public in production Compose | Passed by config review | `docker-compose.prod.yml` only publishes gateway, frontend, and admin dashboard through `${PUBLIC_BIND:-127.0.0.1}`. |
| Gateway auth matrix | Passed | `npm run test:auth-matrix` in `backend/api-gateway`. |
| CORS internal header cleanup | Passed | `npm run test:cors` in `backend/api-gateway`. |
| Admin direct-call/internal trust tests | Passed | `npm test -- --runInBand src/middlewares.test.ts src/middleware/auditTrail.test.ts src/middleware/errorMapper.test.ts src/controllers/courierAuth.controller.test.ts`. |
| VPS runbook exists | Passed | `docs/VPS_SECURITY_RUNBOOK.md`. |
| VPS verification script syntax | Passed | `bash -n scripts/ops/verify-vps-security.sh`. |
| Local secret scan helper | Passed | `scripts/ops/verify-local-secret-scan.ps1` runs gitleaks locally and fails closed when the scanner is unavailable. |
| Tracked Firebase config and binaries | Pending commit | Real `google-services.json` and known binaries are deleted in this working tree. `git ls-files` will stop reporting them after the deletion commit is created. VPS script now fails if they are tracked in a committed checkout. |
| Trivy high/critical scan | CI/VPS gate | Local Docker scan timed out on this workspace because dependency caches are present. Keep the GitHub Actions container security matrix as blocking, and run the script on the VPS/source checkout without `node_modules`. |
| CI staging green | External gate | Must be confirmed on GitHub Actions after pushing this change set. |
| Android Firebase config injection | Passed | Real `google-services.json` files are ignored; mobile CI recreates them from GitHub Secrets or uses example templates. `:app:processDebugGoogleServices` passed for both courier and customer apps using the example templates with JDK 17. |

## Required External Actions Before Production

- [ ] Rotate or restrict the Firebase Android API keys that previously existed in Git history.
- [ ] Confirm Android Firebase API keys are restricted by package name and SHA-1/SHA-256 certificate fingerprint.
- [ ] Store real Android `google-services.json` files outside Git, then inject them via local secure file handling or GitHub Actions Secrets.
- [ ] Set `COURIER_GOOGLE_SERVICES_JSON` and `CUSTOMER_GOOGLE_SERVICES_JSON` in GitHub Actions Secrets before mobile release builds.
- [ ] Confirm GitHub Actions staging run is green after this final checklist commit.
- [ ] Run `scripts/ops/verify-vps-security.sh` on the real VPS with `ENV_FILE=/opt/tembus/secrets/.env.production` and real `API_BASE_URL`.

## Tutorial: Required External Actions

### 0. Run Local Secret Scan Before Push

GitHub Actions already runs Gitleaks and container secret scanning, but local scanning catches mistakes before they reach Git history.

Install Gitleaks on Windows with one of these options:

```powershell
winget install gitleaks
```

or:

```powershell
scoop install gitleaks
```

Then run from the repository root:

```powershell
pwsh scripts/ops/verify-local-secret-scan.ps1
```

Expected result:

```text
Secret scan passed: no leaks detected.
```

If the script reports findings, do not commit. Remove the file or replace the value with a non-secret placeholder, then rotate the exposed credential if it was real.

The repository also ignores common mobile/secret artifacts:

```text
*.aab
*.apk
*.apks
*.jks
*.keystore
**/google-services.json
cookies.txt
*.har
```

Done criteria:

- Local Gitleaks scan passes before push.
- Real keystore, Firebase config, AAB/APK, browser cookies, HAR files, and `.env` files are not tracked.
- GitHub Actions Gitleaks and container SBOM/secret audit remain green.

### 1. Rotate or Restrict Firebase Android API Keys

Firebase Android API keys are not the same as backend secrets, but they must still be restricted because the old real `google-services.json` files existed in Git history. The safest option before production is to create new restricted keys or restrict the existing keys immediately.

Steps:

1. Open Google Cloud Console.
2. Select the Firebase project for courier app.
3. Go to `APIs & Services` -> `Credentials`.
4. Find the Android API key used by `android-app/app/google-services.json`.
5. Open the key, then set `Application restrictions` to `Android apps`.
6. Add package name:

```text
com.tembus.courier
```

7. Add the release signing certificate SHA-1 fingerprint and SHA-256 fingerprint.
8. Under `API restrictions`, choose only APIs actually needed by the Android app, such as Firebase/FCM and Maps APIs if used.
9. Save.
10. Repeat the same process for the customer app key with package name:

```text
com.tembus.customer
```

Done criteria:

- The old keys cannot be used from unknown Android apps.
- Each key is restricted to the correct package name and signing certificate fingerprint.
- If you choose full rotation, the old keys are deleted or disabled after the new `google-services.json` files are tested.

### 2. Get SHA-1 and SHA-256 Certificate Fingerprints

For production, use the release signing key fingerprint, not only the debug key fingerprint.

If you already have a release keystore:

```bash
keytool -list -v -keystore /path/to/release.keystore -alias YOUR_KEY_ALIAS
```

On Windows PowerShell:

```powershell
keytool -list -v -keystore "C:\path\to\release.keystore" -alias YOUR_KEY_ALIAS
```

Look for:

```text
SHA1: ...
SHA256: ...
```

If you are only testing debug builds, use the debug keystore fingerprint temporarily:

```powershell
keytool -list -v -keystore "$env:USERPROFILE\.android\debug.keystore" -alias androiddebugkey -storepass android -keypass android
```

Done criteria:

- Google Cloud Console contains SHA-1 and SHA-256 for courier release signing key.
- Google Cloud Console contains SHA-1 and SHA-256 for customer release signing key.
- Debug fingerprint is not treated as production-only protection.

### 3. Download New `google-services.json` Files

After key restriction or rotation:

1. Open Firebase Console.
2. Select the courier Firebase project/app.
3. Go to `Project settings` -> `General`.
4. Under Android app `com.tembus.courier`, click `Download google-services.json`.
5. Store it outside this repo, for example:

```text
C:\Users\yogis\secrets\tembus\courier-google-services.json
```

6. Repeat for customer app `com.tembus.customer`:

```text
C:\Users\yogis\secrets\tembus\customer-google-services.json
```

Do not copy the real files into:

```text
android-app/app/google-services.json
android-app-customer/app/google-services.json
```

except temporarily for local build testing. These paths are ignored by Git, but production discipline is to keep real provider config in a secrets folder.

Done criteria:

- Real Firebase config files are outside the repository.
- Repo only contains:

```text
android-app/app/google-services.example.json
android-app-customer/app/google-services.example.json
```

### 4. Convert `google-services.json` to Base64 for GitHub Actions Secrets

GitHub Actions stores multi-line JSON more safely as base64 text.

PowerShell command for courier:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\Users\yogis\secrets\tembus\courier-google-services.json")) | Set-Clipboard
```

PowerShell command for customer:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\Users\yogis\secrets\tembus\customer-google-services.json")) | Set-Clipboard
```

Linux/macOS equivalent:

```bash
base64 -w 0 /secure/path/courier-google-services.json
base64 -w 0 /secure/path/customer-google-services.json
```

Done criteria:

- You have one base64 string for courier.
- You have one base64 string for customer.
- Do not paste these values into code, Markdown, Discord, or chat.

### 5. Add GitHub Actions Secrets

Steps:

1. Open GitHub repository.
2. Go to `Settings` -> `Secrets and variables` -> `Actions`.
3. Click `New repository secret`.
4. Add courier secret:

```text
Name: COURIER_GOOGLE_SERVICES_JSON
Value: paste courier base64 string
```

5. Add customer secret:

```text
Name: CUSTOMER_GOOGLE_SERVICES_JSON
Value: paste customer base64 string
```

6. Save both.

Done criteria:

- GitHub Actions has both Android Firebase config secrets.
- `.github/workflows/android-apps.yml` can generate real `google-services.json` during CI.
- Real `google-services.json` still does not exist in Git.

### 6. Confirm Staging CI Is Green

After pushing the final security commit:

1. Open GitHub repository.
2. Go to `Actions`.
3. Open the latest `CI/CD Staging` workflow.
4. Confirm these jobs are green:

```text
Frontend Build
Admin Service Test
Auth Service Test
Routing Service Test
Migration Test
Security Scan
Container SBOM & Secret Audit
Build & Push Docker Images
Deploy to Staging
E2E Browser Validation
```

5. Open the latest `Mobile Apps CI/CD` workflow if Android files changed.
6. Confirm courier and customer app builds are green.

Done criteria:

- Latest staging workflow is successful.
- Container SBOM and secret audit are successful.
- Mobile app workflow uses GitHub Secrets, not committed `google-services.json`.

### 7. Run VPS Verification Script

On the VPS:

```bash
cd /opt/tembus/app
chmod +x scripts/ops/verify-vps-security.sh
ENV_FILE=/opt/tembus/secrets/.env.production API_BASE_URL=https://api.your-domain.com ./scripts/ops/verify-vps-security.sh
```

Replace:

```text
https://api.your-domain.com
```

with the real API domain.

Expected result:

```text
Summary: 0 failure(s)
```

Warnings are acceptable only when they are understood. For example, if `gitleaks` or `trivy` is not installed on the VPS, CI must still run those gates successfully.

Done criteria:

- Script exits with code `0`.
- No default/weak secret marker appears in rendered Compose config.
- Production env file permission is `600` or `640`.
- Internal services are not exposed through public host ports.
- Live gateway health and CORS checks pass when `API_BASE_URL` is provided.

## Local Verification Commands

Run from repo root:

```bash
git ls-files -- .env
git log --all --full-history -- .env --format='%H %s'
git ls-files -- '**/google-services.json'
git ls-files | grep -E '(^|/)(auth-api|auth-service\.exe|auth_service_test\.exe|payment-api|gosec-report)$'
docker run --rm -v "$PWD:/repo" zricethezav/gitleaks:latest detect --source=/repo --redact --no-banner
bash -n scripts/ops/verify-vps-security.sh
```

Gateway:

```bash
cd backend/api-gateway
npm run test:auth-matrix
npm run test:cors
```

Admin-service security tests:

```bash
cd backend/admin-service
npm test -- --runInBand src/middlewares.test.ts src/middleware/auditTrail.test.ts src/middleware/errorMapper.test.ts src/controllers/courierAuth.controller.test.ts
```

Production Compose render test:

```bash
docker compose --env-file /opt/tembus/secrets/.env.production -f docker-compose.prod.yml config >/tmp/tembus-compose-rendered.yml
grep -Ei 'tembus_secret_key_change_me|changeme|guest:guest|postgres:1234|password=1234|PASSWORD_RAW|PASSWORD_URL_ENCODED|REDIS_PASSWORD_URL_ENCODED|RABBITMQ_PASSWORD_URL_ENCODED' /tmp/tembus-compose-rendered.yml && exit 1
rm -f /tmp/tembus-compose-rendered.yml
```

VPS final gate:

```bash
cd /opt/tembus/app
ENV_FILE=/opt/tembus/secrets/.env.production API_BASE_URL=https://api.example.com ./scripts/ops/verify-vps-security.sh
```

## Current Tree Cleanup Notes

- Real `android-app/app/google-services.json` and `android-app-customer/app/google-services.json` were removed from the tracked source tree.
- Example-only templates are available as:
  - `android-app/app/google-services.example.json`
  - `android-app-customer/app/google-services.example.json`
- Root `.gitignore` now ignores real `google-services.json` files while allowing the example templates.
- Migration `20240505000027_add_security_configs.sql` no longer seeds a hardcoded `pk_live` style value.
- `.gitleaksignore` contains only historical fingerprints that were either removed from current code or are example-only docs. Do not add new entries without first removing/rotating the underlying secret.

## Decision Rule

Production deploy is allowed only when:

- All local gates pass.
- The deletion commit removing tracked `google-services.json` and binary artifacts has been pushed.
- GitHub Actions staging is green.
- VPS verification script passes on the target server.
- External provider keys that appeared in historical commits are rotated or restricted.
