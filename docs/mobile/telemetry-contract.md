# Mobile telemetry contract — PART AC

Mobile telemetry is operational evidence, not a second customer-data store.
Every event name is allowlisted and every dimension is bounded before it is
sent to analytics, Crashlytics or an observability backend.

## Allowlisted event families

| Family | Event names | Required bounded dimensions |
| --- | --- | --- |
| screen | `screen_view`, `screen_error` | `app`, `screen_id`, `market_code`, `app_version`, `outcome` |
| network | `api_request`, `network_recovery` | `app`, `operation`, `status_class`, `market_code`, `app_version`, `outcome` |
| startup | `app_start`, `startup_regression` | `app`, `startup_mode`, `app_version`, `outcome`, `latency_bucket` |
| frame | `frame_budget` | `app`, `surface`, `device_tier`, `app_version`, `outcome` |
| experience | `manifest_fetch_success`, `manifest_fetch_failure`, `manifest_cache_hit`, `manifest_schema_fallback`, `section_render_failure`, `asset_broken`, `deeplink_failure` | `app`, `market_code`, `manifest_revision`, `config_source`, `error_code` |

## Privacy and cardinality rules

- Never put email, phone, address, order text, coordinates, tokens, raw
  response bodies or user IDs in an event or metric label.
- `market_code`, `app_version`, `screen_id`, `operation`, `error_code` and
  `device_tier` must come from bounded allowlists or be normalized to an
  `unknown` bucket.
- Correlation is carried as a request/support reference (`X-Request-ID` and
  backend `correlation_id`) for debugging, not as a high-cardinality metric label
  label. It may be retained in crash context only when a failure exists.
- Response bodies are disabled in release HTTP logging. Telemetry failure is
  best-effort and cannot block an order, payment, safety or active-order
  recovery path.

## Current implementation mapping

- Customer and Courier add `X-Request-ID`, retain a sanitized support reference
  for failed calls and clear it after a successful response.
- Merchant uses the same interceptor/reference boundary in its manual DI
  `ApiClient`.
- Customer Experience telemetry uses the allowlisted event family above and
  records manifest revision/source rather than raw campaign/user data.
- The performance collector writes raw samples to release evidence files; it
  does not send device content or credentials to telemetry.
