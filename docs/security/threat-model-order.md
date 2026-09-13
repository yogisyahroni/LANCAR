# Threat model — order and fulfilment

Canonical order state lives in `order-service`; clients, payment callbacks,
couriers, merchants, and admins are untrusted inputs at the boundary. Risks
include forged status/PoD, replayed mutation, location exposure, unsafe
reassignment, and insider override. Controls are authenticated state
transitions, idempotency, scoped location, audit, safety aggregate separation,
and compensating corrections. Re-review on state-machine, courier, location,
or admin changes; owner: Fulfilment/Security.

Review record: 2026-09-14 against commit `61bd269d`; high-risk remediation is
the authenticated/idempotent transition boundary, verified by the order
contract and authorization-negative test suites.
