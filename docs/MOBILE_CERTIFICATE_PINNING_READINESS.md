# Mobile Certificate Pinning Readiness

Scope: Courier Android app and Customer Android app.

Certificate pinning is prepared but intentionally disabled by default. Enable it only after the production API domain, TLS termination layer, and certificate rotation process are final.

## Required Configuration

Use these environment values in CI or the release build environment:

- `API_CERT_PINNING_REQUIRED`
- `API_CERT_SHA256_PIN_PRIMARY`
- `API_CERT_SHA256_PIN_BACKUP`

`API_CERT_PINNING_REQUIRED` accepted enabled values:

- `true`
- `1`
- `yes`
- `on`
- `required`

When `API_CERT_PINNING_REQUIRED` is not enabled, release builds still require HTTPS through the existing release API validation, but OkHttp certificate pinning is not installed.

## Pin Format

Pins must use OkHttp format:

```text
sha256/<base64-spki-sha256>
```

Both primary and backup pins are required when strict pinning is enabled. The backup pin must be different from the primary pin.

## Get A Pin

Replace `api.example.com` with the final production API host.

```bash
openssl s_client -connect api.example.com:443 -servername api.example.com </dev/null 2>/dev/null \
  | openssl x509 -pubkey -noout \
  | openssl pkey -pubin -outform der \
  | openssl dgst -sha256 -binary \
  | openssl enc -base64
```

Then prefix the result with `sha256/`.

Example shape:

```text
sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=
```

Do not copy this example value into production.

## Rotation Strategy

Use two pins before enabling strict pinning:

- Primary: current certificate public key pin.
- Backup: next certificate public key pin or CA/intermediate public key pin approved for rotation.

Safe rotation flow:

1. Release app version A with current primary pin and future backup pin.
2. Wait until most active users have version A.
3. Rotate the server certificate to the backup key/certificate.
4. Release app version B with the new primary pin and a new backup pin.
5. Never deploy a server certificate that is not represented by either the current app primary or backup pin.

## Build Behavior

Release build behavior:

- `BASE_URL` must be HTTPS.
- If `API_CERT_PINNING_REQUIRED=false` or unset, release builds do not require pin values.
- If `API_CERT_PINNING_REQUIRED=true`, Gradle fails before building if primary/backup pins are missing, malformed, or identical.
- At runtime, OkHttp installs `CertificatePinner` only in non-debug builds and only when strict pinning is enabled.

Debug behavior:

- Debug builds do not install certificate pinning.
- Debug can continue using local/emulator API URLs for development.

## Verification

Before enabling strict production pinning:

1. Run release build with `API_CERT_PINNING_REQUIRED=false`.
2. Run release build with `API_CERT_PINNING_REQUIRED=true` and valid staging pins.
3. Install the pinned staging/internal build.
4. Confirm login/API calls work.
5. Change staging certificate to the backup key/certificate.
6. Confirm the same app version still works.
7. Confirm an intentionally wrong pin blocks API calls.

Only enable strict production pinning after the staging rotation test passes.
