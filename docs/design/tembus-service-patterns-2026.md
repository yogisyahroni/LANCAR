# TEMBUS non-Food service patterns — 2026

DS-2026-008 establishes one TEMBUS visual system with different information priority per service pattern. Service identity is expressed through the canonical icon, title, priority badge, and content order; it is not a separate mini-brand or arbitrary header treatment.

| Surface | First information | Shared TEMBUS building blocks | Protected state |
| --- | --- | --- | --- |
| Antar Barang / Aggregator | pickup → dropoff → package facts → route quote → provider comparison | `TembusServiceIdentityCard`, `TembusAddressCard`, `TembusRouteSummary`, `TembusPackageSummary`, `TembusCarrierRateCard`, `TembusQuoteBreakdown` | carrier provenance and availability are response data, never paid ranking |
| Tambal Ban | incident/location → technician capability → ETA → price | `TembusServiceIdentityCard`, `TembusTechnicianCard`, `TembusCarrierRateCard`, `TembusQuoteBreakdown` | shortest emergency path; no paid content in active service flow |
| Towing / Derek | safety → vehicle compatibility → pickup/dropoff → route → quote → consent | `TembusServiceIdentityCard`, `TembusSafetyNotice`, `TembusVehicleCard`, `TembusRouteSummary`, `TembusQuoteBreakdown`, `TembusRequoteApprovalCard` | safety and server quote consent outrank all discovery or monetization |

## Implementation boundary

- `TembusServicePatterns.kt` owns shared identity, ad-free notice, and service empty-state language.
- `TembusLogistics.kt` owns route, package, provider comparison, quote, safety, technician, proof, and re-quote primitives.
- `CourierPriceCard.kt` remains a compatibility adapter; its `TembusCarrierRateData` has no campaign, sponsored, or paid-ranking input.
- `validate-service-pattern-surfaces.mjs` guards active Tambal/Towing and Aggregator source surfaces against paid-inventory identifiers.

## Visual rules

- Use `MaterialTheme` semantic roles and TEMBUS typography/radius/button primitives.
- Use one calm surface/card language across service verticals; contextual priority is communicated with content and a semantic badge tone.
- Emergency and towing flows do not show promotional hero modules, ad cards, or paid ranking controls.
- An empty result uses the design-system icon state, never an emoji fallback.

## Scope note

This task standardizes the mobile route/state composition and source-level monetization boundary. Current-commit staging route smoke remains a release follow-up and external OTP/payment-provider behavior is intentionally not claimed.
