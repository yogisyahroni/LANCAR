# Gateway Route Auth Matrix

This matrix is the production gateway contract for public and protected routes.

| Route group | Requirement | Reason |
| --- | --- | --- |
| `POST /api/v1/auth/otp/send`, `POST /api/v1/auth/otp/verify`, customer login/register start | Public | Pre-auth identity flows with rate limiting and payload validation. |
| `/api/v1/auth/courier/*` | Public | Courier login, OTP verification, and onboarding links are public entrypoints. |
| `POST /api/v1/auth/web/login`, `POST /api/v1/auth/web/session/exchange`, `GET /api/v1/auth/web/delivery-services` | Public | Web login/session bootstrap and service discovery before authenticated order flow. |
| `/api/v1/maps/*` | Public | Runtime map configuration/geocode proxy needed before order placement. |
| `/api/v1/public/*` | Public | Public handoff links are scoped by downstream token validation. |
| `/api/v1/payments/midtrans/*` | Public | Provider webhook authenticated by downstream provider signature. |
| `POST /api/v1/pricing/estimate` | Public | Quote endpoint with gateway payload validation and rate limiting downstream. |
| `/api/v1/auth/web/*` except public web auth paths | Web session or JWT | Customer/admin web routes must present an HttpOnly session cookie or bearer token. |
| `/api/v1/customer/*` | Web session or JWT | Customer portal aggregate API. |
| `/api/v1/admin/*` | Admin session or JWT | Admin management API. |
| `/api/v1/orders/*`, `/api/v1/couriers/*`, `/api/v1/tracking/*` | JWT | Order/courier/tracking domain APIs are not anonymous. |
| `/api/v1/courier/*`, `/api/v1/mobile/*` | JWT | Courier mobile APIs are not anonymous. |
| `/api/v1/routing/*`, `/api/v1/wallet/*`, `/api/v1/payments/*` | JWT | Operational/financial APIs are not anonymous. |
| `/docs/*` | Ops protected | In production, docs return 404 unless `DOCS_BASIC_AUTH_USERNAME` and `DOCS_BASIC_AUTH_PASSWORD` are configured. |
| `/metrics` | Ops protected | In production, metrics require `Authorization: Bearer $METRICS_BEARER_TOKEN`. |

Implementation source of truth: `backend/api-gateway/src/routeAuthMatrix.ts`.
