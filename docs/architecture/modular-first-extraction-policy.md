# Modular-first extraction policy — PART AG

The default change is a module inside the owning bounded service. A new service
requires a written decision covering independent scaling, availability/failure
isolation, security/compliance boundary, ownership, deployment cadence, or
materially independent data/operational complexity. The decision must include
the API/event contract, migration/backfill, observability, deployment and
rollback, access model, owner/on-call, capacity, and deprecation plan.

Payment orchestration and safety remain in their existing bounded services for
this milestone. Provider adapters are interfaces/registries, not a new
microservice. A service-shaped folder, endpoint, or container without a
runtime owner and failure/recovery semantics does not satisfy extraction.

## W–AG extraction decision record

No new microservice was introduced for the W–AG work. Reputation, CRM,
membership lifecycle, campaign scheduling, safety evidence and control-room
changes remain in their existing owners (`admin-service`, `order-service`,
`payment-service`, `integration-gateway` and the release/CI boundary). This
avoids a distributed transaction for order/payment/loyalty state and keeps the
existing staging deployment topology unchanged.

Any future extraction PR must attach the following before merge:

1. the concrete scaling, availability, security, ownership, cadence or data
   boundary that the current module cannot satisfy;
2. API/event contract and migration/backfill plan;
3. observability, access model, deployment, rollback and deprecation plan;
4. named owner/on-call, capacity and failure-mode review.
