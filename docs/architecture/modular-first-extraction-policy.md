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
