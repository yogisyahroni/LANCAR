# Reputation signal contract

Reviews are immutable raw signals with subject, source, service, market, time,
confidence, review state, and signal version. Public rating responses must not
expose sensitive safety/risk reasons. Moderation writes a reasoned action and
does not automatically punish a subject from an allegation.

`reputation_signal_snapshots` is a recomputable, versioned aggregate projection
keyed by subject/service/market/time window. Merchant responses are separate
records and do not rewrite the original review. All moderation and response
mutations are role-gated, idempotent, and audited by the admin service.
