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

Rating-pressure and off-platform-compensation signals are routed to the same
moderation queue as temporary investigation inputs. Coordinated-rating signals
are surfaced to Admin for human review; they do not automatically hide a review
or punish an actor. A material hide requires references to reviewed evidence,
and the action snapshot preserves those references for audit.

An appeal reversal republishes the governed review and creates a new
`reputation-v2` aggregate snapshot from the affected subject/service/market
scope. It never edits raw stars, dimensions or review body.

The first governed release publishes policy version
`rating-edit-2026-09-12-v1` with a zero-hour edit window. Submitted stars,
dimensions and review body are immutable after creation; a correction uses the
appeal flow, preserving the original signal and recording reviewer, reason and
outcome rather than silently rewriting history.
