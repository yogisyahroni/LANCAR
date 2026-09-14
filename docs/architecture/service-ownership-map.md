# Service ownership map — PART AG

| Service/module | Boundary | Primary owner/on-call | Recovery dependency |
|---|---|---|---|
| auth-service | identity, sessions, OTP adapter boundary | Auth / Security | database, provider-neutral OTP fallback |
| order-service | order state, fulfilment, tracking, safety domain | Fulfilment / Ops | database, routing, notification |
| payment-service | payment intents, provider adapters, wallet/ledger integration | Finance / Payment | database, provider callback, reconciliation |
| admin-service | admin/control-plane APIs, support, moderation, CRM | Operations / Security | database, Redis, bounded service APIs |
| api-gateway | public routing, auth context, resilience/limits | Platform / SRE | all upstream health endpoints |
| search-service | derivative discovery index and ranking | Discovery | database/index, vertical fallback |
| customer web (`app.bawain.my.id`) | customer discovery, quote, order, payment recovery and support presentation | Customer Web on-call | API gateway, order/payment snapshots, Experience config |
| customer Android | customer presentation, offline recovery and safe mutation retry | Customer Mobile on-call | API gateway, encrypted local state, store rollout policy |
| courier Android | offer, active-job, proof, earnings and location presentation | Courier Mobile on-call | order/routing APIs, location service, store rollout policy |
| merchant Android/web | merchant acceptance, prep, menu and settlement presentation | Merchant Product on-call | merchant/order APIs, local cache, store rollout policy |
| admin dashboard (`admin.bawain.my.id`) | operator UI for payment, safety, support, CRM, reputation and release controls | Admin/Ops on-call | admin-service APIs, audit trail, control-room alerts |
| SRE/control room | promotion, alerting, capacity and failure-drill coordination | Platform SRE on-call | observability, runbooks, rollback artifacts |

The admin UI is a consumer of admin APIs and is deployed separately at
`admin.bawain.my.id`. Any change crossing a row requires a contract, owner,
observability, rollback/recovery, and dependency review.
