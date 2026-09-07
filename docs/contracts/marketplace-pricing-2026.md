# Marketplace Pricing Contract 2026

`ECON-2026-001` uses one server-authoritative pricing snapshot for parcel and
Food quotes. The snapshot is retained in the existing Redis quote envelope and
copied into `orders.pricing_snapshot` at order creation.

## Policy and components

Every quote contains `pricing_rule_version` and `pricing_breakdown`. The
breakdown contains immutable components with a stable `code`, `kind`, and
`amount_idr`. The supported kinds are:

- `customer_charge`
- `customer_discount`
- `customer_adjustment`
- `merchant_gross`
- `merchant_commission`
- `merchant_subsidy`
- `courier_earning`

The server derives and validates:

```text
customer_total = customer_charges - customer_discounts + customer_adjustments
merchant_payable = merchant_gross - merchant_commission - merchant_subsidy
platform_amount = customer_total - merchant_payable - courier_earning
```

A quote is invalid if the customer total or merchant payable is negative, or
if derived totals no longer match the component list. Platform amount may be
negative when the platform funds a subsidy. Policy percentages are loaded from the active service product
(`platform_commission_percent`, `courier_payout_percent`) with bounded,
server-side fallbacks.

## Client and localization rules

Clients display server totals and component labels; they never calculate or
submit fees, commission, merchant payable, or courier earning. `LabelKey` and
component codes are financial semantics and remain stable. Presentation text
comes from `pricing_component_labels_default` or an optional
`pricing_component_labels_<market>` JSON config. Resolved labels are copied to
the quote snapshot so historical orders remain explainable after a later label
or policy change.
