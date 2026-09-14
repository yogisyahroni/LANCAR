# Platform capability map — PART AG

| Capability | Canonical owner | API / events | Storage | Operational owner | Consumers |
|---|---|---|---|---|---|
| Identity/session | auth-service | `/api/v1/auth`, session events | auth tables | Auth on-call | all clients/services |
| Order truth | order-service | order APIs/events | orders/order events | Fulfilment on-call | customer, courier, merchant, admin |
| Payment intent/provider state | payment-service | payment-intent APIs/events, provider webhooks | `payment_intents`, `payment_intent_events` | Payment on-call | order, customer, admin, reconciliation |
| Refund/chargeback/reconciliation | payment-service + Finance ledger | refund/chargeback/reconciliation APIs | `payment_refunds`, `payment_chargeback_*`, ledger tables | Finance on-call | customer, support, admin, Finance |
| Payout/wallet liability | payment-service | payout/wallet APIs/events | wallet and payout tables | Finance on-call | courier, merchant, admin, Finance |
| Quote/pricing/fulfilment state | order-service | quote/order APIs/events | orders, quote snapshots, order events | Fulfilment on-call | customer, courier, merchant, admin |
| External logistics/provider capability | integration-gateway | capability, quote, tracking and webhook contracts | provider registry and inbox tables | Integrations on-call | order, customer, admin, support |
| Search/discovery | search-service | `/api/v1/search`, index events | search/index tables | Discovery on-call | customer web/mobile/admin |
| Communication | admin-service communication module | communication APIs/events | communication tables | Comms on-call | customer/courier/merchant/admin |
| Safety incident/evidence | order/admin safety boundary | safety center/SOS/admin queue | `safety_*`, private evidence storage | Safety on-call | customer/courier/admin/support |
| Support case/recovery | admin-service support module | support case/chat/escalation APIs | `support_*` | Support on-call | customer/courier/merchant/admin |
| Reputation/review/moderation | admin-service moderation boundary | review/report/appeal/admin APIs | `reputation_*` | Trust & Safety on-call | customer/merchant/courier/admin/risk |
| Loyalty/referral/membership | existing loyalty/referral + CRM tables | ledger, referral, entitlement events | `loyalty_*`, `crm_*`, Food membership tables | CRM/Finance on-call | customer, order, admin, analytics |
| CRM campaign delivery/experimentation | admin-service CRM module + Communication | campaign, exposure, conversion events | `crm_campaign_*`, communication tables | CRM on-call | customer, admin, Experiment/Data |
| Promo/subsidy accounting | order-service pricing + CRM accounting projection | quote/promo/reservation/reconciliation contracts | orders, promo and CRM reservation tables | Finance on-call | customer, merchant, admin, settlement |
| App Experience/feature rollout | admin-service control plane | manifest/flag/kill-switch APIs | experience/flag tables | Release on-call | customer/courier/merchant/admin |
| Mobile release/performance policy | repository release tooling + admin control plane | release contract and telemetry events | release metadata/telemetry stores | Mobile on-call | mobile clients, admin, SRE |
| Security/release controls | CI + owning services | authz, secret, scan and provenance contracts | CI artifacts, audit/security tables | Security on-call | all services and release owners |
| Operations/capacity/drills | SRE/control-room operating model | health, metric, alert and drill records | observability and evidence stores | SRE on-call | Product, Ops, Finance, Support, Safety |

No second source of truth is created for orders, money, maps, auth, flags,
campaign delivery, reputation signals, membership state, or provider
registration. Derived search, analytics and CRM projections retain a reference
to the owning source and are recomputable. The admin dashboard is served at
`admin.bawain.my.id` and calls the backend at `api.bawain.my.id`; it is not
served from the API hostname.
