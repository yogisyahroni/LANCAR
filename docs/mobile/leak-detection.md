# Android leak detection contract

All three Android apps declare
`com.squareup.leakcanary:leakcanary-android:2.14` as a
`debugImplementation`. LeakCanary is therefore available during development
and CI/debug-device sessions, but is excluded from the release dependency
graph. The source contract is checked by
`scripts/mobile/validate_mobile_static_contracts.py`.

## Execution

1. Build and install a debug variant for the app under investigation.
2. Exercise login, navigation, map/experience surfaces, active-order resume,
   media/POD and logout flows for at least one lifecycle cycle.
3. Background and recreate the activity, then inspect LeakCanary's retained
   object report after the heap analysis completes.
4. Attach the redacted report to the task evidence; never include tokens,
   customer content or screenshots containing personal data.

The repository currently proves the debug dependency wiring and all three app
unit-test suites. A device-level retained-object report is still a separate
runtime follow-up and must not be inferred from compilation alone.
