# TEMBUS Ads attribution and reporting contract

Historical reports carry `attribution_model`, `attribution_window_minutes`
and `attribution_version` from the campaign at event time. Those values are
immutable in `ads_billing_events` and `ads_campaign_revisions`.

The default model is last-touch (`ads-last-touch-v1`, 7 days). A single order
is attributed once under that model. Multi-touch requires an explicitly
versioned model before it can be enabled. Order joins are server-side and use
authoritative order lifecycle events; a client cannot send `conversion=true`
to manufacture a conversion.

Paid metrics are separate from organic baseline:

- impressions and viewable impressions;
- clicks and CTR;
- server-attributed orders and CVR;
- charged spend, CPC/CPO and attributed revenue;
- invalid/fraud-filtered amount and credited reversals;
- ROAS only from server order revenue and charged spend.

The conversion path is server-only: order-service signs
`{campaign_id, order_id, idempotency_key}` with `ADS_ORDER_EVENT_SECRET`; Ads
reads order status, created time and total from the authoritative `orders`
table rather than trusting client revenue or `conversion=true`.

Cancelled, refunded or fraud-confirmed orders are excluded or reversed by an
append-only correction according to the order state. Merchant dashboards show
definitions next to values; no client-only click counter is presented as ROAS.
