# Mobile reliability and release contract — PART AC

All customer, courier, and merchant builds use the machine-readable policy in
`scripts/mobile/performance_budgets.json` and the p95 verifier in
`scripts/mobile/verify_performance_report.py`. A report requires at least 20
raw samples per app/surface/tier; missing low/mid/high coverage fails the gate.

Startup keeps authentication, active-order recovery, and safety access on the
critical path. Campaign, analytics, remote config, maps, and other optional SDKs
are lazy/fail-open where safe. Network calls use bounded timeout, retry with
backoff, cancellation, and idempotency; only safe mutations are queued offline.
The UI distinguishes loading, slow, offline, retry, and permanent failure.

Release policy requires internal → alpha → beta → percentage rollout, with
crash/ANR, payment/order integrity, backend compatibility, and support
guardrails. Test coverage includes offline/reconnect, upgrade, process death,
network switching, low memory, accessibility, and golden screens. Physical
low/high/tablet/foldable evidence remains an external device follow-up when no
authorized device is connected.
