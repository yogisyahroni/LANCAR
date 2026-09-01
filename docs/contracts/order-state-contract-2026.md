# Canonical Order State Contract 2026

Status: implemented locally by `CORE-2026-001`  
Contract version: `2026-09-01`

## Purpose

All order surfaces use the same service category and state envelope while
legacy flat fields remain available during the migration. A service code or
subtype describes a service detail; it never replaces the canonical category.

## Canonical categories

The only category values are:

- `package_on_demand`
- `food`
- `tambal_ban`
- `aggregator`
- `towing`

Unknown legacy values are returned as `service.category: null` with
`service.degraded: true`. Consumers must keep the order visible and use the
generic order state/detail presentation; they must not infer a new category.

## Envelope

```json
{
  "contract_version": "2026-09-01",
  "id": "order-id",
  "customer": { "id": "customer-id" },
  "service": {
    "category": "food",
    "service_code": "food_delivery",
    "service_sub_type": "food_delivery",
    "metadata": { "food": {} },
    "degraded": false
  },
  "order_state": { "status": "preparing", "state_version": 3 },
  "money_state": {
    "currency": "IDR",
    "total_price_idr": 42000,
    "payment_status": "paid"
  },
  "timestamps": { "created_at": "...", "updated_at": "..." },
  "actor_ownership": {
    "customer_id": "customer-id",
    "merchant_id": "merchant-id",
    "courier_id": "courier-id"
  },
  "quote_id": "quote-id",
  "correlation_id": "request-correlation-id"
}
```

## Typed metadata

- Parcel: category, description/image, dimensions, weight, package count.
- Food: merchant, item count when returned by the service, prep time, and
  contactless preference.
- Roadside/towing: subtype and structured vehicle/report facts. Tire,
  odometer, vehicle condition, material, and damage data are never required to
  be encoded only inside `item_description`.
- Aggregator: provider, service type, tariff, net cost, and AWB when known.

Metadata is populated from persisted facts only. Missing facts remain null or
absent; the mapper does not synthesize labels, IDs, prices, or vehicle data.

## Compatibility and rollout

Responses include both `order_contract` and the existing flat response fields.
The database migration adds `service_category`, `contract_version`, `quote_id`,
`state_version`, `correlation_id`, and JSONB `service_metadata`. Existing rows
are backfilled only when the legacy model/snapshot identifies a known category;
otherwise they remain degraded-safe.

`state_version` starts at 1 and increments when order status changes. Clients
may ignore unknown envelope fields and must not treat an unknown category as a
parcel or food order.
