# TEMBUS Commerce Ads contract — 2026

This is the canonical contract for `sponsored_ad`. It is intentionally
separate from `platform_promo`, `merchant_promo` and `organic_rank`.

## Ownership

| Concern | Owner | Ads authority |
| --- | --- | --- |
| Paid campaign, eligibility, delivery, budget and billing event | Ads Service | Yes |
| Slot reservation and component presentation | Experience Service | No campaign or price mutation |
| Discount/price/financial eligibility | Promo/Pricing | Ads cannot create a discount |
| Food order state, ETA, rating, availability and serviceability | Food/Order/Review | Ads is read-only |

An entity may have a merchant promo and a sponsored campaign at the same
time. Their product types, ledger entries, disclosures and attribution are
never merged.

## Campaign and lifecycle

The canonical row is `promo_campaigns` with `product_type='ads'`. Ads-specific
execution tables are append-only evidence, not a duplicate campaign store.

`draft → validating → review → scheduled → active → paused → ended` is the
normal lifecycle. `rejected`, `budget_exhausted`, `payment_hold`, `suspended`
and `archived` are terminal/exception states with explicit audited transitions.

Drafts do not deliver or charge. Delivery requires `active`, approved creative,
an unexpired window, eligible merchant/catalog/context, and remaining budget.
The delivery query checks the window and budget on every request; stale cache
cannot serve an expired campaign.

## Inventory policy

Inventory is slot-based. The initial protected bounds are:

- Home first viewport: at most one sponsored module.
- Home: no adjacent sponsored modules and at least one organic module.
- Food discovery/search: sponsored density ceiling 25% over a rolling window,
  with minimum organic visibility.
- Checkout, payment, tracking, support/claim, Tambal/Towing booking/matching/
  active flow and aggregator carrier comparison: zero Ads.

Experience reserves a sponsored-capable slot; Ads selects at most the policy
maximum. Empty/error responses fall back to organic/house content. Experiments
cannot raise a protected bound without a maker-checker rollout and guardrail
review.

## Eligibility and auction

Before ranking, a candidate must pass merchant/branch active, open/serviceable
context, relevant intent, catalog availability, policy-approved creative,
active window/budget and risk gates. The auction uses
`bid × relevance × quality × contextual eligibility`, with campaign-id
ascending deterministic tie-break and `ads-auction-v1` audit context.

Spend never changes organic rating, ETA, price, availability or serviceability.
Cold-start merchants remain eligible when quality/relevance gates pass; large
historical spend is not a permanent quality shortcut.

## Money, delivery and events

Campaign currency is an explicit ISO code from market financial configuration;
it is never inferred from locale. `ads_billing_events` records immutable
campaign/account/placement/cost/currency/billing-model/version references.
The database row lock plus total/daily budget checks make reservation atomic.
The unique idempotency key makes replay safe. Invalid traffic is corrected by
an append-only credit/reversal, never by editing historical spend.

Delivery returns an HMAC-signed opaque `ad_delivery_token` bound to campaign,
creative, placement, campaign version, request hash and a two-minute expiry.
Clients cannot select a merchant or price. Impressions/clicks are accepted
only with a valid token and idempotency key; server viewability policy is the
source of billable truth. The public API gateway strips any client context
marker, verifies JWT identity, signs the internal request context and then
sets `X-Ads-Context-Resolved`. Direct Ads API calls without that signed
gateway context fail closed to organic content. Conversion attribution is a
separate internal order-service boundary: `POST
/internal/v1/ads/conversions` requires a payload-bound service signature,
validates the authoritative order state, joins the latest charged click
inside its immutable click-time window and enforces one charged conversion per
order.

For Customer Food v1, viewability is defined as the sponsored card's keyed
`LazyColumn` item being in the viewport continuously for at least 250 ms;
composition outside the viewport does not emit an impression. The server
still owns token validity, campaign freshness, idempotency and budget charge.

## Disclosure and data minimization

Every paid card uses a persistent `Sponsored / Iklan` label, present before
detail and outside merchant creative. Accessibility text identifies the paid
source. `Promo LANCAR` and merchant discount badges are separate semantics.
Allowed targeting is market/zone/service area, merchant relationship,
contextual intent, daypart, app version and a governed privacy-safe cohort.
Merchant views never expose individual customer identity or audience lists.

## Attribution, fraud and experiments

Default attribution is immutable `last_touch`, version `ads-last-touch-v1`,
with a seven-day window. Organic baseline is reported separately. Cancelled,
refunded and fraud-reviewed orders are not silently counted as healthy
conversion; server order events perform the join. ROAS is never derived from
client clicks alone.

Self-click/cadence/bot signals use bounded server hashes and can create an
auditable exclusion/credit review. Fake orders/clicks do not improve merchant
quality. Experiment assignment/exposure is stored separately from billable
impression and is always subordinate to protected ad-free zones and density.
The authenticated exposure endpoint is `POST /api/v1/ads/experiments/exposures`;
it accepts an opaque assignment hash and records an idempotent exposure without
charging a billable impression.

## Admin and merchant controls

Merchant APIs are owner-scoped. Merchant UI presents Promo and Iklan as two
products, labels reach as estimate, shows hard cap/billing model, prevents
closed/ineligible branch launch and exposes rejection/suspension reason.
Admin Ads Control Plane provides campaign moderation, suspension, inventory,
invalid-traffic, billing, analytics and audit views. Suspension requires actor,
reason, scope and optional expiry. High-blast policy changes require a second
approver/rollout record; ordinary marketing roles cannot exceed protected
global bounds.

## Reliability contract

Ads delivery has a two-second service timeout and gateway circuit/bulkhead
protection. Any Ads error returns organic fallback. Budget/charge is stronger
consistency than reporting. Checkout, payment and order paths do not depend on
Ads availability.
