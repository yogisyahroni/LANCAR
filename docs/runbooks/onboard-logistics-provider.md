# Onboard a logistics provider

1. Create an adapter in `backend/integration-gateway/internal/provider`.
2. Implement `domain.LogisticsProvider` identity and declare only the
   capability interfaces the upstream provider actually supports.
3. Keep credentials, base URL, timeout, retry, and circuit-breaker settings in
   server-side environment/configuration. Never add them to customer clients.
4. Preserve native service/status identifiers and map them to canonical
   fields at the integration boundary.
5. Add HTTP fixtures for rate, shipment/AWB, tracking, errors, timeout,
   duplicate events, and unknown status. Run the reusable capability matrix
   test before registration.
6. Register the adapter in `cmd/api/main.go`; startup validation rejects a
   capability that has been advertised without an implementation.
7. Add health/readiness diagnostics and verify sandbox credentials in staging
   before enabling production traffic. The internal diagnostics endpoint is
   `GET /api/internal/logistics/providers/health`; it reports configuration
   readiness only and must not be interpreted as an upstream transaction test.

## Release gate

The provider is not production-ready until catalog, health/readiness, rate,
shipment, tracking, error/retry, and unknown-status scenarios pass in
authenticated staging. A missing external credential is a deployment blocker,
not a reason to add a fake provider or static result.
