# Mobile release acceptance runtime — 2026-09-14

## Environment

- Device: `emulator-5554`, Pixel 6 Pro AVD, Android 17.
- Hosts were not changed by this run; staging API remains `https://api.bawain.my.id`.
- Test artifacts were temporary APKs under the host temp directory and are not release evidence or source inputs.
- No OTP or payment-provider call was attempted.

## Upgrade acceptance

For each package, a temporary prior debug APK was built with `versionCode=1` and `versionName=1.0.0`, installed, launched, then replaced with a current debug APK built with `versionCode=2` and `versionName=1.0.1` using `adb install -r`.

| App | Prior install / launch | Upgrade install | Current package | Current launch |
| --- | --- | --- | --- | --- |
| Customer | `Success`; `Status: ok`, `com.tembus.customer/.ui.MainActivity` | `Success` | `versionCode=2`, `versionName=1.0.1` | `Status: ok` |
| Courier | `Success`; `Status: ok`, `com.tembus.courier/.ui.MainActivity` | `Success` | `versionCode=2`, `versionName=1.0.1` | `Status: ok` |
| Merchant | `Success`; `Status: ok`, `com.tembus.merchant/.SplashActivity` | `Success` | `versionCode=2`, `versionName=1.0.1` | `Status: ok` |

This proves the package upgrade/install path and post-upgrade launch. It does not prove a production-version database migration because this acceptance task owns no schema migration.

## Low-memory/background resume

Command path: `adb shell am send-trim-memory <package> RUNNING_CRITICAL`, `KEYCODE_HOME`, then relaunch with `am start -W`.

- Customer, courier and merchant all returned `Status: ok`.
- The expected activity/package was resumed after backgrounding.
- `AndroidRuntime:E` contained no `FATAL EXCEPTION` for the run.

## Network loss/reconnect smoke

Wi-Fi and mobile data were disabled, each app was launched, connectivity was restored, and each app was launched again.

- Customer, courier and merchant returned `Status: ok` in both offline and reconnect launches.
- The expected package was resumed after reconnect and no fatal Android runtime exception was observed.
- This is generic app resilience only. Payment/order-tracking network switching remains unproven and is not checked in the master task.

## Dynamic Experience fallback

The targeted customer unit suite passed:

```text
android-app-customer/gradlew.bat :app:testDebugUnitTest --no-daemon --tests com.tembus.customer.config.ExperienceConfigRepositoryTest --tests com.tembus.customer.config.ExperienceConfigManagerTest --tests com.tembus.customer.ui.screens.payment.PaymentResumePolicyTest
BUILD SUCCESSFUL
```

The suite covers packaged default fallback, stale last-known-good manifest retention, failed asset staging, corrupted ETag fallback, unsupported schema/unknown-only component fallback and deterministic version selection.

## Performance and accessibility gate

- `python scripts/tasks/check_mobile_accessibility.py` — `PASS`; 195 Compose UI Kotlin files scanned, no null content descriptions, no explicit interactive icon below 48dp, scalable text and source contrast pairs pass.
- `python scripts/mobile/test_performance_gate.py` — `PASS` for the gate contract fixture.
- `python scripts/mobile/verify_performance_report.py --budgets scripts/mobile/performance_budgets.json --report docs/mobile/performance-reports/local-emulator-low-mid-20260914.json` — `FAIL`: missing high-tier measurements and actual low/mid cold-start/jank p95 exceedances.
- Release customer high-tier measurement was collected with 20 raw samples in `customer-release-high-20260914.json`; verifier `FAIL` because jank p95 was `100`, above the configured `8` budget.
- Golden screenshot, TalkBack/runtime accessibility, and a fully passing representative performance matrix remain open.

## Acceptance conclusion

Proven: upgrade path, low-memory/background resume, generic network loss/reconnect launch, dynamic revision fallback, and static accessibility contract. Unproven/failed: active-order process-death recovery, payment/order-tracking network switching, and the full performance/accessibility/golden release gate. No provider success was fabricated.
