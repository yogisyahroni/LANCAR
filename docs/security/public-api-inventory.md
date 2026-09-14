# Public API inventory and abuse-control policy

This inventory is the repository-level contract for the staging edge. It keeps
the customer/admin UI host separate from the API origin:

| Surface | Staging URL | Responsibility |
| --- | --- | --- |
| Backend API | `https://api.bawain.my.id` | Mobile/web API, authenticated admin API, provider callbacks |
| Customer web | `https://app.bawain.my.id` | Customer UI only |
| Admin dashboard | `https://admin.bawain.my.id` | Admin UI only; its API origin is the backend API above |
| Landing | `https://bawain.my.id/` | Public marketing/content surface |

The inventory is intentionally expressed as endpoint families so new routes do
not inherit an undocumented public exposure. The concrete route ownership is in
`backend/admin-service/src/routes/{public,order,admin}.routes.ts`, the gateway
policy is in `backend/api-gateway/src/routeAuthMatrix.ts`, and rate-limit
definitions are in `backend/admin-service/src/rateLimit.ts`.

| Endpoint family | Client/risk class | Required controls |
| --- | --- | --- |
| `/auth/*`, `/api/v1/auth/*` | Login, session, OTP and credential abuse | Auth-specific throttling, generic failure responses, secure session/cookie policy, no secrets in logs |
| `/api/v1/search/*`, `/api/v1/maps/geocode`, `/api/v1/maps/reverse-geocode`, `/api/v1/maps/route` | Expensive read/provider quota | Public/read rate limit where anonymous, authenticated identity limits where applicable, bounded query/page size, provider circuit/TTL cache |
| `/api/v1/logistics/*`, quote/tariff and eligibility reads | Pricing/dispatch amplification | Auth or public read policy per route, bounded inputs, server-authoritative market/currency/amount, no client-selected final price |
| `/api/v1/customer/orders/*`, tracking and active-order reads | Customer data and recovery | Mobile/web authentication, order ownership or scoped share token, coarse public share data, active-order recovery remains available during kill-switches |
| Customer mutations (`POST/PATCH/PUT/DELETE` under `/api/v1/customer/*`) | Replay/financial/state mutation | Authentication, request validation, route-specific rate limit, `X-Idempotency-Key` for money/safety/CRM mutations, server transaction/state authority |
| `/api/v1/mobile/orders/*/conversation`, calls and read receipts | Communication abuse/privacy | Auth, communication read/message/call rate limits, order participant checks, bounded body/attachments, no cross-order access |
| `/api/internal/*` | Service-to-service mutation | Internal API key/signature or service identity, constant-time credential comparison, explicit scope, no browser exposure, audit for high-impact mutations |
| `/admin/*` | Privileged operator surface | Admin authentication + role allow-list, TOTP for high-impact mutations, idempotency for mutations, audit log, sensitive-data redaction |
    | Payment/provider webhooks and callbacks | Forged/replayed provider events | provider signature verification, provider/event uniqueness, raw payload retention under access policy, normalized state machine, reconciliation/UNKNOWN path, no blind retry charge |
| `/api/v1/safety/*` and active-order safety actions | High-severity safety/privacy | Auth and order ownership, idempotency, explicit consequence/fallback, location/contact minimization, safety escalation isolation from ordinary support |

## Release and edge validation

Repository controls prove route ownership, authentication/rate-limit wiring,
idempotency boundaries and callback verification. WAF/DDoS configuration,
provider-callback allowlisting, edge dashboards and vendor quotas are runtime
release evidence and must be checked against the actual staging/production edge
before a market launch. A reachable staging URL alone is not evidence that a
WAF or provider allowlist is configured.

## Non-negotiable recovery rule

Abuse controls may reject excess new work, but must not remove access to an active-order safety/support surface or strand a customer in an in-progress payment recovery flow. Any exception or temporary limit change is scoped,
time-bounded, observable and audited.
