# Mobile telemetry runtime smoke — 2026-09-14

## Scope

This is a redacted runtime smoke record for the three Android clients built
from staging commit `3f8f58fe`. It proves that the local telemetry hooks execute
without blocking the app. It is not proof of provider-side Firebase export.

## Environment

- Device: `emulator-5554` high compatibility proxy
- Android: API 37 / Android 17
- Display: 1440x3120, 560 dpi
- Network: staging API reachable
- Installation: current debug APKs from `assembleDebug`

## Observed runtime events

| Client | Explicit activity launch | Observed bounded event logs | Fatal exception | Resumed activity |
| --- | --- | --- | --- | --- |
| Customer | `com.tembus.customer/.ui.MainActivity` | `api_request`, `app_start`, `screen_view`, `frame_budget` | none in filtered log | `com.tembus.customer/.ui.MainActivity` |
| Courier | `com.tembus.courier/.ui.MainActivity` | `app_start`, `api_request`, `screen_view`, `frame_budget` | none in filtered log | `com.tembus.courier/.ui.MainActivity` |
| Merchant | `com.tembus.merchant/.MainActivity` | `app_start`, `api_request`, `screen_view`, `frame_budget` | none in filtered log | `com.tembus.merchant/.MainActivity` |

Commands used:

```text
.\gradlew.bat :app:assembleDebug --no-daemon       # run in each Android module
adb -s emulator-5554 install -r <current-debug-apk>
adb -s emulator-5554 shell am start -n <explicit-activity>
adb -s emulator-5554 logcat -d -v brief -s MobileTelemetry:V FirebaseInitializer:W AndroidRuntime:E
adb -s emulator-5554 shell dumpsys activity activities
```

The log filter retained only event names, Firebase configuration warnings and
fatal-runtime markers. No request payload, token, email, phone, order ID or
raw correlation ID was copied into this record.

## Staging correlation boundary

An HTTP GET to `https://api.bawain.my.id/health` with a synthetic request ID
returned HTTP 200 and both `X-Request-ID` and `X-Correlation-ID` response
headers. The exact ID value is intentionally omitted. This confirms the
staging gateway contract used by the mobile interceptors; a provider-side
telemetry export sample remains a separate release follow-up.

## Limitations

- Merchant log confirms the expected fail-open warning because no Firebase
  project resource is present in the repository/device.
- Firebase/analytics console export was not inspected.
- This smoke does not replace the compatibility matrix or accessibility gate.
