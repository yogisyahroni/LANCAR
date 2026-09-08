# Logistics provider outage runbook

## Contain

1. Assign IC and Provider Operations owner; identify provider, capability and
   affected lanes.
2. Use the adapter's timeout, retry budget, circuit breaker and provider rate
   limit. Do not retry non-idempotent booking without the provider operation
   key.
3. Preserve provider-native references and raw payload hashes in the inbox;
   unknown events map to `UNKNOWN`, never to delivered/failed by guess.
4. Keep customer/courier state explicit: unavailable, pending reconciliation or
   retryable. Never fabricate AWB, tracking status, ETA or SLA.

## Recover and reconcile

1. Probe the provider after cooldown and run the fixture contract suite before
   reopening the capability.
2. Replay durable webhook/poll targets idempotently, dedupe by provider event
   and operation key, and compare AWB/status/settlement records.
3. Close only after unknown status count, queue/DLQ age and reconciliation
   mismatch return to threshold. Record escalation contact and postmortem work.

