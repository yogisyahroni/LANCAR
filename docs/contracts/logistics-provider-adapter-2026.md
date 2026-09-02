# Logistics Provider Adapter Contract — 2026

## Purpose

The integration gateway owns logistics-provider credentials, upstream transport, retries, circuit breakers, and provider-specific protocol details.

Customer, merchant, courier, payment, and generic order surfaces MUST consume canonical LANCAR contracts. They MUST NOT need carrier-specific credentials or transport logic.

A provider may advertise only capabilities that are backed by a concrete adapter. Unsupported operations fail explicitly; they must never fall back to fabricated data or an unrelated provider.

## Canonical provider identity

Provider registration uses `domain.ProviderRegistration` with a `domain.ProviderDescriptor`:

- `code` — stable canonical provider code, normalized by the registry;
- `name` — human-readable provider name;
- `capabilities` — explicit list of operations currently supported;
- `services` — optional native provider services when known;
- `tracking_mode` / `tracking_degraded` — runtime-safe tracking capability metadata.

Provider credentials, base URLs, timeouts, retry policy, circuit-breaker settings, secrets, and raw upstream configuration remain server-side and MUST NOT be exposed through the customer-facing provider catalog.

## Capability interfaces

The canonical capability interfaces live in `backend/integration-gateway/internal/domain/logistics_provider.go`.

| Capability | Interface / adapter slot |
|---|---|
| Tariff | `domain.TariffProvider` / `ProviderRegistration.Tariff` |
| Shipment / AWB | `domain.ShipmentProvider` / `ProviderRegistration.Shipment` |
| Tracking pull | `domain.TrackingPullProvider` / `ProviderRegistration.Tracking` |
| Tracking webhook | `domain.WebhookAdapter` / `ProviderRegistration.Webhook` |
| Pickup, cancellation, label, POD, insurance, COD, return, claim | Must remain unadvertised until a concrete interface and adapter are wired into registry validation |

`provider.LogisticsProviderRegistry.Validate()` is the fail-fast contract. If a descriptor declares a capability without a concrete adapter, registry validation fails and readiness must not report the provider as healthy.

## Registry and routing

`provider.NewLogisticsProviderRegistry()` owns active provider registrations.

The registry:

- normalizes provider codes;
- exposes safe descriptors through `List()`;
- resolves providers with `Get()`;
- rejects declared-but-unwired capabilities with `Validate()`;
- exposes non-secret readiness detail through `Diagnostics()`.

Current gateway startup registers JNE and J&T using `domain.ProviderRegistration`, then validates the complete registry before serving traffic.

The safe internal catalog is exposed through:

`GET /api/internal/logistics/providers`

Gateway readiness is exposed through:

`GET /ready`

Readiness/diagnostic output proves configuration and adapter wiring only. It MUST NOT be described as proof that a real upstream transaction succeeded.

## Provider response rules

Provider adapters must preserve provider-native identifiers needed for later operations, including native service codes, service names, AWB/reference identifiers, and tracking state details.

Canonical mapping happens at the integration boundary. Provider-native semantics must not leak into unrelated application modules.

Mocks and fixtures may prove parsing, mapping, retry behavior, signature validation, and failure handling. They do not prove real sandbox availability or real provider SLA.

## Adapter onboarding checklist

- [ ] Create/update adapter under `backend/integration-gateway/internal/provider`.
- [ ] Declare only capabilities with concrete implementations.
- [ ] Keep all credentials and provider transport configuration server-side.
- [ ] Preserve native service/AWB/tracking identifiers required by later calls.
- [ ] Use shared resilience behavior where applicable.
- [ ] Add deterministic adapter/registry tests and provider fixtures.
- [ ] Register the provider in `cmd/api/main.go`.
- [ ] Confirm `LogisticsProviderRegistry.Validate()` passes.
- [ ] Confirm `/ready` reports the registration as ready without exposing secrets.
- [ ] Perform real sandbox/staging validation before production enablement when external runtime proof is required by the release gate.

## Release boundary

Task-local adapter implementation may be proven by deterministic contract/integration tests when the original TASK-ID does not require live provider proof.

Production enablement remains a separate release concern. Missing sandbox/live credentials must never be worked around by static provider results, fake AWBs, fabricated tariff responses, or weakened readiness checks.
