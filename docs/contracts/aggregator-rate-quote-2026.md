# Aggregator Rate Quote Contract (2026)

`GET /api/v1/logistics/tariff` is a quote endpoint, not a price calculator in
the browser. The authenticated order service sends the canonical provider
route, actual weight, dimensions, item value/category, and supported
insurance/COD flags to the integration gateway.

The response returns one `quote_id` per native provider service. Each quote is
stored in `aggregator_rate_quotes` with the provider code, native service
code/name, chargeable weight, gross/net/customer tariff, ETA and its source,
rule version, and expiry. The native service code is never replaced by a
generic UI label.

Consumers must send the selected `aggregator_quote_id` when creating a 3PL
payment link. The order service rejects a missing, expired, or mismatched
quote; a merchant must request a new quote when review inputs or the rate
expire. This keeps the amount reviewed by the merchant equal to the amount
used during checkout/order creation.

An empty ETA is intentional when a provider does not return delivery timing.
The API does not invent a generic ETA. `eta_source=provider` is emitted only
when the carrier supplied the value.
