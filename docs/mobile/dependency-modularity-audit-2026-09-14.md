# Android dependency and delivery audit — 2026-09-14

## Decision

The three Android applications use one base module each. Direct dependency
hygiene is enforced by `scripts/mobile/audit_dependency_modularity.py`:

- no duplicate literal direct coordinates are present;
- customer no longer declares the unused Retrofit Gson converter or Coil GIF
  decoder; and
- language, density and ABI bundle splits are enabled for customer, courier and
  merchant.

The audit evaluated the large SDKs currently used by real flows:

| App | Evaluated SDKs | Current delivery decision |
| --- | --- | --- |
| Customer | TomTom maps, WebRTC, CameraX | Keep in base module: booking/tracking, communication and photo flows are release-critical and tightly wired. |
| Courier | TomTom maps, WebRTC, CameraX, ML Kit | Keep in base module: active-order navigation, communication, POD and identity flows are release-critical. |
| Merchant | OSMDroid | Keep in base module: store registration/location editing is part of the authenticated merchant shell. |

Dynamic feature extraction is not justified by the current evidence: the
candidate SDKs are coupled to core screens, and no store-side dynamic-feature
delivery or independent module boundary exists in this repository. Revisit the
decision when release artifact trend data identifies a material size budget
breach and after a tested boundary preserves active-order/support recovery.

## Verification

    command: python scripts/mobile/audit_dependency_modularity.py
    result: PASS — duplicate direct coordinates absent, unused customer converter/GIF declarations absent, bundle splits present, and all listed optional SDK/source pairs evaluated.

    command: python scripts/mobile/validate_mobile_release_contract.py
    result: PASS — courier/customer/merchant release inventory wiring remains valid.

## Limitations

This source audit does not claim a controlled CI release trend, transitive
Gradle graph convergence, or Play Store dynamic-feature validation. Those remain
release follow-ups for `MOBILE-2026-006`.
