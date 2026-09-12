# Security and safety incident response — PART AD / SAFE

Severity is P0 (active safety/security or financial integrity), P1 (material
degradation or suspected exposure), P2 (contained issue), or P3 (routine).
P0 pages Security, Ops, Finance when payment/ledger is involved, and the named
service owner immediately; P1 pages the service owner and on-call; P2/P3 are
triaged in the queue. The incident record contains actor/order/service/market
snapshot, category, severity, timestamps, escalation state, evidence hashes,
and a correlation ID without raw credentials or unnecessary PII.

Response sequence: contain with a scoped/expiring kill switch or provider
health disable; preserve callbacks, active-order safety paths, and evidence;
collect redacted logs and immutable references; assess impact; communicate with
the approved template; remediate; reconcile financial/state divergence; then
write a timeline, root cause, action owners, due dates, and re-test evidence.

The safe fallback is explicit when an external SOS/notification provider is
unavailable. The API records the P0 incident and returns local emergency
instructions; it does not claim that a vendor call succeeded.
