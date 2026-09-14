# LeakCanary lifecycle evidence — 2026-09-14

## Traceability

- Device: `emulator-5554`, Android API 37 (`sdk_gphone16k_x86_64`)
- Build: debug variants for customer, courier and merchant
- Scenario: explicit activity launch, rotation/background transition, HOME,
  relaunch and force-stop; no production credentials or customer data used
- Result: LeakCanary initialized in all three apps; no FATAL EXCEPTION or ANR
  signal was observed in the filtered runtime log

## Redacted observations

| App | LeakCanary observation | Outcome |
| --- | --- | --- |
| Customer | Detector ready; `MainActivity` destroy callbacks were watched | No retained-object failure or crash signal in the bounded session |
| Courier | Detector ready; `MainActivity` destroy callbacks were watched; two temporary retained objects were reported below the heap-dump threshold and later all garbage-collected | No retained object remained at the end of the session |
| Merchant | Detector ready; `SplashActivity` destroy callback was watched; LeakCanary database was created | No retained-object failure or crash signal in the bounded session |

The session did not produce a heap-dump leak report because no object remained
retained long enough to cross LeakCanary's dump threshold. This is valid
debug-device leak testing evidence, not a claim of exhaustive soak, physical
device coverage, or production memory behavior.
