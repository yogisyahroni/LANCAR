# CRM campaign accounting and experiment contract — 2026

CRM campaigns are an administrative projection over canonical customer, order,
communication and payment data. They do not become a second order, payment or
ledger source of truth.

## Governance

- Audience definitions accept only market, service-use, lifecycle, order-count,
  recency, locale, platform, consent and personalization flags.
- Consent is required for every marketing campaign. Raw email, phone, address,
  device, payment, health, demographic and precise-location attributes are not
  valid targeting dimensions.
- `budget_version` is required. A campaign with merchant funding also requires
  `merchant_agreement_version`.
- `budget_minor` is the promo budget. `promo_subsidy_minor` must equal that
  budget; `ads_spend_minor` is stored separately and is never included in the
  promo funding breakdown.
- Campaign publication is an audited, TOTP-protected state transition. Dispatch
  requires an approved Communication Platform template.

## Preview, exposure and conversion

`GET /admin/crm/campaigns/:id/preview` resolves the current eligible audience
without writing exposure or sending a notification. Its count is explicitly an
estimate and is not a conversion promise.

Dispatch writes an immutable treatment/holdout exposure. The same operation
publishes a pseudonymous `experiment.exposure` event to the existing event
outbox, with `billable_impression: false`. Treatment messages are created via
the canonical Communication Platform event/delivery tables and the existing
in-app notification projection. Provider failure is recorded as failed.

`POST /api/internal/crm/campaigns/:id/conversion` is service-authenticated and
accepts a conversion only when the order belongs to the customer and is in an
authoritative paid/fulfilment/completed state. It does not accept client revenue
or coupon-redemption claims.

`GET /admin/crm/campaigns/:id/metrics` reports treatment and holdout exposure,
completed orders and completed revenue from the canonical `orders` state. A
campaign cannot claim incrementality when it has no holdout cohort.

## Accounting

Per-order campaign reservations must carry the explicit platform/merchant/
membership/referral funding breakdown. The order-service boundary is
`POST /api/internal/crm/campaigns/:campaignId/orders/:orderId/reservation` and
derives customer and subsidy amount from the canonical order row; it accepts no
browser/customer request. Finance reconciliation is
`POST /admin/crm/reservations/:id/reconcile` and compares the reservation with
`orders.promo_subsidy_minor` (falling back to the legacy IDR projection), then
updates the reservation lifecycle and writes an auditable exception when the
amount or funding split differs. It never mutates provider or payment history.

OTP and live payment-provider behavior remain vendor-dependent staging follow-up
and are not represented by CRM campaign metrics.
