# Customer Figma ↔ Cross-App Contract Matrix 2026

Dokumen ini mengikat komposisi screen dari Figma `ALL TEMBUS CUSTOMER` ke
kontrak runtime yang sudah menjadi source of truth di codebase. Figma hanya
menentukan hierarchy, copy, komponen, dan state visual; status order, harga,
ETA, assignment, pembayaran, settlement, dan proof tetap berasal dari backend.

## Cross-app ownership

| Surface | Owner | Kontrak utama |
| --- | --- | --- |
| Customer Android | `android-app-customer` | customer order/payment/tracking read model dan customer mutation |
| Merchant Android | `android-app-merchant` | merchant catalog, operating state, accept/ready/reject food order, settlement |
| Mitra/Courier Android | `android-app` | offer acceptance, canonical status transition, scan/POD, GPS, roadside report |
| Order backend | `backend/order-service` | canonical order state, quote snapshot, matching, tracking, chat bridge, roadside lifecycle |
| Merchant backend | `backend/merchant-service` | merchant capability/catalog/operating state dan merchant-owned food actions |
| Payment backend | `backend/payment-service` | wallet ledger, top-up, withdrawal, payment method catalog |
| Gateway | `backend/api-gateway` | authenticated routing dan identity propagation; bukan source of payment truth |

## Flow matrix

| Flow | Customer surface / route | Backend contract | Merchant surface | Mitra surface | Status |
| --- | --- | --- | --- | --- | --- |
| FLOW-03 Paket | `BookingScreen` → `PaymentScreen` → `TrackingScreen` | `/api/v1/customer/delivery-services`, `/api/v1/customer/orders/calculate-all`, `/api/v1/customer/orders`, `/api/v1/customer/orders/{id}/payment`; scheduled pickup uses `schedule_type/scheduled_at` and admin activation worker | N/A untuk on-demand parcel | offer accept after scheduled activation, `/api/v1/orders/status`, scan/POD, tracking sync | Contract wired locally; authenticated staging/device proof remaining |
| FLOW-04 Food | `FoodHome` → merchant detail → cart → checkout → tracking/rating | `/api/v1/food/merchants`, `/api/v1/food/merchants/{id}`, `/api/v1/orders/food/quote`, `/api/v1/orders/food`; quote/create revalidate merchant operating state, menu schedule/inventory, minimum order, expiry, and price fingerprint | `/api/v1/merchant/orders`, accept/ready/reject, unavailable/substitution | courier offer/status, pickup/POD, tracking | Customer contract and server edge validation wired locally; authenticated cross-app/device proof remaining |
| FLOW-05 Payment/wallet | `PaymentScreen`, profile wallet, top-up | order payment endpoints; `/api/v1/wallet/balance`, `/api/v1/wallet/topup`, `/api/v1/payment-methods` | merchant settlement/withdrawal | courier earnings/payout | Customer wallet top-up client, deterministic server idempotency/replay session, and provider invoice URL are wired locally; provider callback proof remains external |
| FLOW-06 Tambal ban | home → search/offer → service booking → service tracking/report/detail | nearby/capability, customer order create, `/api/v1/customer/service-report/tambal-ban?order_id=...`, adjustments, roadside aftercare | N/A | roadside availability, offer, service report/proof, adjustment proposal | Customer tracking refetches canonical snapshot and terminal status opens shared detail/aftercare; authenticated/device proof remaining |
| FLOW-07 Towing | category → subtype → booking → tracking/report/detail | same canonical order/payment/tracking plus `/api/v1/customer/service-report/towing?order_id=...` and towing claim | N/A | towing lifecycle, inspection/loading/transit/unloading, damage claim | Customer read route/ownership, stale tracking, and towing aftercare are aligned; authenticated/device proof remaining |
| FLOW-08 Communication | tracking/detail → chat/call/support/notification/safety-share | mobile chat/call bridge, notification center, support destination, safety/SOS, `POST /api/v1/customer/orders/{id}/safety-share`, `DELETE /api/v1/customer/safety-share/{tokenId}` | merchant chat where authorized | courier chat/call/SOS | Support and safety-share customer actions are wired; public share is minimum-data/read-only; deep-link, stale/offline, and device proof remaining |
| FLOW-09 Account | profile/address/referral/loyalty/security/privacy & terms | profile/address/referral/loyalty plus payment wallet, public market legal config, and `POST /api/v1/customer/security/pin` | merchant account separate | courier account separate | Customer legal-document route and server PIN-change contract are wired; device/legal browser/session-expiry proof remains |

## Canonical lifecycle expectations

1. Customer creates an order with one idempotency key and a server quote
   identity/snapshot.
2. Merchant-owned food orders are accepted/prepared by Merchant app; courier
   assignment and delivery status remain in Order backend and are consumed by
   Customer and Courier apps.
3. Parcel, tambal ban, and towing offers are accepted by Courier app through
   the canonical assignment/status contract; customer never manufactures
   `assigned`, `paid`, `arrived`, or `completed` locally.
4. Completion requires the applicable proof/report chain before settlement or
   aftercare is shown as successful.
5. Push/socket events are hints. Customer screens refetch the authoritative
   snapshot after a deep link, reconnect, or stale event.

## Known gaps tracked by UIUX-2026-008

- Customer wallet balance/top-up client and provider invoice URL are now exposed
  through the authenticated gateway and payment-service contract; the mobile
  client never constructs a provider URL from a token.
- The customer settlement Retrofit path now matches the backend's single
  `/api/v1/order/settlement` route and sends `order_id` in the request body.
- Server-side top-up retry/replay is implemented with a deterministic reference
  and migration-backed uniqueness; real provider callback behavior still needs
  authorized integration proof.
- Runtime gateway forwarding and authenticated staging responses are still not
  proven without a running authorized environment.
- Customer Profile's saved-address entry now has a dedicated `address-book`
  route, while parcel booking continues to consume the same address repository.
- Customer Profile's `Privasi & Ketentuan` entry consumes the existing public
  market-config contract; the app does not construct policy URLs from local
  document names or versions.
- Parcel scheduled pickup is now server-stateful across checkout, payment
  reconciliation, cancellation, activation worker, and courier dispatch; no
  client-side timer is treated as activation truth.
- Safety-share creation/revocation now returns and consumes the canonical token
  identity; the public link is read-only, expires server-side, and exposes only
  minimum order/status data. The customer app does not fabricate live coordinates
  or allow mutations through the shared URL.
- Customer account security now separates server-verified account/transaction PIN
  changes from local device PIN/biometric protection; the mobile client validates
  the six-digit confirmation flow and sends only the server contract fields.
- Emulator/device, authenticated staging, and provider callback evidence are
  not available in this workspace yet; those remain explicit verification
  gates, not assumptions.
