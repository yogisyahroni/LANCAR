# Universal Search & Discovery Contract — 2026

Search is a derivative projection. Merchant, catalog, operating-state, order,
Geo/routing and Promo/Ads services remain authoritative. A search document has
only identity, market/locale, lifecycle status, serviceability/geography,
open-state, source version and timestamps plus display text and a canonical
route. Price, ETA, rating, availability and discount are intentionally absent
from the projection; clients must fetch an authoritative snapshot before an
actionable checkout/order step.

## Query and eligibility

`q`, `market_code`, `locale`, optional service/open-now and optional saved/manual
coordinates are accepted by `GET /api/v1/search`. Intent routing is
discovery-only and preserves the original query in a versioned result envelope.
Market, locale, lifecycle status, service code, open-now and Geo serviceability
are applied before organic ranking. A result marked inactive/closed/outside the
requested serviceability context is never actionable. Precise location is
optional; market/manual area remains valid.

The organic ranker is `organic-v1`, independent of paid bids. Ads may provide a
separately labelled, capped slot list in a future integration; an Ads outage
means organic-only. The service returns a deterministic DB order when ranking
signals are unavailable.

Cold start is deterministic and fair: a new or small approved entity can rank
from text relevance, serviceability, open state, quality and freshness without
requiring historical conversions. Personalization is optional and has the same
non-personalized query path as its fallback; it never changes eligibility or
transactional truth.

## Freshness and rebuild

Index event ingestion is idempotent on `event_id` and guards source versions at
the document boundary. A rebuild writes a new `index_version` from authoritative
merchant/catalog snapshots and switches `search-read` in one transaction.
Producers should publish versioned catalog/operating-state events through the
existing outbox. The target freshness SLA for operational status is five
minutes; `indexed_at`, `updated_at` and query-event latency are the evidence
used to monitor it.

## Privacy and merchandising

Only a SHA-256 query hash and market/locale/intent/result metrics are retained
in analytics; raw query text is not stored. User history is scoped to the
authenticated user and can be deleted. Synonyms and merchandising rules are
market/locale scoped, reviewed, expiring and audited. Rules cannot mutate
transactional truth and preview uses the same discovery query path. Admin
quality metrics expose aggregate volume, zero-result rate, latency and index
age by entity type; they never expose raw query text.

## Compatibility and fallback

The response envelope is `search.v1`; unknown additive fields must be ignored by
older clients. Gateway failures return a bounded error so existing vertical
merchant discovery remains the fallback. No ambiguous query automatically
creates a cart, order, payment or other transaction.

The gateway reserves a separate finite search budget of 3,000 requests per IP
per minute, distinct from the broad 100 requests/minute API bucket, so the
bounded rollout profiles (25 QPS city and 50 QPS multi-city) are testable
without disabling abuse protection.
