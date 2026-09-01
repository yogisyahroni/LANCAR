# Logistics provider adapter contract (2026)

## Purpose

The integration gateway owns provider credentials and upstream transport. A
provider adapter exposes only the operations it can perform. The gateway must
never synthesize an unsupported operation or make customer applications know
how a carrier is wired.

## Canonical provider identity

Every registered adapter implements `domain.LogisticsProvider`:

- `id`: stable internal identifier (`jne`, `jnt`)
- `code`: canonical provider code (`JNE`, `JNT`)
- `name`: display name (`JNE`, `J&T Express`)
- `capabilities`: explicit operation list

Provider-specific credentials, base URLs, circuit-breaker thresholds, retry
policy, and HTTP timeouts stay in the integration gateway process/configuration.
They are never returned by the provider catalog endpoint.

## Capability interfaces

Operational contracts are intentionally split:

| Capability | Interface | Current adapters |
|---|---|---|
| Tariff | `domain.TariffProvider` | JNE, JNT |
| Shipment/AWB | `domain.ShipmentProvider` | JNE, JNT |
| Tracking pull | `domain.TrackingPullProvider` | JNE, JNT |
| Tracking webhook, pickup, cancellation, label, POD, insurance, COD, return, claim | dedicated interfaces when implemented | none declared yet |

The orchestrator checks both the declared capability and the corresponding
interface. An unsupported operation returns an explicit error and does not
fall back to another provider or fabricate a result.

## Registry and routing

`provider.LogisticsRegistry` registers adapters once during gateway startup and
resolves by case-insensitive provider id, code, or name. The internal endpoint
`GET /api/internal/logistics/providers` returns the safe catalog used by
customer-facing service discovery. Tariff results include canonical provider
metadata while preserving each provider's native service code and service name.

The handler delegates tariff, shipment creation, and tracking pull to
`service.LogisticsOrchestrator`; it contains no provider switch. Adding a
provider requires registering its adapter and contract tests, without editing
customer applications, payment core, or generic order detail.

## Adapter onboarding checklist

- [ ] Implement `domain.LogisticsProvider` identity and declared capabilities.
- [ ] Implement only the capability interfaces supported by the provider.
- [ ] Keep credentials/configuration server-side and provider-prefixed.
- [ ] Use the shared retry helper and provider-specific circuit-breaker config.
- [ ] Preserve native service code/name in tariff responses.
- [ ] Add adapter HTTP fixtures and capability/registry tests.
- [ ] Add health/readiness diagnostics before enabling production traffic.
