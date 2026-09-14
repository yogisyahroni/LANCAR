# Mobile device/support matrix

This matrix is the execution contract for performance-budget measurements. It separates reproducible local proxies from the physical/device and telemetry validation still needed for release readiness.

## Version policy (2026-09-14)

- Minimum supported Android: API 26 (Android 8.0), enforced by all three
  application modules' `minSdk`.
- Compile/target Android: API 36, enforced by all three application modules'
  `compileSdk`/`targetSdk`.
- The connected-device evidence available in this repository includes a
  RMX2061 running Android 11 (API 30) and Android 17 (API 37) emulator runs.
  The RMX2061 result is a real-device launch baseline; it is not silently
  promoted to permission or form-factor coverage.

| Tier | Local proxy | Resource profile | Required local measurements | Physical follow-up |
| --- | --- | --- | --- | --- |
| Low | Pixel 5 AVD or equivalent | 1.5 GiB RAM, 2 cores, 1080x2340 | cold/warm p95, PSS p95, jank p95, network p95, artifact size | Android Go or market low-memory device; permission/startup/offline checks |
| Mid | Pixel 6 AVD or equivalent | 2 GiB RAM, 4 cores, 1080x2400 | same launch matrix | market-share mid-range device; network switch and resume |
| High | Pixel 6 Pro AVD or equivalent | 4 GiB RAM, 6 cores, 1440x3120 | same launch matrix | current flagship; rotation, large display and process restore |

The resource values above are the required test profiles, not assumptions about
what an emulator actually provided. On 2026-09-14 the Pixel 5 AVD accepted a
minimum of 2 GiB/4 cores, and the Pixel 6 Pro run provided 3 GiB/4 cores; those
observations are recorded as emulator proxies rather than relabeled as the
required low/high hardware profiles.

## Observed compatibility evidence

| Surface | Device evidence | Result | Source / limitation |
| --- | --- | --- | --- |
| Customer, Courier, Merchant phone launch | `emulator-5554`, Pixel 6 Pro shape, Android 17/API 37, 3 GiB/4 cores, 1440x3120 | PASS — process death/resume, dark/light, 130% font scale and rotation all returned the owning activity resumed with no crash-log match | [`mobile-compatibility-smoke-pixel6pro-20260914.json`](compatibility-reports/mobile-compatibility-smoke-pixel6pro-20260914.json) |
| Large-screen responsive branch | Same emulator with temporary 2560x3600 / 420dpi viewport | PASS — customer and courier activities resumed; merchant was first intercepted by Android's notification permission controller, then the permission was granted in the test state and the main activity resumed | Controlled `adb wm` smoke; not a tablet/foldable hardware claim |
| Low proxy launch | Pixel 5 AVD, Android 17/API 37, observed 2 GiB/4 cores | PASS for the recorded 20-sample launch reports; a later full compatibility run was invalidated by a System UI ANR and is not used as PASS evidence | `performance-reports/*-low-pixel5-20260914.json`; physical low-memory/Android Go remains open |
| Real mid-range baseline | RMX2061, Android 11/API 30, connected-device reports | PASS for recorded launch baseline only | `performance-reports/*-mid-rmx2061.json`; permission/theme/form-factor smoke was not rerun on this device |

No tablet or foldable AVD/physical device is authorized on this host. The
customer and merchant shells have an explicit `BoxWithConstraints` wide-layout
branch; hinge posture, multi-window and physical tablet input remain release
follow-up rather than fabricated completion.

## Apps and surfaces

| App | Package | Required surface now | Next surface expansion |
| --- | --- | --- | --- |
| Courier | `com.tembus.courier` | first usable launch via `.ui.MainActivity` | active offer/order, map, POD |
| Customer | `com.tembus.customer` | first usable launch via `.ui.MainActivity` | booking, payment, tracking |
| Merchant | `com.tembus.merchant` | splash → first usable launch via `.SplashActivity` | order/KDS, catalog, settlement |

## Measurement ownership

- Startup, memory, jank, network bytes and artifact size: `scripts/mobile/measure_performance.py`.
- Percentile threshold decision: `scripts/mobile/verify_performance_report.py` and `scripts/mobile/performance_budgets.json`.
- Crash/ANR by app version, OS/device, market and screen: the mobile observability implementation under `MOBILE-2026-002` / `MOBILE-2026-009`.
- Battery/location/background constraints: `MOBILE-2026-004`.
- Compatibility, permissions, dark/light, dynamic text, rotation and process death: `MOBILE-2026-007` / `MOBILE-2026-010`.

No physical device result is inferred from a local proxy. The evidence report must identify the emulator/device serial, resource profile, app version/commit, sample count and actual p95 values.
