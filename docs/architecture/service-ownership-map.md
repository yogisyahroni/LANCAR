# Service ownership map — PART AG

| Service/module | Boundary | Primary owner/on-call | Recovery dependency |
|---|---|---|---|
| auth-service | identity, sessions, OTP adapter boundary | Auth / Security | database, provider-neutral OTP fallback |
| order-service | order state, fulfilment, tracking, safety domain | Fulfilment / Ops | database, routing, notification |
| payment-service | payment intents, provider adapters, wallet/ledger integration | Finance / Payment | database, provider callback, reconciliation |
| admin-service | admin/control-plane APIs, support, moderation, CRM | Operations / Security | database, Redis, bounded service APIs |
| api-gateway | public routing, auth context, resilience/limits | Platform / SRE | all upstream health endpoints |
| search-service | derivative discovery index and ranking | Discovery | database/index, vertical fallback |
| mobile apps | customer/courier/merchant presentation and offline state | Mobile | API, local cache, store rollout policy |

The admin UI is a consumer of admin APIs and is deployed separately at
`admin.bawain.my.id`. Any change crossing a row requires a contract, owner,
observability, rollback/recovery, and dependency review.
