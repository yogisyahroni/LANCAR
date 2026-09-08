# Mobile device/support matrix

This matrix is the execution contract for performance-budget measurements. It separates reproducible local proxies from the physical/device and telemetry validation still needed for release readiness.

| Tier | Local proxy | Resource profile | Required local measurements | Physical follow-up |
| --- | --- | --- | --- | --- |
| Low | Pixel 5 AVD or equivalent | 1.5 GiB RAM, 2 cores, 1080x2340 | cold/warm p95, PSS p95, jank p95, network p95, artifact size | Android Go or market low-memory device; permission/startup/offline checks |
| Mid | Pixel 6 AVD or equivalent | 2 GiB RAM, 4 cores, 1080x2400 | same launch matrix | market-share mid-range device; network switch and resume |
| High | Pixel 6 Pro AVD or equivalent | 4 GiB RAM, 6 cores, 1440x3120 | same launch matrix | current flagship; rotation, large display and process restore |

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
