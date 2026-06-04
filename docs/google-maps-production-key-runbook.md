# Google Maps Production Key Runbook

Last updated: 2026-06-04

Purpose: operate Google Maps Platform safely for TEMBUS without sharing one key across mobile, web, and backend surfaces.

## Key Model

Create separate keys per environment and platform:

| Environment | Surface | Key alias | Application restriction | API restrictions |
| --- | --- | --- | --- | --- |
| staging | Courier Android | `tembus-staging-android-courier-maps-key` | Android app: `com.tembus.courier` + release/debug SHA-1 as needed | Maps SDK for Android |
| staging | Customer Android | `tembus-staging-android-customer-maps-key` | Android app: `com.tembus.customer` + release/debug SHA-1 as needed | Maps SDK for Android |
| staging | Web/Admin | `tembus-staging-web-maps-key` | HTTPS HTTP referrers only | Maps JavaScript API |
| staging | Server | `tembus-staging-server-maps-key` | Backend egress IPs only | Routes API, Geocoding API |
| production | Courier Android | `tembus-production-android-courier-maps-key` | Android app: `com.tembus.courier` + release SHA-1 | Maps SDK for Android |
| production | Customer Android | `tembus-production-android-customer-maps-key` | Android app: `com.tembus.customer` + release SHA-1 | Maps SDK for Android |
| production | Web/Admin | `tembus-production-web-maps-key` | Production HTTPS HTTP referrers only | Maps JavaScript API |
| production | Server | `tembus-production-server-maps-key` | Production backend egress IPs only | Routes API, Geocoding API |

Do not reuse a key across staging and production. Do not reuse Android keys between courier and customer apps. Do not put server keys into APKs or browser bundles.

References:

- Google Maps Platform API key security best practices: https://developers.google.com/maps/api-security-best-practices
- Maps JavaScript API key setup: https://developers.google.com/maps/documentation/javascript/get-api-key
- Maps JavaScript API troubleshooting: https://developers.google.com/maps/documentation/javascript/troubleshooting

## Runtime Storage

Server-side Google Maps credentials must be managed from Admin > Maps Runtime:

1. Generate a server key restricted to backend egress IPs and APIs.
2. In Admin > Maps Runtime, paste the key in Google server key.
3. Click `Test key`.
4. Only after Geocoding and Routes checks pass, click `Save & activate`.
5. Confirm Production Key Model status moves away from server-key missing.

Plaintext server keys are encrypted at rest in `maps_provider_credentials` and are never returned by the API after save. Production requires `MAPS_CREDENTIAL_ENCRYPTION_KEY`.

## Non-Secret Metadata

The admin readiness endpoint can show mobile/web posture without storing mobile secrets on the backend. Set these metadata env values on the deployment:

```env
GOOGLE_MAPS_ANDROID_COURIER_KEY_CONFIGURED=true
GOOGLE_MAPS_ANDROID_COURIER_KEY_ALIAS=tembus-production-android-courier-maps-key
GOOGLE_MAPS_ANDROID_COURIER_KEY_RESTRICTION=android_package_sha1
GOOGLE_MAPS_ANDROID_COURIER_KEY_APIS=maps_sdk_android
GOOGLE_MAPS_ANDROID_COURIER_KEY_ROTATED_AT=2026-06-04

GOOGLE_MAPS_ANDROID_CUSTOMER_KEY_CONFIGURED=true
GOOGLE_MAPS_ANDROID_CUSTOMER_KEY_ALIAS=tembus-production-android-customer-maps-key
GOOGLE_MAPS_ANDROID_CUSTOMER_KEY_RESTRICTION=android_package_sha1
GOOGLE_MAPS_ANDROID_CUSTOMER_KEY_APIS=maps_sdk_android
GOOGLE_MAPS_ANDROID_CUSTOMER_KEY_ROTATED_AT=2026-06-04

GOOGLE_MAPS_WEB_KEY_CONFIGURED=true
GOOGLE_MAPS_WEB_KEY_ALIAS=tembus-production-web-maps-key
GOOGLE_MAPS_WEB_KEY_RESTRICTION=http_referrer
GOOGLE_MAPS_WEB_KEY_APIS=maps_javascript_api
GOOGLE_MAPS_WEB_KEY_ROTATED_AT=2026-06-04
```

Actual Android key values should live in GitHub environment secrets used by mobile CI:

- `GOOGLE_MAPS_ANDROID_COURIER_API_KEY` or `COURIER_GOOGLE_MAPS_ANDROID_API_KEY`
- `GOOGLE_MAPS_ANDROID_CUSTOMER_API_KEY` or `CUSTOMER_GOOGLE_MAPS_ANDROID_API_KEY`

Release builds fail if the app-specific key is missing or malformed. `GOOGLE_MAPS_ANDROID_API_KEY` is debug-only fallback.

## Rotation

Default maximum age is 90 days.

Server key rotation:

1. Create a new server key in Google Cloud with IP and API restrictions.
2. In Admin > Maps Runtime, `Test key`.
3. `Save & activate`.
4. Monitor Recent maps events for key alias and route success.
5. Revoke the old server key after traffic is healthy.

Android key rotation:

1. Create a new app-specific key with package name and SHA-1 restriction.
2. Update GitHub environment secret for the app.
3. Build and distribute a new APK/AAB.
4. Keep the old key during adoption grace period.
5. Revoke the old key after active versions have migrated.

Web key rotation:

1. Create a new browser key with HTTPS referrer restrictions.
2. Update deployment secret/env.
3. Rebuild/deploy web/admin containers.
4. Confirm Maps JavaScript loads and admin readiness stays healthy.
5. Revoke old key.

## Quota And Incident Response

Set Google Cloud quota and billing alerts per restricted key. In TEMBUS admin, watch:

- `google_maps_quota_near_limit`
- `maps_provider_failure_high`
- `maps_fallback_rate_high`
- `maps_straight_line_fallback_high`
- `maps_latency_high`

If quota or provider failure is active:

1. Open Admin > Maps Runtime.
2. Click `Restore OpenStreetMap` if visual map fallback is acceptable.
3. If maps are still unstable, click `Activate Text-Only Mode`.
4. Check Google billing/quota/API enablement.
5. Return to Google only after route/geocode checks pass.

## Verification

Backend:

```bash
cd backend/admin-service
npm test -- src/services/mapsProductionReadiness.test.ts src/services/mapsRuntimeCredentials.test.ts src/services/mapsProviderConfig.test.ts src/security/logRedaction.test.ts
npm run build
```

Admin dashboard:

```bash
cd admin-dashboard
VITE_API_URL=https://admin.bawain.my.id/api/v1 VITE_SOCKET_URL=https://admin.bawain.my.id npm run build
```

Android debug smoke:

```bash
cd android-app
.\gradlew.bat :app:assembleDebug

cd ..\android-app-customer
.\gradlew.bat :app:assembleDebug
```
