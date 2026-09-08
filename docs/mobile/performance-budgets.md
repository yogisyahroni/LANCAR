# Mobile performance budgets

Status: active policy for `MOBILE-2026-001`.

The machine-readable source is [`scripts/mobile/performance_budgets.json`](../../scripts/mobile/performance_budgets.json). The release decision is made by [`scripts/mobile/verify_performance_report.py`](../../scripts/mobile/verify_performance_report.py), which fails when a required app/surface/tier is missing, has fewer than 20 raw samples, or exceeds a p95 budget. Averages are not accepted as a release signal.

## Scope and tiers

The measured surface is the first usable `launch` surface for all three Android apps:

| App | Package | Launch activity | Low | Mid | High |
| --- | --- | --- | --- | --- | --- |
| Courier | `com.tembus.courier` | `.ui.MainActivity` | 1.5 GiB / 2 cores | 2 GiB / 4 cores | 4 GiB / 6 cores |
| Customer | `com.tembus.customer` | `.ui.MainActivity` | 1.5 GiB / 2 cores | 2 GiB / 4 cores | 4 GiB / 6 cores |
| Merchant | `com.tembus.merchant` | `.SplashActivity` | 1.5 GiB / 2 cores | 2 GiB / 4 cores | 4 GiB / 6 cores |

These are reproducible emulator resource proxies at 1080x2340, 1080x2400 and 1440x3120. The low/mid/high proxy results do not replace a field-device matrix; the physical Android Go/low-memory, market-share mid-range and flagship follow-ups are explicitly retained for release validation.

## Budgets

Budgets are p95 limits for each raw-sample distribution, unless stated otherwise:

| Metric | Courier / Customer launch | Merchant launch | Collection |
| --- | ---: | ---: | --- |
| Cold start | 3500 ms | 2500 ms | `am start -W` after `am force-stop` |
| Warm start | 1500 ms | 1200 ms | `am start -W` with process warm |
| Peak app memory | 512 MiB PSS | 384 MiB PSS | `dumpsys meminfo` |
| Janky frames | 8% | 8% | `dumpsys gfxinfo` after one standard vertical swipe |
| Launch network bytes | 3 MiB | 2 MiB | `dumpsys netstats` UID delta |
| Debug APK artifact | 300 MiB | 200 MiB | filesystem artifact size |

Crash-free sessions/users, ANR, battery/location cost, background work, API request count and release-size telemetry remain governed release signals. Their owners and collection paths are documented in the device matrix and later mobile observability tasks; this task's deterministic gate covers the app-start performance surface and artifact budget.

## Measurement and release gate

Build a debug artifact, start the selected emulator/device, and collect at least 20 runs:

```powershell
python scripts/mobile/measure_performance.py `
  --app merchant `
  --package com.tembus.merchant `
  --activity com.tembus.merchant/.SplashActivity `
  --tier mid `
  --device-profile "2 GiB/4 cores/1080x2400" `
  --apk android-app-merchant/app/build/outputs/apk/debug/app-debug.apk `
  --output docs/mobile/performance-reports/merchant-mid.json

python scripts/mobile/verify_performance_report.py `
  --budgets scripts/mobile/performance_budgets.json `
  --report docs/mobile/performance-reports/all-tiers.json

python scripts/mobile/merge_performance_reports.py `
  --output docs/mobile/performance-reports/all-tiers.json `
  docs/mobile/performance-reports/courier-low.json `
  docs/mobile/performance-reports/courier-mid.json `
  docs/mobile/performance-reports/courier-high.json `
  docs/mobile/performance-reports/customer-low.json `
  docs/mobile/performance-reports/customer-mid.json `
  docs/mobile/performance-reports/customer-high.json `
  docs/mobile/performance-reports/merchant-low.json `
  docs/mobile/performance-reports/merchant-mid.json `
  docs/mobile/performance-reports/merchant-high.json
```

The collector emits raw samples. The merge command rejects duplicate matrix cells. Each run force-stops for cold start, backgrounds the still-warm process before warm start, and uses one fixed vertical swipe before reading frame stats so jank is not a one-frame artifact. The verifier computes the nearest-rank p95, checks all 3 apps × launch surface × 3 tiers, and exits non-zero on missing/insufficient data or regression. The Android workflow runs the fail-closed gate contract before any app build; a dashboard may display the same samples but cannot override this gate.

## Interpretation

- `PASS` means the collected report covers the required matrix and meets every local p95/artifact threshold.
- `FAIL` means the release candidate is not eligible for promotion until the real regression is fixed or the policy is explicitly reviewed and versioned.
- Emulator proxy `PASS` is not a claim of production crash-free rate or physical-device parity; those remain separate release evidence.
