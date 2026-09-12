# Platform capability map — PART AG

| Capability | Canonical owner | API / events | Storage | Operational owner | Consumers |
|---|---|---|---|---|---|
| Identity/session | auth-service | `/api/v1/auth`, session events | auth tables | Auth on-call | all clients/services |
| Order truth | order-service | order APIs/events | orders/order events | Fulfilment on-call | customer, courier, merchant, admin |
| Payment intent/ledger | payment-service + existing Finance ledger | payment intent/internal event APIs | `payment_*`, ledger tables | Finance on-call | order, admin, reconciliation |
| Search/discovery | search-service | `/api/v1/search`, index events | search/index tables | Discovery on-call | customer web/mobile/admin |
| Communication | admin-service communication module | communication APIs/events | communication tables | Comms on-call | customer/courier/merchant/admin |
| Safety incident | order/admin safety boundary | safety center/SOS/admin queue | `safety_*` | Ops Security | customer/courier/admin |
| Reputation | admin-service moderation boundary | review/report/admin APIs | `reputation_*` | Trust & Safety | customer/admin/risk |
| Loyalty/CRM | existing loyalty/referral + CRM tables | campaign/referral/ledger events | `loyalty_*`, `crm_*` | CRM/Finance | customer/admin/analytics |
| Mobile release policy | admin-service | release policy APIs | mobile release tables | Mobile on-call | mobile clients/admin |

No second source of truth is created for orders, money, maps, auth, flags,
campaign delivery, or provider registration. The admin dashboard is served at
`admin.bawain.my.id` and calls the backend at `api.bawain.my.id`; it is not
served from the API hostname.
