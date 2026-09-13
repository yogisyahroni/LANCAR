# Reputation signal contract

Reviews are immutable raw signals with subject, source, service, market, time,
confidence, review state, and signal version. Public rating responses must not
expose sensitive safety/risk reasons. Moderation writes a reasoned action and
does not automatically punish a subject from an allegation.

`reputation_signal_snapshots` is a recomputable, versioned aggregate projection
keyed by subject/service/market/time window. Merchant responses are separate
records and do not rewrite the original review. All moderation and response
mutations are role-gated, idempotent, and audited by the admin service.

Ratings are immutable after creation; a correction is a new governed signal,
not an in-place star overwrite. Review eligibility is derived from a completed
order and the participant relationship. Public aggregates hide samples below
five and never return moderation reasons or safety/risk evidence. Reports use
explicit categories (`HARASSMENT`, `SPAM`, `PII`, `FRAUD`, `SAFETY`, `OTHER`)
and remain investigation inputs until a reviewer decides their outcome.

The first governed release publishes policy version
`rating-edit-2026-09-12-v1` with a zero-hour edit window. Submitted stars,
dimensions and review body are immutable after creation; a correction uses the
appeal flow, preserving the original signal and recording reviewer, reason and
outcome rather than silently rewriting history.
