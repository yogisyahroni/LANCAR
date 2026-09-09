# Mobile compatibility matrix and rollout governance

## Supported client matrix

| Client | Platform | Current schema | Minimum build policy | Update source |
| --- | --- | ---: | ---: | --- |
| Customer | Android | 1 | `MOBILE_CUSTOMER_MIN_VERSION_CODE` | backend metadata; debug may use GitHub Releases |
| Courier | Android | 1 | `MOBILE_COURIER_MIN_VERSION_CODE` | backend metadata; debug may use GitHub Releases |
| Merchant | Android | 1 | `MOBILE_MERCHANT_MIN_VERSION_CODE` | backend metadata; debug may use GitHub Releases |
| Customer web | Web | 1 | `MOBILE_WEB_MIN_VERSION_CODE` | web deployment |

The initial rollout window supports build code `1` and schema `1` for all
clients. The server contract is intentionally ready to raise the minimum after
a newer client is distributed.

## Release sequence independent of app stores

1. Ship additive server fields and compatibility metadata first.
2. Release the client that understands the new optional fields/schema.
3. Canary dynamic flags by market/cohort and verify server compatibility
   telemetry and transaction invariants.
4. Raise the minimum build only after the canary is healthy. Older clients then
   receive an explicit update-required response instead of an unsupported
   dynamic feature.
5. Increase rollout independently of Play Store percentage rollout. Pause the
   server canary without waiting for a store submission.
6. On regression, disable the dynamic flag, restore the previous minimum/schema
   policy, and roll back the server release to the known-good version. Do not
   roll back authoritative financial data as an application rollback shortcut.

## Country launch gate

For each country/market, record the client build, API schema, market config
version, enabled capabilities, rollout percentage, canary cohort, owner and
rollback target. A market must not expose a capability to a client whose
declared schema or compiled capability does not support it.

## Failure handling

- `compatible`: normal dynamic presentation may be returned.
- `upgrade_required`: update metadata remains available; incompatible dynamic
  features are withheld and the client shows the update-required state.
- `unknown`: legacy-safe mode; dynamic flags are withheld while
  server-authoritative transaction APIs remain available.

The actual staging and production smoke runs belong to the release/launch gate.
This matrix is the compatibility contract used before those environment runs.
